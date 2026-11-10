import type { AppEvent } from '../../shared/app-events'
import { choosePlan, pickMs, PET_TIMING } from '../../shared/pet/pet-behavior'
import {
  bubbleSlot,
  hitShape,
  hopRoom,
  isOver,
  petBox,
  petWindowRect
} from '../../shared/pet/pet-frame'
import { jumpVelocity, PHYSICS, stepAir, throwVelocity } from '../../shared/pet/pet-physics'
import { reactionFor, type PetReaction } from '../../shared/pet/pet-reactions'
import { WALK_SPEED, type PetSettings } from '../../shared/pet/pet-settings'
import {
  PET_WINDOW,
  type PetFace,
  type PetLook,
  type PetPose,
  type PetProp,
  type PetView
} from '../../shared/pet/pet-view'
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
  /** 앱 일(복사·되돌리기·가져오기 실패)에 반응한다. 숨긴 동안(설정·전체 화면)은 무시한다 */
  react(e: AppEvent): void
  /** 말풍선을 눌렀다: 닫고 반응을 끝낸다 */
  bubbleClick(): void
  /** 렌더러가 잰 말풍선 사각형(창 좌표). 클릭 판정에 더하고, null이면 뺀다 */
  bubbleRect(r: Rect | null): void
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
/** 움직임 줄이기에서 클릭하면 폴짝 대신 이만큼(ms) 웃는다(움직임 없는 클릭 표시) */
export const REDUCED_CLICK_FACE_MS = 600
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
  /** 지금 쉼을 시작한 시각과 길이(ms). 숨길 때 남은 시간을 잰다 */
  let restAt = 0
  let restWait = 0
  /** 숨길 때 남은 쉼(ms). 다시 표시하면 이어 간다 */
  let restLeft: number | null = null
  let sleepTimer: unknown = null

  /**
   * 지금 보이는 반응(설계 §14-2 "앱과 연결"). 표정·소품·cue를 덮어쓰고 말풍선을 띄운다(자세 유지).
   * restLeft: 앉아 있던 쉼의 남은 시간(반응 동안 멈췄다 이어 간다)
   */
  let reacting: { r: PetReaction; restLeft: number | null } | null = null
  /** 들림·공중·뛰어오르기·꼭대기로 올라서기 동안 온 마지막 반응. 바닥·꼭대기·옆면에 선 뒤 보인다(Review Focus 5) */
  let pending: PetReaction | null = null
  let bubbleSeq = 0
  /** 렌더러가 잰 말풍선 사각형(창 좌표). 클릭 판정에 쓴다 */
  let bubbleHit: Rect | null = null
  /**
   * 반응 시간 타이머. 쉼 타이머 자리를 쓴다: 반응하는 동안 쉼(다음 계획·뛰어내리기)은 멈추므로 둘이 함께 돌지 않는다
   * (가만히·앉기·오르기 중 반응도 반응·졸기·조회 3개)
   */
  let holdTimer: unknown = null
  /** 움직임 줄이기 클릭 표시(웃는 얼굴)가 끝나는 시각. 새 타이머 없이 커서 조회가 되돌린다 */
  let clickFaceUntil: number | null = null

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

  /** 움직임 줄이기 클릭 표시가 아직 보이는지(시계가 뒤로 갔으면 끝난 것으로 본다) */
  function clickFaceActive(): boolean {
    if (clickFaceUntil === null) return false
    const t = now()
    return t < clickFaceUntil && t >= clickFaceUntil - REDUCED_CLICK_FACE_MS
  }

  /** 반응 동안 표정·소품을 덮어쓴다(자세·선글라스는 그대로). 반응이 없으면 움직임 줄이기 클릭 표시(웃음) */
  function look(): PetLook {
    const props: PetProp[] = []
    if (masking !== 'off') props.push('sunglasses')
    if (mode === 'sleep') props.push('zzz')
    let face = faceOf()
    if (reacting) {
      face = reacting.r.face
      for (const p of reacting.r.props) if (!props.includes(p)) props.push(p)
    } else if (clickFaceActive()) face = 'happy'
    return { pose: POSE[mode], face, props, facing, cue, cueSeq }
  }

  const screenBox = (): Rect => petBox(foot, size())

  /** 말풍선(창 좌표). 자리는 그릴 때마다 지금 자리로 다시 계산한다(앉은 채 바를 옮기면 따라간다) */
  function bubbleView(box: Rect, win: Rect): PetView['bubble'] {
    const text = reacting?.r.bubble
    if (!text) return null
    const s = bubbleSlot({ box, window: win, bounds: world!.bounds, hop: hopRoom(size()) })
    return {
      seq: bubbleSeq,
      text,
      side: s.side,
      slot: { x: s.rect.x - win.x, y: s.rect.y - win.y, width: s.rect.width, height: s.rect.height }
    }
  }

  function currentView(): PetView {
    const box = screenBox()
    const win = placed ?? petWindowRect(box, world!.bounds)
    // Task 8: 메뉴(menu)·조종(controlling)이 여기에 들어온다
    return {
      size: cfg.size,
      box: { x: box.x - win.x, y: box.y - win.y },
      look: look(),
      bubble: bubbleView(box, win),
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

  /** 몸 모양과 말풍선(렌더러가 잰 사각형, 창 → 화면 좌표). Task 8: 메뉴 사각형을 여기에 더한다 */
  function hitRects(): (Rect | null)[] {
    const rects: (Rect | null)[] = hitShape(POSE[mode], screenBox(), facing === 'left')
    if (bubbleHit && placed && reacting?.r.bubble) {
      rects.push({
        x: placed.x + bubbleHit.x,
        y: placed.y + bubbleHit.y,
        width: bubbleHit.width,
        height: bubbleHit.height
      })
    }
    return rects
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

  function hitDelay(): number {
    // 졸 때는 느리게 조회한다. 다만 클릭을 받고 있으면(커서가 몸 위) 깨어 있을 때 주기로 조회해
    // 커서가 나간 뒤 0.1초 안에 클릭 통과로 되돌린다(Review Focus 1)
    if (mode === 'sleep' && ignoring !== false) return PET_LOOP.hitSleepMs
    const c = lastCursor
    const r = placed
    if (!c || !r) return PET_LOOP.hitFarMs
    const p = PET_LOOP.nearPad
    const near =
      c.x >= r.x - p && c.x < r.x + r.width + p && c.y >= r.y - p && c.y < r.y + r.height + p
    return near ? PET_LOOP.hitNearMs : PET_LOOP.hitFarMs
  }

  /** 조회 주기. 움직임 줄이기 클릭 표시가 있으면 끝나는 시각에 맞춰 한 번 더 조회한다(새 타이머 없이 되돌린다) */
  function pollDelay(): number {
    const base = hitDelay()
    if (clickFaceUntil === null) return base
    const left = clickFaceUntil - now()
    return Number.isFinite(left) ? Math.min(base, Math.max(0, left)) : base
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
    const faceEnded = clickFaceUntil !== null && !clickFaceActive()
    if (faceEnded) clickFaceUntil = null
    if (mode !== before) settle()
    else {
      if (faceEnded) render()
      schedulePoll()
    }
  }

  /** 반응 동안 오르기는 멈춘다(옆면에 붙은 채 반응하고, 끝나면 이어 오른다) */
  const loopNeeded = (): boolean =>
    shown &&
    (pressed !== null ||
      mode === 'walk' ||
      mode === 'leap' ||
      (mode === 'climb' && reacting === null) ||
      mode === 'air' ||
      mode === 'held')

  /** 반응을 보일 수 있는 자세: 바닥에 서기, 꼭대기에 앉기, 옆면에 붙어 오르기(꼭대기로 올라서는 300ms는 제외) */
  const canReact = (): boolean =>
    mode === 'idle' || mode === 'sit' || (mode === 'climb' && stepUp === null)

  /** 상태에 맞게 동작 고리 또는 조회 타이머 하나만 남기고 화면을 맞춘다. 저장한 반응은 설 수 있게 되면 여기서 보인다 */
  function settle(): void {
    if (!shown || disposed) return
    if (pending && canReact()) {
      const r = pending
      pending = null
      startReaction(r)
    }
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
    restAt = now()
    restWait = wait
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
    // 반응 중에는 졸지 않는다(반응이 끝나면 다시 확인한다)
    if (reacting === null && (mode === 'idle' || mode === 'walk' || mode === 'sit')) fallAsleep()
    else sleepDue = true
  }

  // ---- 반응(설계 §14-2 "앱과 연결", Review Focus 5) ----

  function clearHold(): void {
    if (holdTimer !== null) T.clearTimeout(holdTimer)
    holdTimer = null
  }

  /** 쉼(가만히의 다음 계획·앉기의 뛰어내리기)을 멈추고 남은 시간을 돌려준다. 시계가 뒤로 갔으면 끝난 것으로 본다 */
  function pauseRest(): number | null {
    if (restTimer === null) return null
    const elapsed = now() - restAt
    const left = elapsed >= 0 ? Math.max(0, restWait - elapsed) : 0
    clearRest()
    return left
  }

  /**
   * 반응을 보인다: 쉼을 멈추고 그 자리에서 반응 타이머 하나로 holdMs를 잰다. 새 반응은 이전 반응을 대체한다
   * (seq + 1, 타이머 다시 시작). 렌더러가 새 말풍선을 잴 때까지 옛 말풍선 사각형으로 클릭을 막지 않는다.
   */
  function startReaction(r: PetReaction): void {
    const left = reacting ? reacting.restLeft : pauseRest()
    clearHold()
    clearRest()
    reacting = { r, restLeft: mode === 'sit' ? left : null }
    bubbleHit = null
    clickFaceUntil = null
    if (r.bubble !== null) bubbleSeq += 1
    if (r.cue && !reduced) {
      cue = r.cue
      cueSeq += 1
    }
    holdTimer = T.setTimeout(
      () => {
        holdTimer = null
        if (!shown || disposed) return
        finishReaction()
      },
      Math.max(0, r.holdMs)
    )
    d.log('pet.react', { kind: r.kind, bubble: r.bubble !== null })
  }

  /** 반응을 지운다(타이머·말풍선 판정 포함). 하던 일은 부르는 쪽이 정한다 */
  function endReaction(): { r: PetReaction; restLeft: number | null } | null {
    const was = reacting
    reacting = null
    bubbleHit = null
    clearHold()
    return was
  }

  /**
   * 반응 시간이 끝났거나 말풍선을 눌렀다: 가만히였으면 새 계획, 앉아 있었으면 남은 쉼, 오르던 중이면 다시 오른다.
   * 말풍선이 사라졌으므로 커서를 한 번 조회해 몸 밖이면 바로 클릭 통과로 되돌린다(Review Focus 1).
   */
  function finishReaction(): void {
    const was = endReaction()
    if (!was) return
    if (mode === 'idle') plan()
    else if (mode === 'sit') rest(was.restLeft ?? pickMs(PET_TIMING.sitMs, d.random()))
    if (sleepDue) sleepCheck()
    const c = d.cursor()
    lastCursor = c
    hitTest(c)
    settle()
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
    // 떨어지면(바가 없어짐 등) 보이던 반응은 끝난다
    endReaction()
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
    const asleep = mode === 'sleep'
    // 다른 모니터 바닥으로 옮기면 보이던 반응은 끝난다
    endReaction()
    foot = floorMiddle(world!, size())
    enterIdle(pickMs(PET_TIMING.idleMs, d.random()))
    // 자던 펫을 다른 모니터 바닥 가운데로 옮기면 깬다(깸으로 기록)
    if (asleep) logState('wake')
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
    const since = lastBarAt === null ? null : now() - lastBarAt
    const p = choosePlan({
      activity: cfg.activity,
      world: w,
      footX: foot.x,
      // 시계가 뒤로 갔으면(음수·NaN) 바 방문 보장이 된 것으로 본다(한 시간씩 바에 가지 않는 일이 없게)
      sinceBarMs: since === null ? null : since >= 0 ? since : PET_TIMING.barEveryMs,
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
    // 집어 들면 반응은 끝나고(놀란 얼굴), 움직임 줄이기 클릭 표시도 지운다. 저장해 둔 반응은 내려놓은 뒤 보인다
    endReaction()
    clickFaceUntil = null
    clearRest()
    setMode('held')
    walk = null
    stepUp = null
    vx = vy = 0
    samples = []
    // 클릭 → 집어 던지기 → 500ms 안의 클릭은 더블클릭이 아니라 새 클릭이다
    lastClickAt = null
  }

  function click(t: number): void {
    // 시계가 뒤로 갔으면(음수·NaN) 더블클릭 시간이 지난 것으로 본다(팔레트가 저절로 열리지 않게)
    const gap = lastClickAt === null ? NaN : t - lastClickAt
    if (gap >= 0 && gap < GESTURE.doubleMs) {
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
    } else if (reacting === null && Number.isFinite(t)) {
      // 움직임 줄이기: 폴짝 대신 잠깐 웃어 클릭을 받았다고 보인다(반응 중이면 반응 얼굴이 이긴다)
      clickFaceUntil = t + REDUCED_CLICK_FACE_MS
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
    // 누른 시간이 음수·NaN(시계가 뒤로 감)이면 클릭 시간이 지난 것으로 본다
    const held = t - p.at
    const still = Math.hypot(c.x - p.x, c.y - p.y) <= GESTURE.dragThreshold
    if (held >= 0 && held < GESTURE.clickMaxMs && still) click(t)
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
          // 반응 동안 멈춘다(누르고 있어 동작 고리가 돌 때도)
          if (reacting === null) stepClimb(dt)
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
      // 꼭대기에서 자던 펫은 떨어지며 깬다(깸으로 기록)
      if (mode === 'sleep') logState('wake')
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
    const otherDisplay = prev === null || prev.displayId !== w.displayId
    if (onTop()) followTop(prev, w)
    else if (mode === 'climb') followSide(prev, w)
    else if (mode === 'leap') retargetLeap(w)
    else if (mode === 'walk' && walk?.bar)
      walk = w.side ? { to: w.side.x, bar: true } : { to: walk.to, bar: false }
    // 들린 펫은 다음 프레임에 새 모니터 안으로 자른다. 공중의 펫은 같은 모니터면 stepAir가 새 벽·바닥으로 맞춘다
    if (mode === 'held') return
    const onFloor = mode === 'idle' || mode === 'walk' || (mode === 'sleep' && sleepOn === 'floor')
    if (otherDisplay && (onFloor || mode === 'air')) {
      // 바가 다른 모니터로 가면 그 모니터 바닥 가운데에 선다(다른 모니터로 걸어가지 않는다)
      toFloorMiddle()
      return
    }
    if (onFloor) {
      // 같은 모니터의 바닥 변화(작업 표시줄 위치·크기, 해상도): x는 새 범위 안으로 자르고 새 바닥에 선다.
      // 상태는 그대로다(자던 펫은 계속 자고, 걷던 펫은 잘린 목적지로 간다)
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
    // 숨긴 펫은 반응하지 않는다: 보이던 반응을 끝내고 저장한 반응도 버린다. 앉아 있던 쉼은 남은 시간을 이어 간다
    const reactedRest = reacting && mode === 'sit' ? reacting.restLeft : null
    endReaction()
    pending = null
    clickFaceUntil = null
    let left: number | null = null
    if (restTimer !== null) {
      // 시계가 뒤로 갔으면(음수·NaN) 쉼이 끝난 것으로 본다(다시 표시한 뒤 한 시간씩 앉아 있지 않게)
      const elapsed = now() - restAt
      left = elapsed >= 0 ? Math.max(0, restWait - elapsed) : 0
    }
    clearRest()
    restLeft = left ?? reactedRest
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
      // 반응을 끄면 보이던 반응도 끝나고, 말풍선을 끄면 떠 있던 말풍선이 닫힌다(저장한 반응도 버린다)
      if (!cfg.reactions || (!cfg.bubbles && pending?.bubble)) pending = null
      if (shown && reacting && (!cfg.reactions || (!cfg.bubbles && reacting.r.bubble !== null)))
        finishReaction()
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
    react(e) {
      if (disposed || !shown || !world) return
      const r = reactionFor(e, { reactions: cfg.reactions, bubbles: cfg.bubbles })
      if (!r) return
      // 들림·공중·뛰어오르기·꼭대기로 올라서기: 마지막 하나만 두었다가 바닥·꼭대기·옆면에 선 뒤 보인다
      if (!canReact() && mode !== 'walk' && mode !== 'sleep') {
        pending = r
        return
      }
      // 졸고 있으면 깬 뒤, 걷고 있으면 멈춘 뒤 반응한다(오르기는 반응 동안 멈춘다)
      if (mode === 'sleep') wake()
      else if (mode === 'walk') {
        setMode('idle')
        walk = null
        vx = vy = 0
      }
      startReaction(r)
      settle()
    },
    bubbleClick() {
      if (disposed || !shown || !reacting || reacting.r.bubble === null) return
      finishReaction()
    },
    bubbleRect(r) {
      if (disposed || !shown) return
      if (r === null) {
        bubbleHit = null
        return
      }
      // 말풍선이 없을 때 온(늦은) 사각형·잘못된 사각형은 무시한다(보이지 않는 곳이 클릭을 막지 않게)
      if (!reacting || reacting.r.bubble === null) return
      if (!allFinite(r.x, r.y, r.width, r.height) || r.width <= 0 || r.height <= 0) return
      const x = clamp(r.x, 0, PET_WINDOW.width)
      const y = clamp(r.y, 0, PET_WINDOW.height)
      bubbleHit = {
        x,
        y,
        width: Math.min(r.width, PET_WINDOW.width - x),
        height: Math.min(r.height, PET_WINDOW.height - y)
      }
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
      if (disposed) return
      disposed = true
      // 몸짓을 멈추고(들린 펫은 놓는다) 타이머를 지운다
      pressed = null
      samples = []
      if (mode === 'held') enterAir({ vx: 0, vy: 0 }, 'surprised')
      endReaction()
      pending = null
      stopLoop()
      stopPoll()
      clearRest()
      clearSleepTimer()
      // 클릭을 막는 창을 남기지 않는다(숨긴 펫은 숨길 때 이미 통과로 돌렸다)
      if (shown) {
        ignoring = true
        d.window.setIgnoreMouse(true)
      }
      shown = false
      placed = null
    }
  }
}
