import { choosePlan, pickMs, PET_TIMING } from '../../shared/pet/pet-behavior'
import { hitShape, isOver, petBox, petWindowRect } from '../../shared/pet/pet-frame'
import { jumpVelocity, PHYSICS, stepAir, throwVelocity } from '../../shared/pet/pet-physics'
import { WALK_SPEED, type PetSettings } from '../../shared/pet/pet-settings'
import type { PetFace, PetLook, PetPose, PetProp, PetView } from '../../shared/pet/pet-view'
import { PET_BASELINE, type PetWorld } from '../../shared/pet/pet-world'
import type { MaskingMode, Rect } from '../../shared/types'
import type { Timers } from '../timers'

export type PetMode = 'idle' | 'walk' | 'leap' | 'climb' | 'sit' | 'air' | 'held' | 'sleep'

export interface PetWindowPort {
  setBounds(r: Rect): void
  showInactive(): void
  hide(): void
  send(v: PetView): void
  setIgnoreMouse(ignore: boolean): void
}

export interface PetStatus {
  mode: PetMode
  /** 발 가운데(화면 DIP) */
  foot: { x: number; y: number }
  /** 공중·뛰어오르기의 속도(DIP/초). 그 밖에는 0 */
  velocity: { vx: number; vy: number }
  shown: boolean
  /** 펫 창 화면 사각형. 숨긴 동안 null */
  window: Rect | null
}

export interface PetController {
  start(): void
  refresh(): void
  worldChanged(): void
  setFullscreen(on: boolean): void
  press(down: boolean): void
  status(): PetStatus
  view(): PetView | null
  dispose(): void
}

export interface PetControllerDeps {
  window: PetWindowPort
  /** 바가 있는 모니터의 세계. 디스플레이가 없으면 null */
  world(size: number): PetWorld | null
  settings(): PetSettings
  masking(): MaskingMode
  systemReducedMotion(): boolean
  cursor(): { x: number; y: number }
  /** 마우스 버튼이 하나라도 눌렸는지. Win32가 없으면 null */
  mouseButtonDown(): boolean | null
  idleSeconds(): number
  openPalette(): void
  timers: Timers
  now(): number
  random(): number
  log(event: string, data: Record<string, unknown>): void
}

/** 동작 고리와 커서 조회 주기(ms), 조회를 빠르게 하는 창 둘레(DIP) */
export const PET_LOOP = {
  frameMs: 34,
  hitNearMs: 34,
  hitFarMs: 100,
  hitSleepMs: 250,
  nearPad: 120
} as const
/** 끌기 시작 거리(DIP), 클릭·더블클릭 시간(ms), 놓침으로 보는 연속 버튼 조회 수 */
export const GESTURE = {
  dragThreshold: 4,
  clickMaxMs: 500,
  doubleMs: 500,
  releasePolls: 2
} as const
export const CLIMB_SPEED_RATIO = 0.75
export const STEP_UP_MS = 300
/** 바 꼭대기에서 뛰어내리는 속도. vx는 바 반대쪽으로 */
export const JUMP_DOWN = { vx: 240, vy: -520 } as const
/** 바닥과 옆면 아래 끝의 틈이 몸 크기의 이 배율보다 크면 뛰어올라 붙는다 */
export const LEAP_MIN_GAP = 0.5
/** 들린 펫은 커서가 64 격자 (32, 4)에 오도록 발을 커서 아래 54칸에 둔다 */
const HOLD_DROP = 54 / 64
/** 던진 속도 계산에 남기는 커서 표본 수(34ms × 8 > 100ms 창) */
const MAX_SAMPLES = 8

type Point = { x: number; y: number }
type HideReason = 'setting' | 'fullscreen' | 'no-display'
/** pet.state로 남기는 일. walk·idle은 남기지 않는다 */
type StateEvent = 'climb' | 'sit' | 'sleep' | 'wake' | 'held' | 'land'

const POSE: Record<PetMode, PetPose> = {
  idle: 'stand',
  walk: 'walk',
  leap: 'air',
  climb: 'climb',
  sit: 'sit',
  air: 'air',
  held: 'held',
  sleep: 'sleep'
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)
const sameRect = (a: Rect | null, b: Rect): boolean =>
  a !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
const allFinite = (...v: number[]): boolean => v.every(Number.isFinite)

/**
 * 바닥에서 발이 다닐 수 있는 x 범위. 서 있는 몸 높이까지 내려오는 바(꼭대기에 자리가 없는 긴 바 등)는
 * 장애물이라 바 안쪽 면에서 끊는다(걸어서 지나가지 않는다).
 */
export function floorSpan(w: PetWorld, size: number): { lo: number; hi: number } {
  let lo = w.minX
  let hi = w.maxX
  const bar = w.bar
  if (bar) {
    const r = bar.rect
    if (r.y < w.floorY && r.y + r.height > w.floorY - PET_BASELINE * size) {
      if (bar.edge === 'right') hi = Math.min(hi, r.x - size / 2)
      else lo = Math.max(lo, r.x + r.width + size / 2)
    }
  }
  return { lo, hi: Math.max(lo, hi) }
}

/** 바닥 가운데 `((minX + maxX)/2, floorY)`. 장애물이 막고 있으면 다닐 수 있는 곳으로 민다 */
export function floorMiddle(w: PetWorld, size: number): Point {
  const s = floorSpan(w, size)
  return { x: clamp((w.minX + w.maxX) / 2, s.lo, s.hi), y: w.floorY }
}

/** 발이 이 세계(바가 있는 모니터 안, 천장과 바닥 사이)에 있는지 */
function onWorld(p: Point, w: PetWorld): boolean {
  const b = w.bounds
  const e = 0.5
  return p.x >= b.x - e && p.x <= b.x + b.width + e && p.y >= w.topY - e && p.y <= w.floorY + e
}

/**
 * 말랑 메이트 상태 기계(설계 §14-2). 창·세계·설정·커서·시계·난수를 주입받는 순수 모듈이다.
 * 움직이는 동안(walk·leap·climb·air·held, 꼭대기로 올라서는 300ms, 누르고 있는 동안)만 34ms 동작 고리를 돌리고,
 * 그 밖에는 커서 조회 타이머 하나로 클릭 통과만 맞춘다. 숨긴 동안에는 타이머가 없다.
 */
export function createPetController(d: PetControllerDeps): PetController {
  const T = d.timers

  let cfg: PetSettings = d.settings()
  let masking: MaskingMode = d.masking()
  let reduced = cfg.reduceMotion || d.systemReducedMotion()

  let started = false
  let disposed = false
  let shown = false
  let everShown = false
  let fullscreen = false
  /** 마지막으로 반영한 세계(숨긴 동안에는 바꾸지 않는다) */
  let world: PetWorld | null = null

  let mode: PetMode = 'idle'
  let foot: Point = { x: 0, y: 0 }
  let vx = 0
  let vy = 0
  let bounced = false
  let facing: 'left' | 'right' = 'right'
  let airFace: PetFace = 'normal'
  /** 걷는 목적지. bar면 옆면 아래(side.x)로 가서 오른다 */
  let walk: { to: number; bar: boolean } | null = null
  /** 꼭대기로 올라서기 시작한 뒤 지난 ms(오르는 중이면 null) */
  let stepUp: number | null = null
  let sleepOn: 'floor' | 'top' = 'floor'
  /** 잠든 뒤 커서가 몸 밖에 한 번 있었는지(이미 몸 위에 있던 커서로는 깨지 않는다) */
  let wakeArmed = false
  /** 졸 시간이 됐지만 오르기·공중·들림이라 미뤘다(바닥이나 꼭대기에 서면 다시 확인) */
  let sleepDue = false
  let cue: PetLook['cue'] = null
  let cueSeq = 0
  /** 바 꼭대기를 마지막으로 떠난 시각. 시작·깬 뒤 아직 가지 않았으면 null */
  let lastBarAt: number | null = null
  let lastClickAt: number | null = null
  let pressed: { at: number; x: number; y: number; misses: number } | null = null
  let samples: { t: number; x: number; y: number }[] = []

  let ignoring: boolean | null = null
  let placed: Rect | null = null
  let sentKey: string | null = null
  let lastCursor: Point | null = null

  let loopTimer: unknown = null
  let lastFrame: number | null = null
  let pollTimer: unknown = null
  let restTimer: unknown = null
  let restDue = 0
  /** 숨길 때 남은 쉼(ms). 다시 표시하면 이어 간다 */
  let restLeft: number | null = null
  let sleepTimer: unknown = null

  const now = (): number => d.now()
  const size = (): number => cfg.size

  function readInputs(): void {
    cfg = d.settings()
    masking = d.masking()
    reduced = cfg.reduceMotion || d.systemReducedMotion()
  }

  // ---- 모습과 화면 값 ----

  function faceOf(): PetFace {
    switch (mode) {
      case 'leap':
      case 'climb':
        return 'up'
      case 'sit':
        return 'content'
      case 'held':
        return 'surprised'
      case 'sleep':
        return 'asleep'
      case 'air':
        return airFace
      default:
        return 'normal'
    }
  }

  function look(): PetLook {
    const props: PetProp[] = []
    if (masking !== 'off') props.push('sunglasses')
    if (mode === 'sleep') props.push('zzz')
    return { pose: POSE[mode], face: faceOf(), props, facing, cue, cueSeq }
  }

  const screenBox = (): Rect => petBox(foot, size())

  function currentView(): PetView {
    const box = screenBox()
    const win = placed ?? petWindowRect(box, world!.bounds)
    // Task 7·8: 말풍선(bubble)·메뉴(menu)·조종(controlling)이 여기에 들어온다
    return {
      size: cfg.size,
      box: { x: box.x - win.x, y: box.y - win.y },
      look: look(),
      bubble: null,
      menu: null,
      controlling: false,
      reduceMotion: reduced
    }
  }

  /** 창 사각형이 바뀌었을 때만 옮기고, 화면 값이 바뀌었을 때만 보낸다 */
  function render(): void {
    if (!shown || !world) return
    const win = petWindowRect(screenBox(), world.bounds)
    if (!sameRect(placed, win)) {
      placed = win
      d.window.setBounds(win)
    }
    const v = currentView()
    const key = JSON.stringify(v)
    if (key === sentKey) return
    sentKey = key
    d.window.send(v)
  }

  function logState(event: StateEvent): void {
    const box = screenBox()
    d.log('pet.state', {
      mode: event,
      box,
      window: world ? petWindowRect(box, world.bounds) : null
    })
  }

  // ---- 클릭 통과 ----

  function hitRects(): (Rect | null)[] {
    // Task 7·8: 말풍선·메뉴 사각형(화면 좌표)을 여기에 더한다
    return hitShape(POSE[mode], screenBox(), facing === 'left')
  }

  function setIgnore(ignore: boolean): void {
    if (ignoring === ignore) return
    ignoring = ignore
    d.window.setIgnoreMouse(ignore)
  }

  /** 커서가 몸 위면 클릭을 받고 밖이면 통과시킨다. 누르거나 든 동안은 받는다. 잠든 펫은 커서가 들어오면 깬다 */
  function hitTest(c: Point): void {
    let over = pressed !== null || mode === 'held' || isOver(c, hitRects())
    if (mode === 'sleep') {
      if (!over) wakeArmed = true
      else if (wakeArmed) {
        wake()
        over = isOver(c, hitRects())
      }
    }
    setIgnore(!over)
  }

  // ---- 타이머 ----

  function stopLoop(): void {
    if (loopTimer !== null) T.clearInterval(loopTimer)
    loopTimer = null
    lastFrame = null
  }

  function stopPoll(): void {
    if (pollTimer !== null) T.clearTimeout(pollTimer)
    pollTimer = null
  }

  function pollDelay(): number {
    if (mode === 'sleep') return PET_LOOP.hitSleepMs
    const c = lastCursor
    const r = placed
    if (!c || !r) return PET_LOOP.hitFarMs
    const p = PET_LOOP.nearPad
    const near =
      c.x >= r.x - p && c.x < r.x + r.width + p && c.y >= r.y - p && c.y < r.y + r.height + p
    return near ? PET_LOOP.hitNearMs : PET_LOOP.hitFarMs
  }

  function schedulePoll(): void {
    stopPoll()
    pollTimer = T.setTimeout(pollTick, pollDelay())
  }

  /** 움직이지 않는 동안의 커서 조회. 반복되는 일이라 기록하지 않고, 상태가 바뀔 때만 다시 그린다 */
  function pollTick(): void {
    pollTimer = null
    if (!shown || disposed) return
    const c = d.cursor()
    lastCursor = c
    const before = mode
    hitTest(c)
    if (mode !== before) settle()
    else schedulePoll()
  }

  const loopNeeded = (): boolean =>
    shown &&
    (pressed !== null ||
      mode === 'walk' ||
      mode === 'leap' ||
      mode === 'climb' ||
      mode === 'air' ||
      mode === 'held')

  /** 상태에 맞게 동작 고리 또는 조회 타이머 하나만 남기고 화면을 맞춘다 */
  function settle(): void {
    if (!shown || disposed) return
    if (loopNeeded()) {
      stopPoll()
      if (loopTimer === null) {
        const t = now()
        lastFrame = Number.isFinite(t) ? t : null
        loopTimer = T.setInterval(frame, PET_LOOP.frameMs)
      }
    } else {
      stopLoop()
      if (pollTimer === null) schedulePoll()
    }
    render()
  }

  function clearRest(): void {
    if (restTimer !== null) T.clearTimeout(restTimer)
    restTimer = null
    restLeft = null
  }

  /** 가만히·앉기의 남은 시간. 끝나면 가만히는 다음 계획, 앉기는 뛰어내리기 */
  function rest(ms: number): void {
    clearRest()
    const wait = Number.isFinite(ms) ? Math.max(0, ms) : 0
    restDue = now() + wait
    restTimer = T.setTimeout(() => {
      restTimer = null
      if (!shown || disposed) return
      if (mode === 'idle') plan()
      else if (mode === 'sit') jumpDown()
      settle()
    }, wait)
  }

  const sleepNeedMs = (): number => cfg.sleepAfterMin * 60_000

  function clearSleepTimer(): void {
    if (sleepTimer !== null) T.clearTimeout(sleepTimer)
    sleepTimer = null
  }

  /** 졸기 확인 타이머 하나(표시·깸 뒤 sleepAfterMin분, 모자라면 남은 시간 뒤) */
  function armSleep(ms = sleepNeedMs()): void {
    clearSleepTimer()
    sleepDue = false
    if (!shown || disposed) return
    sleepTimer = T.setTimeout(() => {
      sleepTimer = null
      if (!shown || disposed || mode === 'sleep') return
      sleepCheck()
      settle()
    }, ms)
  }

  function sleepCheck(): void {
    sleepDue = false
    const raw = d.idleSeconds()
    const idleMs = Number.isFinite(raw) && raw > 0 ? raw * 1000 : 0
    const need = sleepNeedMs()
    if (idleMs < need) {
      armSleep(need - idleMs)
      return
    }
    if (mode === 'idle' || mode === 'walk' || mode === 'sit') fallAsleep()
    else sleepDue = true
  }

  // ---- 상태 바꾸기(타이머·화면은 바깥에서 settle이 맞춘다) ----

  function setMode(next: PetMode): void {
    // 잠에서 벗어나면 졸기 확인을 다시 시작한다(깸·떨어짐·바닥 가운데로 옮김)
    if (mode === 'sleep' && next !== 'sleep') armSleep()
    mode = next
  }

  function enterIdle(ms: number): void {
    setMode('idle')
    walk = null
    stepUp = null
    vx = vy = 0
    rest(ms)
    if (sleepDue) sleepCheck()
  }

  function enterSit(): void {
    setMode('sit')
    walk = null
    stepUp = null
    vx = vy = 0
    rest(pickMs(PET_TIMING.sitMs, d.random()))
    logState('sit')
    if (sleepDue) sleepCheck()
  }

  function enterAir(v: { vx: number; vy: number }, face: PetFace): void {
    clearRest()
    setMode('air')
    walk = null
    stepUp = null
    vx = Number.isFinite(v.vx) ? v.vx : 0
    vy = Number.isFinite(v.vy) ? v.vy : 0
    // Task 2: stepAir는 bounced를 돌려줄 뿐이라 새로 떨어질 때마다 여기서 다시 시작한다
    bounced = false
    airFace = face
    if (vx !== 0) facing = vx > 0 ? 'right' : 'left'
  }

  const onTop = (): boolean => mode === 'sit' || (mode === 'sleep' && sleepOn === 'top')

  /** 꼭대기에서 떠나면(뛰어내림·떨어짐·집어 듦) 바 방문이 끝난 것으로 친다 */
  function leaveTop(): void {
    if (onTop()) lastBarAt = now()
  }

  function toFloorMiddle(): void {
    foot = floorMiddle(world!, size())
    enterIdle(pickMs(PET_TIMING.idleMs, d.random()))
  }

  function clampFloorX(x: number): number {
    const s = floorSpan(world!, size())
    return clamp(x, s.lo, s.hi)
  }

  function startWalk(to: number, bar: boolean): void {
    if (!Number.isFinite(to)) {
      enterIdle(pickMs(PET_TIMING.idleMs, d.random()))
      return
    }
    clearRest()
    setMode('walk')
    walk = { to, bar }
    if (to !== foot.x) facing = to > foot.x ? 'right' : 'left'
  }

  function plan(): void {
    const w = world!
    const p = choosePlan({
      activity: cfg.activity,
      world: w,
      footX: foot.x,
      sinceBarMs: lastBarAt === null ? null : now() - lastBarAt,
      random: d.random
    })
    if (p.kind === 'idle') enterIdle(p.ms)
    else if (p.kind === 'walk') startWalk(clampFloorX(p.x), false)
    else if (w.side) startWalk(w.side.x, true)
    else enterIdle(pickMs(PET_TIMING.idleMs, d.random()))
  }

  function startClimb(): void {
    const side = world!.side!
    setMode('climb')
    vx = vy = 0
    stepUp = null
    facing = side.wall
    logState('climb')
  }

  /** 옆면 아래(side.x)에 도착: 틈이 크면 뛰어올라 붙고, 아니면 바로 오른다 */
  function arriveAtBar(): void {
    const w = world!
    const side = w.side
    if (!side) {
      enterIdle(pickMs(PET_TIMING.idleMs, d.random()))
      return
    }
    foot = { x: side.x, y: foot.y }
    const gap = w.floorY - side.bottom
    if (gap > LEAP_MIN_GAP * size()) {
      setMode('leap')
      vx = 0
      vy = jumpVelocity(gap)
      facing = side.wall
    } else startClimb()
  }

  function jumpDown(): void {
    const w = world!
    const wall = w.side?.wall ?? w.bar?.edge ?? 'right'
    leaveTop()
    enterAir({ vx: wall === 'right' ? -JUMP_DOWN.vx : JUMP_DOWN.vx, vy: JUMP_DOWN.vy }, 'normal')
  }

  function land(): void {
    if (!reduced) {
      cue = 'land'
      cueSeq += 1
    }
    logState('land')
    enterIdle(pickMs(PET_TIMING.idleMs, d.random()))
  }

  function fallAsleep(): void {
    sleepOn = mode === 'sit' ? 'top' : 'floor'
    setMode('sleep')
    walk = null
    clearRest()
    clearSleepTimer()
    wakeArmed = false
    logState('sleep')
  }

  /** 바닥이면 가만히, 꼭대기면 앉기. 깬 뒤 첫 계획은 바 오르기다 */
  function wake(): void {
    lastBarAt = null
    if (sleepOn === 'top' && world?.ledge) {
      setMode('sit')
      rest(pickMs(PET_TIMING.sitMs, d.random()))
    } else {
      setMode('idle')
      rest(PET_TIMING.firstIdleMs)
    }
    logState('wake')
  }

  // ---- 몸짓 ----

  function hold(c: Point, t: number): void {
    const w = world!
    const s = size()
    const b = w.bounds
    foot = {
      x: clamp(c.x, b.x + s / 2, b.x + b.width - s / 2),
      y: clamp(c.y + HOLD_DROP * s, w.topY, w.floorY)
    }
    samples.push({ t, x: c.x, y: c.y })
    if (samples.length > MAX_SAMPLES) samples.shift()
  }

  function pickUp(): void {
    leaveTop()
    clearRest()
    setMode('held')
    walk = null
    stepUp = null
    vx = vy = 0
    samples = []
  }

  function click(t: number): void {
    if (lastClickAt !== null && t - lastClickAt < GESTURE.doubleMs) {
      lastClickAt = null
      d.log('pet.click', { kind: 'double' })
      d.openPalette()
      return
    }
    lastClickAt = t
    if (mode === 'walk') enterIdle(pickMs(PET_TIMING.idleMs, d.random()))
    if (!reduced) {
      cue = 'hop'
      cueSeq += 1
    }
    d.log('pet.click', { kind: 'hop' })
  }

  /** press(false) 또는 버튼 조회 두 번 연속 false. 들고 있었으면 던지고, 아니면 클릭인지 본다 */
  function release(c: Point, t: number): void {
    const p = pressed!
    pressed = null
    if (mode === 'held') {
      // 놓은 순간부터 날아간다(다음 프레임 dt를 놓은 시각부터 잰다)
      if (Number.isFinite(t)) lastFrame = t
      hold(c, t)
      const v = throwVelocity(samples, t)
      samples = []
      enterAir(v, 'surprised')
      return
    }
    if (t - p.at < GESTURE.clickMaxMs && Math.hypot(c.x - p.x, c.y - p.y) <= GESTURE.dragThreshold)
      click(t)
  }

  /** 프레임마다: 놓침 확인(들린 동안·누른 동안), 끌기 시작. 놓았으면 'released' */
  function gesture(c: Point, t: number): 'released' | 'picked' | null {
    const p = pressed
    if (!p) return null
    const down = d.mouseButtonDown()
    p.misses = down === false ? p.misses + 1 : 0
    if (p.misses >= GESTURE.releasePolls) {
      release(c, t)
      return 'released'
    }
    if (mode !== 'held' && Math.hypot(c.x - p.x, c.y - p.y) > GESTURE.dragThreshold) {
      pickUp()
      return 'picked'
    }
    return null
  }

  // ---- 동작 고리 ----

  function stepWalk(dt: number): void {
    const w = walk
    if (!w) {
      enterIdle(pickMs(PET_TIMING.idleMs, d.random()))
      return
    }
    const step = WALK_SPEED[cfg.activity] * dt
    const dx = w.to - foot.x
    if (Math.abs(dx) <= step) {
      foot = { x: w.to, y: foot.y }
      walk = null
      if (w.bar) arriveAtBar()
      else enterIdle(pickMs(PET_TIMING.idleMs, d.random()))
      return
    }
    foot = { x: foot.x + Math.sign(dx) * step, y: foot.y }
    facing = dx > 0 ? 'right' : 'left'
  }

  /** stepAir 없이 세로 등가속만 계산하고 정점에서 옆면 아래 끝에 붙는다 */
  function stepLeap(dt: number): void {
    const side = world!.side
    if (!side) {
      enterAir({ vx: 0, vy: 0 }, 'surprised')
      return
    }
    const g = PHYSICS.gravity
    const y = foot.y + vy * dt + 0.5 * g * dt * dt
    vy += g * dt
    if (vy >= 0 || y <= side.bottom) {
      foot = { x: side.x, y: side.bottom }
      startClimb()
      return
    }
    foot = { x: side.x, y }
  }

  function stepUpFoot(): Point {
    const side = world!.side!
    const ledge = world!.ledge!
    const k = clamp((stepUp ?? 0) / STEP_UP_MS, 0, 1)
    return { x: side.x + (ledge.cx - side.x) * k, y: side.top + (ledge.y - side.top) * k }
  }

  function stepClimb(dt: number): void {
    const w = world!
    const side = w.side
    const ledge = w.ledge
    if (!side || !ledge) {
      enterAir({ vx: 0, vy: 0 }, 'surprised')
      return
    }
    if (stepUp === null) {
      const y = foot.y - WALK_SPEED[cfg.activity] * CLIMB_SPEED_RATIO * dt
      if (y > side.top) {
        foot = { x: side.x, y }
        return
      }
      foot = { x: side.x, y: side.top }
      stepUp = 0
      return
    }
    stepUp += dt * 1000
    if (stepUp >= STEP_UP_MS) {
      foot = { x: ledge.cx, y: ledge.y }
      enterSit()
      return
    }
    foot = stepUpFoot()
  }

  function stepFall(dt: number): void {
    const r = stepAir({ x: foot.x, y: foot.y, vx, vy }, dt, world!, {
      size: size(),
      bounced,
      reduceMotion: reduced
    })
    foot = { x: r.body.x, y: r.body.y }
    vx = r.body.vx
    vy = r.body.vy
    bounced = r.bounced
    if (vx !== 0) facing = vx > 0 ? 'right' : 'left'
    if (r.contact === 'ledge') enterSit()
    else if (r.contact === 'floor') land()
  }

  function frame(): void {
    if (!shown || disposed || !world) return
    const t = now()
    // dt는 유한한 0~0.1초만 쓴다(Math.max(NaN, 0)은 NaN이라 따로 거른다)
    let dt = lastFrame === null || !Number.isFinite(t) ? 0 : (t - lastFrame) / 1000
    if (!Number.isFinite(dt) || dt < 0) dt = 0
    dt = Math.min(dt, PHYSICS.maxDt)
    if (Number.isFinite(t)) lastFrame = t
    const c = d.cursor()
    lastCursor = c
    const g = gesture(c, t)
    if (g !== 'released') {
      switch (mode) {
        case 'walk':
          stepWalk(dt)
          break
        case 'leap':
          stepLeap(dt)
          break
        case 'climb':
          stepClimb(dt)
          break
        case 'air':
          stepFall(dt)
          break
        case 'held':
          hold(c, t)
          break
        default:
          break
      }
    }
    if (g === 'picked') logState('held')
    if (!allFinite(foot.x, foot.y, vx, vy)) toFloorMiddle()
    hitTest(c)
    settle()
  }

  // ---- 세계 변화 ----

  /** 앉거나 꼭대기에서 자는 펫: 새 꼭대기를 따라가고, 없어지면 그 자리에서 떨어진다 */
  function followTop(prev: PetWorld | null, w: PetWorld): void {
    const l = w.ledge
    if (!l) {
      leaveTop()
      enterAir({ vx: 0, vy: 0 }, 'surprised')
      return
    }
    const old = prev?.ledge
    const x = old ? foot.x + (l.cx - old.cx) : l.cx
    foot = { x: clamp(x, l.x1, l.x2), y: l.y }
  }

  /** 오르는 펫: 옆면을 따라 옮기고(위 끝 기준), 옆면이 없어지면 떨어진다 */
  function followSide(prev: PetWorld | null, w: PetWorld): void {
    const side = w.side
    if (!side || !w.ledge) {
      enterAir({ vx: 0, vy: 0 }, 'surprised')
      return
    }
    facing = side.wall
    if (stepUp !== null) {
      foot = stepUpFoot()
      return
    }
    const dy = prev?.side ? side.top - prev.side.top : 0
    const y = foot.y + dy
    const lowest = Math.min(w.floorY, side.bottom + LEAP_MIN_GAP * size())
    if (y > lowest) {
      enterAir({ vx: 0, vy: 0 }, 'surprised')
      return
    }
    foot = { x: side.x, y: Math.max(side.top, y) }
  }

  /** 뛰어오르는 펫: 새 옆면 아래 끝까지 남은 높이로 속도를 다시 맞추고, 이미 지났으면 바로 붙는다 */
  function retargetLeap(w: PetWorld): void {
    const side = w.side
    if (!side || !w.ledge) {
      enterAir({ vx: 0, vy: 0 }, 'surprised')
      return
    }
    facing = side.wall
    const h = foot.y - side.bottom
    if (h > 0) {
      foot = { x: side.x, y: foot.y }
      vy = jumpVelocity(h)
      return
    }
    foot = { x: side.x, y: clamp(foot.y, side.top, side.bottom) }
    startClimb()
  }

  function applyWorld(w: PetWorld): void {
    const prev = world
    world = w
    if (mode === 'sit' || (mode === 'sleep' && sleepOn === 'top')) followTop(prev, w)
    else if (mode === 'climb') followSide(prev, w)
    else if (mode === 'leap') retargetLeap(w)
    else if (mode === 'walk' && walk?.bar)
      walk = w.side ? { to: w.side.x, bar: true } : { to: walk.to, bar: false }
    if (mode === 'held') return
    if (!onWorld(foot, w)) {
      toFloorMiddle()
      return
    }
    if (mode === 'idle' || mode === 'walk' || (mode === 'sleep' && sleepOn === 'floor')) {
      foot = { x: clampFloorX(foot.x), y: w.floorY }
      if (walk && !walk.bar) walk = { to: clampFloorX(walk.to), bar: false }
    }
  }

  // ---- 표시 ----

  function show(w: PetWorld): void {
    shown = true
    if (!everShown) {
      everShown = true
      world = w
      setMode('idle')
      foot = floorMiddle(w, size())
      lastBarAt = null
      rest(PET_TIMING.firstIdleMs)
    } else {
      const left = restLeft
      applyWorld(w)
      if ((mode === 'idle' || mode === 'sit') && restTimer === null) {
        rest(left ?? pickMs(mode === 'sit' ? PET_TIMING.sitMs : PET_TIMING.idleMs, d.random()))
      }
    }
    restLeft = null
    placed = null
    sentKey = null
    lastCursor = null
    wakeArmed = false
    // 표시는 늘 클릭 통과에서 시작한다(조회 한 번 안에 몸 위만 받게 된다)
    ignoring = true
    d.window.setIgnoreMouse(true)
    render()
    d.window.showInactive()
    if (mode !== 'sleep') armSleep()
    d.log('pet.visibility', { visible: true, reason: null })
    d.log('pet.show', { display: w.displayId, scale: w.scale, window: placed })
    settle()
  }

  function hide(reason: HideReason): void {
    if (pressed) pressed = null
    samples = []
    if (mode === 'held') enterAir({ vx: 0, vy: 0 }, 'surprised')
    let left: number | null = null
    if (restTimer !== null) {
      const l = restDue - now()
      left = Number.isFinite(l) ? Math.max(0, l) : null
    }
    clearRest()
    restLeft = left
    clearSleepTimer()
    sleepDue = false
    stopLoop()
    stopPoll()
    shown = false
    ignoring = true
    d.window.setIgnoreMouse(true)
    d.window.hide()
    placed = null
    sentKey = null
    d.log('pet.visibility', { visible: false, reason })
  }

  /**
   * 표시 조건(설정 보이기·전체 화면 아님·디스플레이 있음)을 보고 표시·숨김·세계 반영을 한다.
   * 설정이나 전체 화면으로 숨긴 동안에는 세계를 읽지도 반영하지도 않고, 다시 표시할 때 새 세계로 한 번 확인한다
   * (바와 함께 숨었다 돌아온 펫이 바 없는 중간 세계 때문에 떨어지지 않게).
   */
  function evaluate(): void {
    let reason: HideReason | null = null
    let w: PetWorld | null = null
    if (!cfg.visible) reason = 'setting'
    else if (fullscreen) reason = 'fullscreen'
    else {
      w = d.world(cfg.size)
      if (!w) reason = 'no-display'
    }
    if (reason !== null) {
      if (shown) hide(reason)
      return
    }
    if (!shown) {
      show(w!)
      return
    }
    applyWorld(w!)
    settle()
  }

  return {
    start() {
      if (disposed || started) return
      started = true
      readInputs()
      evaluate()
    },
    refresh() {
      if (disposed) return
      const sleepMin = cfg.sleepAfterMin
      readInputs()
      if (!started) return
      evaluate()
      if (shown && mode !== 'sleep' && cfg.sleepAfterMin !== sleepMin) armSleep()
    },
    worldChanged() {
      if (disposed || !started) return
      evaluate()
    },
    setFullscreen(on) {
      if (disposed || on === fullscreen) return
      fullscreen = on
      if (started) evaluate()
    },
    press(down) {
      if (disposed || !shown || !world) return
      const t = now()
      if (down) {
        if (pressed) return
        if (mode === 'sleep') wake()
        const c = d.cursor()
        lastCursor = c
        pressed = { at: t, x: c.x, y: c.y, misses: 0 }
        setIgnore(false)
      } else {
        if (!pressed) return
        const c = d.cursor()
        lastCursor = c
        release(c, t)
      }
      settle()
    },
    status: () => ({
      mode,
      foot: { ...foot },
      velocity: { vx, vy },
      shown,
      window: shown && placed ? { ...placed } : null
    }),
    view: () => (shown && world ? currentView() : null),
    dispose() {
      disposed = true
      pressed = null
      stopLoop()
      stopPoll()
      clearRest()
      clearSleepTimer()
    }
  }
}
