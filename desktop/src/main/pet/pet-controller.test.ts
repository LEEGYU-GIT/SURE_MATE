import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { AppEvent } from '../../shared/app-events'
import { PET_TIMING } from '../../shared/pet/pet-behavior'
import { PET_CONTROL_GUIDE } from '../../shared/pet/pet-copy'
import {
  bubbleHop,
  bubbleSlot,
  hitShape,
  hopRoom,
  menuSlot,
  petBox
} from '../../shared/pet/pet-frame'
import { jumpVelocity } from '../../shared/pet/pet-physics'
import { DEFAULT_PET_SETTINGS, type PetSettings } from '../../shared/pet/pet-settings'
import { SLOT, type PetView } from '../../shared/pet/pet-view'
import { petWorld, type PetBar, type PetWorld } from '../../shared/pet/pet-world'
import type { MaskingMode, MonitorInfo, Rect } from '../../shared/types'
import { globalTimers } from '../bar/test-timers'
import { FLYOUT_TIMING } from '../flyout/flyout-controller'
import {
  CONTROL,
  createPetController,
  GESTURE,
  PET_LOOP,
  REDUCED_CLICK_FACE_MS,
  STEP_UP_MS,
  type PetController,
  type PetMode
} from './pet-controller'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const MAIN: MonitorInfo = {
  id: '1',
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  scaleFactor: 1,
  isPrimary: true,
  isInternal: false
}
const RIGHT_BAR: PetBar = { rect: { x: 1864, y: 292, width: 56, height: 456 }, edge: 'right' }
const LEFT_BAR: PetBar = { rect: { x: 0, y: 292, width: 56, height: 456 }, edge: 'left' }
const FLOOR_WINDOW: Rect = { x: 800, y: 805, width: 320, height: 240 }
const SIT_BOX: Rect = { x: 1864, y: 241.25, width: 56, height: 56 }

/** 시험이 바꾸는 바깥 값(모니터·바·설정·커서·버튼·입력 없는 시간·난수·시계) */
type Env = {
  monitor: MonitorInfo
  bar: PetBar | null
  display: boolean
  settings: PetSettings
  masking: MaskingMode
  systemReduced: boolean
  cursor: { x: number; y: number }
  buttons: boolean | null
  idle: number
  random: number
  clock: (() => number) | null
  /** 조종을 시작할 때 앞에 있던 창(HWND 10진 문자열). Win32가 없으면 null */
  foreground: string | null
}

type Harness = {
  c: PetController
  env: Env
  window: {
    setBounds: Mock<(r: Rect) => void>
    showInactive: Mock<() => void>
    hide: Mock<() => void>
    send: Mock<(v: PetView) => void>
    setIgnoreMouse: Mock<(ignore: boolean) => void>
    setFocusable: Mock<(f: boolean) => void>
    focus: Mock<() => void>
  }
  cursor: Mock<() => { x: number; y: number }>
  idleSeconds: Mock<() => number>
  world: Mock<(size: number) => PetWorld | null>
  openPalette: Mock<() => void>
  foreground: Mock<() => string | null>
  restoreFocus: Mock<(hwnd: string) => boolean>
  setVisible: Mock<(v: boolean) => Promise<void>>
  openSettings: Mock<() => void>
  log: Mock<(event: string, data: Record<string, unknown>) => void>
  /** setBounds를 부른 시각들 */
  boundsAt: number[]
}

function make(
  o: {
    bar?: PetBar | null
    settings?: Partial<PetSettings>
    masking?: MaskingMode
    random?: number
    /** 런타임의 설정 저장(기본: 바로 성공) */
    setVisible?: (v: boolean) => Promise<void>
  } = {}
): Harness {
  const env: Env = {
    monitor: MAIN,
    bar: o.bar === undefined ? RIGHT_BAR : o.bar,
    display: true,
    settings: { ...DEFAULT_PET_SETTINGS, ...o.settings },
    masking: o.masking ?? 'restore',
    systemReduced: false,
    cursor: { x: 100, y: 100 },
    buttons: null,
    idle: 0,
    random: o.random ?? 0.5,
    clock: null,
    foreground: '1001'
  }
  const boundsAt: number[] = []
  const window = {
    setBounds: vi.fn<(r: Rect) => void>(() => void boundsAt.push(Date.now())),
    showInactive: vi.fn<() => void>(),
    hide: vi.fn<() => void>(),
    send: vi.fn<(v: PetView) => void>(),
    setIgnoreMouse: vi.fn<(ignore: boolean) => void>(),
    setFocusable: vi.fn<(f: boolean) => void>(),
    focus: vi.fn<() => void>()
  }
  const cursor = vi.fn(() => ({ ...env.cursor }))
  const idleSeconds = vi.fn(() => env.idle)
  const world = vi.fn((size: number) => (env.display ? petWorld(env.monitor, env.bar, size) : null))
  const openPalette = vi.fn<() => void>()
  const foreground = vi.fn(() => env.foreground)
  const restoreFocus = vi.fn<(hwnd: string) => boolean>(() => true)
  const setVisible = vi.fn<(v: boolean) => Promise<void>>(o.setVisible ?? (() => Promise.resolve()))
  const openSettings = vi.fn<() => void>()
  const log = vi.fn<(event: string, data: Record<string, unknown>) => void>()
  const c = createPetController({
    window,
    world,
    settings: () => env.settings,
    masking: () => env.masking,
    systemReducedMotion: () => env.systemReduced,
    cursor,
    mouseButtonDown: () => env.buttons,
    idleSeconds,
    openPalette,
    foreground,
    restoreFocus,
    setVisible,
    openSettings,
    timers: globalTimers(),
    now: () => (env.clock ? env.clock() : Date.now()),
    random: () => env.random,
    log
  })
  return {
    c,
    env,
    window,
    cursor,
    idleSeconds,
    world,
    openPalette,
    foreground,
    restoreFocus,
    setVisible,
    openSettings,
    log,
    boundsAt
  }
}
type T = Harness

const mode = (t: T): PetMode => t.c.status().mode
const foot = (t: T): { x: number; y: number } => t.c.status().foot
const look = (t: T): PetView['look'] => t.c.view()!.look
const states = (t: T): string[] =>
  t.log.mock.calls.filter(([e]) => e === 'pet.state').map(([, d]) => (d as { mode: string }).mode)
const stateLog = (t: T, m: string): { mode: string; box: Rect; window: Rect } =>
  t.log.mock.calls.find(
    ([e, d]) => e === 'pet.state' && (d as { mode: string }).mode === m
  )![1] as {
    mode: string
    box: Rect
    window: Rect
  }
const lastIgnore = (t: T): boolean | undefined => t.window.setIgnoreMouse.mock.lastCall?.[0]

/** 한 프레임(34ms)씩 진행하며 조건을 기다린다 */
function until(cond: () => boolean, maxMs: number): void {
  for (let waited = 0; waited <= maxMs; waited += PET_LOOP.frameMs) {
    if (cond()) return
    vi.advanceTimersByTime(PET_LOOP.frameMs)
  }
  throw new Error(`조건이 ${maxMs}ms 안에 맞지 않음`)
}
const untilMode = (t: T, m: PetMode, maxMs = 60_000): void => until(() => mode(t) === m, maxMs)

/** 지금 자세의 몸통 판정 사각형 가운데(화면 DIP) */
function bodyPoint(t: T): { x: number; y: number } {
  const v = t.c.view()!
  const shapes = hitShape(v.look.pose, petBox(foot(t), v.size), v.look.facing === 'left')
  const r = shapes[shapes.length - 1]
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

/** 몸을 눌러 10 DIP 끌어 올려 들린 상태로 만든다 */
function pickUp(t: T): void {
  t.env.cursor = bodyPoint(t)
  t.c.press(true)
  t.env.cursor = { x: t.env.cursor.x, y: t.env.cursor.y - 10 }
  vi.advanceTimersByTime(PET_LOOP.frameMs)
  expect(mode(t)).toBe('held')
}

/** 들어서 발이 `at`에 오게 옮기고 멈춘 채 놓는다(던진 속도 0) */
function dropFrom(t: T, at: { x: number; y: number }): void {
  pickUp(t)
  t.env.cursor = { x: at.x, y: at.y - (54 / 64) * t.c.view()!.size }
  vi.advanceTimersByTime(200)
  t.c.press(false)
  expect(mode(t)).toBe('air')
}

function click(t: T, holdMs = 100): void {
  t.c.press(true)
  vi.advanceTimersByTime(holdMs)
  t.c.press(false)
}

/** 놓은 뒤 바닥에 설 때까지 프레임마다 발 y를 모은다 */
function fallYs(t: T, maxMs = 5000): number[] {
  const ys: number[] = []
  until(() => {
    ys.push(foot(t).y)
    return mode(t) !== 'air'
  }, maxMs)
  return ys
}

describe('표시', () => {
  it('start: 클릭 통과로 시작해 바닥 가운데에 창을 놓고 보여 준다', () => {
    const t = make()
    t.c.start()
    expect(t.window.showInactive).toHaveBeenCalledTimes(1)
    expect(t.window.setIgnoreMouse.mock.calls[0]).toEqual([true])
    expect(t.window.setBounds.mock.calls[0][0]).toEqual(FLOOR_WINDOW)
    const v = t.window.send.mock.calls[0][0]
    expect(v.look.pose).toBe('stand')
    expect(v.box).toEqual({ x: 132, y: 184.25 })
    expect(v.size).toBe(56)
    expect(v).toMatchObject({ bubble: null, menu: null, controlling: false, reduceMotion: false })
    expect(t.c.status()).toEqual({
      mode: 'idle',
      foot: { x: 960, y: 1040 },
      velocity: { vx: 0, vy: 0 },
      shown: true,
      window: FLOOR_WINDOW
    })
    expect(t.c.view()).toEqual(v)
    // 클릭 통과 → 자리 → 화면 값 → 표시
    const first = (f: { mock: { invocationCallOrder: number[] } }): number =>
      f.mock.invocationCallOrder[0]
    expect(first(t.window.setIgnoreMouse)).toBeLessThan(first(t.window.setBounds))
    expect(first(t.window.setBounds)).toBeLessThan(first(t.window.send))
    expect(first(t.window.send)).toBeLessThan(first(t.window.showInactive))
    expect(t.log).toHaveBeenCalledWith('pet.visibility', { visible: true, reason: null })
    expect(t.log).toHaveBeenCalledWith('pet.show', { display: '1', scale: 1, window: FLOOR_WINDOW })
  })

  it('3초 동안 가만히 있다가 첫 계획(바 오르기)을 세운다', () => {
    const t = make()
    t.c.start()
    vi.advanceTimersByTime(2999)
    expect(mode(t)).toBe('idle')
    vi.advanceTimersByTime(1)
    expect(mode(t)).toBe('walk')
    expect(look(t).facing).toBe('right')
  })

  it('보이기 끔·전체 화면·디스플레이 없음이면 표시하지 않고 타이머도 없다', () => {
    const off = make({ settings: { visible: false } })
    off.c.start()
    expect(off.window.showInactive).not.toHaveBeenCalled()
    expect(off.c.status()).toMatchObject({ shown: false, window: null })
    expect(off.c.view()).toBeNull()
    expect(vi.getTimerCount()).toBe(0)

    const full = make()
    full.c.setFullscreen(true)
    full.c.start()
    expect(full.window.showInactive).not.toHaveBeenCalled()

    const none = make()
    none.env.display = false
    none.c.start()
    expect(none.window.showInactive).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    none.env.display = true
    none.c.worldChanged()
    expect(none.window.showInactive).toHaveBeenCalledTimes(1)
    none.env.display = false
    none.c.worldChanged()
    expect(none.window.hide).toHaveBeenCalledTimes(1)
    expect(none.log).toHaveBeenCalledWith('pet.visibility', {
      visible: false,
      reason: 'no-display'
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('setFullscreen(true): 클릭 통과 다음 숨기고 타이머가 없다. 끝나면 같은 자리에서 이어 간다', () => {
    const t = make()
    t.c.start()
    vi.advanceTimersByTime(5000)
    expect(mode(t)).toBe('walk')
    const at = foot(t)
    t.c.setFullscreen(true)
    expect(t.window.hide).toHaveBeenCalledTimes(1)
    expect(t.window.setIgnoreMouse.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      t.window.hide.mock.invocationCallOrder[0]
    )
    expect(lastIgnore(t)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(t.log).toHaveBeenCalledWith('pet.visibility', { visible: false, reason: 'fullscreen' })
    expect(t.c.status()).toMatchObject({ shown: false, window: null })
    expect(t.c.view()).toBeNull()

    // 숨긴 동안의 세계 변화와 누름은 반영하지 않는다
    const worldCalls = t.world.mock.calls.length
    t.c.worldChanged()
    t.c.press(true)
    vi.advanceTimersByTime(10_000)
    expect(t.world.mock.calls.length).toBe(worldCalls)
    expect(vi.getTimerCount()).toBe(0)

    t.c.setFullscreen(false)
    expect(t.window.showInactive).toHaveBeenCalledTimes(2)
    expect(foot(t)).toEqual(at)
    expect(mode(t)).toBe('walk')
    vi.advanceTimersByTime(1000)
    expect(foot(t).x).toBeGreaterThan(at.x + 50)
  })
})

describe('혼자 놀기', () => {
  it('(완료 기준) 1분 안에 걷다가 바 옆면을 올라 꼭대기에 앉는다. 걷기는 60 DIP/초·30fps 이하', () => {
    const t = make()
    t.c.start()
    vi.advanceTimersByTime(5000)
    expect(mode(t)).toBe('walk')
    const x0 = foot(t).x
    vi.advanceTimersByTime(1000)
    const dx = foot(t).x - x0
    expect(dx).toBeGreaterThanOrEqual(58)
    expect(dx).toBeLessThanOrEqual(62)
    expect(look(t)).toMatchObject({ pose: 'walk', facing: 'right' })

    vi.advanceTimersByTime(54_000)
    const s = states(t)
    expect(s.indexOf('climb')).toBeGreaterThanOrEqual(0)
    expect(s.indexOf('sit')).toBeGreaterThan(s.indexOf('climb'))
    expect(s).not.toContain('walk')
    expect(s).not.toContain('idle')
    expect(mode(t)).toBe('sit')
    expect(stateLog(t, 'sit').box).toEqual(SIT_BOX)
    expect(stateLog(t, 'sit').window).toEqual({ x: 1600, y: 57, width: 320, height: 240 })
    expect(look(t)).toMatchObject({ pose: 'sit', face: 'content' })
    const gaps = t.boundsAt.slice(1).map((v, i) => v - t.boundsAt[i])
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(PET_LOOP.frameMs)
  })

  it('바 아래에서 뛰어올라 옆면에 붙고, 걷기 × 0.75로 오른 뒤 300ms 동안 꼭대기로 올라선다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'leap', 30_000)
    expect(foot(t)).toEqual({ x: 1853.5, y: 1040 })
    expect(look(t)).toMatchObject({ pose: 'air', face: 'up', facing: 'right' })
    expect(t.c.status().velocity.vy).toBeCloseTo(-1080.74, 1)
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    expect(mode(t)).toBe('leap')
    expect(vi.getTimerCount()).toBeLessThanOrEqual(2) // 동작 고리·졸기

    untilMode(t, 'climb', 2000)
    expect(foot(t)).toEqual({ x: 1853.5, y: 748 })
    expect(look(t)).toMatchObject({ pose: 'climb', face: 'up', facing: 'right' })
    expect(stateLog(t, 'climb').box).toEqual(petBox({ x: 1853.5, y: 748 }, 56))
    expect(vi.getTimerCount()).toBeLessThanOrEqual(2)
    const y0 = foot(t).y
    vi.advanceTimersByTime(1000)
    expect(y0 - foot(t).y).toBeGreaterThanOrEqual(43)
    expect(y0 - foot(t).y).toBeLessThanOrEqual(47)

    until(() => foot(t).y === 292, 12_000)
    expect(mode(t)).toBe('climb')
    vi.advanceTimersByTime(PET_LOOP.frameMs) // 꼭대기로 올라서는 중
    expect(mode(t)).toBe('climb')
    expect(foot(t).x).toBeGreaterThan(1853.5)
    expect(vi.getTimerCount()).toBeLessThanOrEqual(2)
    const topAt = Date.now() - PET_LOOP.frameMs
    untilMode(t, 'sit', 1000)
    expect(Date.now() - topAt).toBeGreaterThanOrEqual(300)
    expect(Date.now() - topAt).toBeLessThanOrEqual(300 + 2 * PET_LOOP.frameMs)
    expect(foot(t)).toEqual({ x: 1892, y: 292 })
  })

  it('(성능) 앉아 있는 10초 동안 창을 옮기지 않고, 타이머는 쉼·졸기·조회뿐이며 커서 조회는 거리별 주기', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    t.window.setBounds.mockClear()
    t.window.send.mockClear()
    const ignores = t.window.setIgnoreMouse.mock.calls.length

    t.env.cursor = { x: 100, y: 900 } // 창에서 멀다
    vi.advanceTimersByTime(300)
    t.cursor.mockClear()
    vi.advanceTimersByTime(1000)
    expect(t.cursor.mock.calls.length).toBeLessThanOrEqual(10)
    expect(t.cursor.mock.calls.length).toBeGreaterThanOrEqual(9)
    expect(vi.getTimerCount()).toBeLessThanOrEqual(3)

    t.env.cursor = { x: 1700, y: 100 } // 창 + 120 안, 몸 밖
    vi.advanceTimersByTime(300)
    t.cursor.mockClear()
    vi.advanceTimersByTime(1000)
    expect(t.cursor.mock.calls.length).toBeLessThanOrEqual(30)
    expect(t.cursor.mock.calls.length).toBeGreaterThanOrEqual(25)
    expect(vi.getTimerCount()).toBeLessThanOrEqual(3)

    vi.advanceTimersByTime(7400)
    expect(mode(t)).toBe('sit')
    expect(t.window.setBounds).not.toHaveBeenCalled()
    expect(t.window.send).not.toHaveBeenCalled()
    expect(t.window.setIgnoreMouse.mock.calls.length).toBe(ignores)
  })

  it('동작 고리는 움직이는 동안만 돈다(가만히 3개, 걷기 2개 타이머)', () => {
    const t = make()
    t.c.start()
    expect(vi.getTimerCount()).toBe(3) // 계획·졸기·조회
    t.window.send.mockClear()
    vi.advanceTimersByTime(2000)
    expect(t.window.send).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1500)
    expect(mode(t)).toBe('walk')
    expect(vi.getTimerCount()).toBe(2) // 동작 고리·졸기
    expect(t.window.send).toHaveBeenCalled()
  })

  it('쉼이 끝나면 바 반대쪽으로 뛰어내려 바닥에 서고, 뛰어내린 뒤 45초 전에는 바에 가지 않는다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    t.env.random = 0
    untilMode(t, 'air', 61_000)
    const jumpedAt = Date.now()
    expect(t.c.status().velocity).toEqual({ vx: -240, vy: -520 })
    expect(look(t).facing).toBe('left')
    vi.advanceTimersByTime(300)
    expect(mode(t)).toBe('air')
    expect(vi.getTimerCount()).toBeLessThanOrEqual(2) // 동작 고리·졸기(쉼 없음)
    untilMode(t, 'idle', 5000)
    expect(foot(t).y).toBe(1040)
    expect(states(t)).toContain('land')
    while (Date.now() < jumpedAt + 44_000) {
      vi.advanceTimersByTime(500)
      expect(mode(t)).toBe('idle')
    }
    vi.advanceTimersByTime(4000)
    expect(mode(t)).toBe('walk')
  })

  it('왼쪽 바: 왼쪽을 보고 오르고 오른쪽(vx +240)으로 뛰어내린다', () => {
    const t = make({ bar: LEFT_BAR })
    t.c.start()
    untilMode(t, 'climb')
    expect(foot(t).x).toBe(66.5)
    expect(look(t).facing).toBe('left')
    untilMode(t, 'sit')
    expect(foot(t)).toEqual({ x: 28, y: 292 })
    untilMode(t, 'air', 61_000)
    expect(t.c.status().velocity).toEqual({ vx: 240, vy: -520 })
  })

  it('꼭대기에 자리가 없는 긴 바는 바닥을 막는다(걸어서 지나가지 않는다)', () => {
    const t = make({
      bar: { rect: { x: 1864, y: 12, width: 56, height: 1020 }, edge: 'right' },
      random: 0.99
    })
    t.c.start()
    vi.advanceTimersByTime(3000)
    expect(mode(t)).toBe('walk')
    untilMode(t, 'idle', 20_000)
    expect(foot(t).x).toBe(1836)
  })
})

describe('(Review Focus 2) 펫 아래의 바 변화', () => {
  it('앉은 채 바가 아래로 옮겨지면 발이 따라가고 창은 한 번만 옮긴다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    t.window.setBounds.mockClear()
    t.env.bar = { rect: { x: 1864, y: 400, width: 56, height: 456 }, edge: 'right' }
    t.c.worldChanged()
    expect(foot(t)).toEqual({ x: 1892, y: 400 })
    expect(mode(t)).toBe('sit')
    expect(t.window.setBounds).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(t.window.setBounds).toHaveBeenCalledTimes(1)
  })

  it('앉은 채 바 모양이 캡슐로 바뀌면 새 꼭대기 가운데로 따라간다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    t.env.bar = { rect: { x: 1864, y: 306, width: 44, height: 428 }, edge: 'right' }
    t.c.worldChanged()
    expect(foot(t)).toEqual({ x: 1886, y: 306 })
    expect(mode(t)).toBe('sit')
  })

  it('앉은 채 바가 없어지면 그 자리에서 떨어져 바닥에 선다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    t.env.bar = null
    t.c.worldChanged()
    expect(mode(t)).toBe('air')
    expect(t.c.status().velocity).toEqual({ vx: 0, vy: 0 })
    expect(foot(t)).toEqual({ x: 1892, y: 292 })
    untilMode(t, 'idle', 3000)
    expect(foot(t)).toEqual({ x: 1892, y: 1040 })
  })

  it('오르는 중 옆면이 없어지면(바 끔·자리 없음) 떨어진다', () => {
    for (const bar of [
      null,
      { rect: { x: 1864, y: 12, width: 56, height: 456 }, edge: 'right' as const }
    ]) {
      const t = make()
      t.c.start()
      untilMode(t, 'climb')
      vi.advanceTimersByTime(1000)
      t.env.bar = bar
      t.c.worldChanged()
      expect(mode(t)).toBe('air')
      untilMode(t, 'idle', 3000)
      expect(foot(t).y).toBe(1040)
    }
  })

  it('뛰어오르는 중 바가 없어지면 떨어지고, 옮겨지면 새 옆면에 붙는다', () => {
    const gone = make()
    gone.c.start()
    untilMode(gone, 'leap', 30_000)
    gone.env.bar = null
    gone.c.worldChanged()
    expect(mode(gone)).toBe('air')
    untilMode(gone, 'idle', 3000)

    const moved = make()
    moved.c.start()
    untilMode(moved, 'leap', 30_000)
    moved.env.bar = { rect: { x: 1864, y: 250, width: 56, height: 456 }, edge: 'right' }
    moved.c.worldChanged()
    const ys: number[] = []
    until(() => {
      ys.push(foot(moved).y)
      return mode(moved) === 'climb'
    }, 2000)
    expect(foot(moved)).toEqual({ x: 1853.5, y: 706 })
    // 새 아래 끝(706)까지 뛰어올라 붙는다(옛 정점 748에서 순간 이동하지 않는다)
    expect(ys[ys.length - 2] - 706).toBeLessThan(5)
  })

  it('바로 걸어가는 중 바가 반대쪽으로 옮겨지면 돌아서서 새 옆면으로 간다', () => {
    const t = make()
    t.c.start()
    vi.advanceTimersByTime(5000)
    expect(look(t).facing).toBe('right')
    t.env.bar = LEFT_BAR
    t.c.worldChanged()
    const x = foot(t).x
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    expect(look(t).facing).toBe('left')
    expect(foot(t).x).toBeLessThan(x)
    untilMode(t, 'climb', 30_000)
    expect(foot(t).x).toBe(66.5)
  })

  it('오르는 중 바를 옮기면 옆면을 따라간다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'climb')
    vi.advanceTimersByTime(2000)
    const y = foot(t).y
    t.env.bar = { rect: { x: 1864, y: 392, width: 56, height: 456 }, edge: 'right' }
    t.c.worldChanged()
    expect(mode(t)).toBe('climb')
    expect(foot(t)).toEqual({ x: 1853.5, y: y + 100 })
  })

  it('앉은 채 전체 화면으로 바와 함께 숨었다 돌아오면 그대로 앉아 있다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    t.c.setFullscreen(true)
    t.env.bar = null
    t.c.worldChanged()
    t.env.bar = RIGHT_BAR
    t.c.worldChanged()
    t.c.setFullscreen(false)
    expect(mode(t)).toBe('sit')
    expect(foot(t)).toEqual({ x: 1892, y: 292 })
  })

  it('숨긴 동안 바가 꺼진 채로 다시 표시하면 그때 새 세계로 한 번 확인해 떨어진다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    t.c.setFullscreen(true)
    t.env.bar = null
    t.c.worldChanged()
    expect(mode(t)).toBe('sit')
    t.c.setFullscreen(false)
    expect(mode(t)).toBe('air')
    untilMode(t, 'idle', 3000)
  })

  it('숨긴 동안에는 쉼 시간이 흐르지 않는다(다시 표시한 뒤 남은 시간만큼 앉아 있다)', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    vi.advanceTimersByTime(50_000) // 쉼 60초 중 50초
    t.c.setFullscreen(true)
    vi.advanceTimersByTime(120_000)
    t.c.setFullscreen(false)
    vi.advanceTimersByTime(9000)
    expect(mode(t)).toBe('sit')
    vi.advanceTimersByTime(1100)
    expect(mode(t)).toBe('air')
  })
})

describe('(Review Focus 3) 모니터·작업 표시줄 변화', () => {
  it('1280×720 모니터(작업 영역 높이 680)로 바뀌면 바닥 가운데에 선다', () => {
    const t = make()
    t.c.start()
    t.env.monitor = {
      ...MAIN,
      id: '2',
      bounds: { x: 0, y: 0, width: 1280, height: 720 },
      workArea: { x: 0, y: 0, width: 1280, height: 680 }
    }
    t.env.bar = null
    t.c.worldChanged()
    expect(foot(t)).toEqual({ x: 640, y: 680 })
    expect(mode(t)).toBe('idle')
    expect(t.c.status().window).toEqual({ x: 480, y: 445, width: 320, height: 240 })
  })

  it('작업 표시줄이 자동 숨김·위쪽·왼쪽으로 바뀌면 새 바닥에 다시 선다', () => {
    const t = make({ bar: null })
    t.c.start()
    for (const workArea of [
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 0, y: 40, width: 1920, height: 1040 },
      { x: 48, y: 0, width: 1872, height: 1080 }
    ]) {
      t.env.monitor = { ...MAIN, workArea }
      t.c.worldChanged()
      expect(foot(t)).toEqual({ x: 960, y: 1080 })
      const w = t.c.status().window!
      expect(w.y + w.height).toBeLessThanOrEqual(1080)
    }
  })

  it('바가 다른 모니터로 가면 그 모니터 바닥 가운데에 서고 창이 그 모니터를 넘지 않는다', () => {
    const t = make({ bar: null })
    t.c.start()
    t.env.monitor = {
      ...MAIN,
      id: '2',
      isPrimary: false,
      bounds: { x: -1280, y: 0, width: 1280, height: 1024 },
      workArea: { x: -1280, y: 0, width: 1280, height: 984 }
    }
    t.c.worldChanged()
    expect(foot(t)).toEqual({ x: -640, y: 984 })
    const w = t.c.status().window!
    expect(w.x).toBeGreaterThanOrEqual(-1280)
    expect(w.x + w.width).toBeLessThanOrEqual(0)
    expect(t.c.view()!.box).toEqual({ x: 132, y: 184.25 })
  })

  it('같은 모니터에서 작업 표시줄이 40 DIP 높아지면 그 x 그대로 새 바닥에 서고 상태를 이어 간다', () => {
    const t = make({ bar: null, random: 0 })
    t.c.start()
    dropFrom(t, { x: 1080, y: 1000 })
    untilMode(t, 'idle', 3000)
    expect(foot(t)).toEqual({ x: 1080, y: 1040 })
    t.env.monitor = { ...MAIN, workArea: { x: 0, y: 0, width: 1920, height: 1000 } }
    t.c.worldChanged()
    expect(foot(t)).toEqual({ x: 1080, y: 1000 })
    expect(mode(t)).toBe('idle')
  })

  it('같은 모니터의 바닥 변화에 자던 펫은 계속 잔다(깨지 않는다)', () => {
    const t = make({ bar: null, random: 0 })
    t.c.start()
    t.env.idle = 1000
    vi.advanceTimersByTime(180_000)
    expect(mode(t)).toBe('sleep')
    t.env.monitor = { ...MAIN, workArea: { x: 0, y: 0, width: 1920, height: 1000 } }
    t.c.worldChanged()
    expect(mode(t)).toBe('sleep')
    expect(foot(t)).toEqual({ x: 960, y: 1000 })
    expect(states(t)).toEqual(['sleep'])
    expect(vi.getTimerCount()).toBe(1)
  })

  it('같은 모니터의 해상도가 줄면 걷던 펫은 x와 목적지를 새 범위로 잘라 이어 걷는다', () => {
    const t = make()
    t.c.start()
    vi.advanceTimersByTime(5000) // 바로 가는 중(x 약 1080)
    expect(mode(t)).toBe('walk')
    const x = foot(t).x
    t.env.monitor = {
      ...MAIN,
      bounds: { x: 0, y: 0, width: 1280, height: 720 },
      workArea: { x: 0, y: 0, width: 1280, height: 680 }
    }
    t.env.bar = null
    t.c.worldChanged()
    expect(mode(t)).toBe('walk')
    expect(foot(t)).toEqual({ x, y: 680 })
    untilMode(t, 'idle', 10_000)
    expect(foot(t)).toEqual({ x: 1252, y: 680 }) // 옛 목적지 1853.5를 새 maxX로 자름
  })

  it('같은 모니터에서 날아가는 중 바닥이 위로 올라오면 그 x에서 새 바닥에 내려선다', () => {
    const t = make({ bar: null })
    t.c.start()
    dropFrom(t, { x: 400, y: 1000 })
    t.env.monitor = { ...MAIN, workArea: { x: 0, y: 0, width: 1920, height: 900 } }
    t.c.worldChanged()
    expect(mode(t)).toBe('air')
    untilMode(t, 'idle', 1000)
    expect(foot(t)).toEqual({ x: 400, y: 900 })
  })

  it('다른 모니터로 바뀌면 날던 펫도 그 모니터 바닥 가운데에 선다', () => {
    const t = make({ bar: null })
    t.c.start()
    dropFrom(t, { x: 400, y: 500 })
    t.env.monitor = {
      ...MAIN,
      id: '2',
      bounds: { x: 0, y: 0, width: 1280, height: 720 },
      workArea: { x: 0, y: 0, width: 1280, height: 680 }
    }
    t.c.worldChanged()
    expect(mode(t)).toBe('idle')
    expect(foot(t)).toEqual({ x: 640, y: 680 })
  })
})

describe('클릭', () => {
  it('클릭하면 폴짝(cue hop)하고 걷던 중이면 멈춘다', () => {
    const t = make()
    t.c.start()
    vi.advanceTimersByTime(4000)
    expect(mode(t)).toBe('walk')
    click(t)
    expect(mode(t)).toBe('idle')
    expect(look(t).cue).toBe('hop')
    expect(look(t).cueSeq).toBe(1)
    expect(t.window.send.mock.lastCall![0].look).toMatchObject({ cue: 'hop', cueSeq: 1 })
    expect(t.log).toHaveBeenCalledWith('pet.click', { kind: 'hop' })
    const n = t.window.setBounds.mock.calls.length
    vi.advanceTimersByTime(1000)
    expect(t.window.setBounds.mock.calls.length).toBe(n)
  })

  it('가만히 있을 때 클릭해도 창은 움직이지 않는다', () => {
    const t = make()
    t.c.start()
    const n = t.window.setBounds.mock.calls.length
    click(t)
    vi.advanceTimersByTime(500)
    expect(t.window.setBounds.mock.calls.length).toBe(n)
    expect(look(t)).toMatchObject({ cue: 'hop', cueSeq: 1 })
  })

  it('앞 클릭과 500ms 안의 두 번째 클릭은 폴짝 대신 팔레트를 한 번 연다', () => {
    const t = make()
    t.c.start()
    click(t)
    vi.advanceTimersByTime(100)
    click(t)
    expect(t.openPalette).toHaveBeenCalledTimes(1)
    expect(look(t).cueSeq).toBe(1)
    expect(t.log).toHaveBeenCalledWith('pet.click', { kind: 'double' })
    // 세 번째 클릭은 새 클릭이다(팔레트를 다시 열지 않는다)
    vi.advanceTimersByTime(100)
    click(t)
    expect(t.openPalette).toHaveBeenCalledTimes(1)
    expect(look(t).cueSeq).toBe(2)
  })

  it('600ms 뒤 두 번째 클릭은 다시 폴짝', () => {
    const t = make()
    t.c.start()
    click(t)
    vi.advanceTimersByTime(600)
    click(t)
    expect(t.openPalette).not.toHaveBeenCalled()
    expect(look(t).cueSeq).toBe(2)
    expect(t.log.mock.calls.filter(([e]) => e === 'pet.click')).toEqual([
      ['pet.click', { kind: 'hop' }],
      ['pet.click', { kind: 'hop' }]
    ])
  })

  it('클릭 → 집어 던지기 → 500ms 안의 클릭은 더블클릭이 아니라 폴짝이다', () => {
    const t = make()
    t.c.start()
    click(t)
    expect(look(t).cueSeq).toBe(1)
    pickUp(t)
    t.c.press(false)
    expect(mode(t)).toBe('air')
    click(t) // 첫 클릭을 뗀 뒤 약 134ms
    expect(t.openPalette).not.toHaveBeenCalled()
    // 바닥 높이에서 놓아 한 번 내려앉고(land) 이어 폴짝: 1 hop + 1 land + 1 hop
    expect(look(t)).toMatchObject({ cue: 'hop', cueSeq: 3 })
    expect(t.log.mock.calls.filter(([e]) => e === 'pet.click')).toEqual([
      ['pet.click', { kind: 'hop' }],
      ['pet.click', { kind: 'hop' }]
    ])
  })

  it('500ms 넘게 누르거나 4 DIP 넘게 움직이면 클릭이 아니다', () => {
    const t = make()
    t.c.start()
    click(t, GESTURE.clickMaxMs + 50)
    expect(look(t).cueSeq).toBe(0)
    t.env.cursor = { x: 100, y: 100 }
    t.c.press(true)
    t.env.cursor = { x: 104, y: 103 } // 5 DIP, 프레임 전에 뗌
    t.c.press(false)
    expect(look(t).cueSeq).toBe(0)
    expect(t.log.mock.calls.filter(([e]) => e === 'pet.click')).toEqual([])
  })
})

describe('잡아 던지기', () => {
  it('누른 뒤 4 DIP 넘게 움직이면 들리고, 놓으면 끈 속도로 날아가 바닥에 선다', () => {
    const t = make()
    t.c.start()
    t.env.cursor = { x: 960, y: 1020 }
    t.c.press(true)
    t.env.cursor = { x: 960, y: 1010 }
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    expect(mode(t)).toBe('held')
    expect(lastIgnore(t)).toBe(false)
    expect(states(t)).toEqual(['held'])
    expect(foot(t).y).toBe(1040) // 커서 + 47.25는 바닥 아래라 바닥에서 자른다
    expect(look(t)).toMatchObject({ pose: 'held', face: 'surprised' })

    for (let i = 1; i <= 10; i++) {
      t.env.cursor = { x: 960 + 10 * i, y: 1010 - 6 * i }
      vi.advanceTimersByTime(10)
    }
    t.c.press(false)
    expect(mode(t)).toBe('air')
    const v = t.c.status().velocity
    expect(Math.abs(v.vx - 1000)).toBeLessThanOrEqual(50)
    expect(Math.abs(v.vy + 600)).toBeLessThanOrEqual(50)
    expect(foot(t)).toEqual({ x: 1060, y: 950 + 47.25 })

    untilMode(t, 'idle', 5000)
    expect(states(t)).toEqual(['held', 'land'])
    expect(foot(t).y).toBe(1040)
    expect(look(t)).toMatchObject({ cue: 'land', cueSeq: 1 })
  })

  it('들린 펫은 커서를 격자 (32, 4)에 두고 모니터 안·바닥 위로 자른다', () => {
    const t = make()
    t.c.start()
    pickUp(t)
    t.env.cursor = { x: 600, y: 400 }
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    expect(foot(t)).toEqual({ x: 600, y: 447.25 })
    const box = petBox(foot(t), 56)
    expect(box.x + 32 * (56 / 64)).toBe(600)
    expect(box.y + 4 * (56 / 64)).toBe(400)
    t.env.cursor = { x: 2500, y: -300 }
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    expect(foot(t)).toEqual({ x: 1892, y: 50.75 })
    // 잘려서 커서가 몸 밖에 있어도 들린 동안은 클릭 통과를 끈 채로 둔다(pointerup을 받아야 한다)
    expect(lastIgnore(t)).toBe(false)
    t.env.cursor = { x: -100, y: 5000 }
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    expect(foot(t)).toEqual({ x: 28, y: 1040 })
    expect(lastIgnore(t)).toBe(false)
    expect(t.window.setIgnoreMouse.mock.calls).toEqual([[true], [false]])
    expect(vi.getTimerCount()).toBe(2) // 동작 고리·졸기(계획 없음)
  })

  it('들린 동안 세계가 바뀌어도 클릭 통과를 끈 채로 들고 있다', () => {
    const t = make()
    t.c.start()
    pickUp(t)
    const calls = t.window.setIgnoreMouse.mock.calls.length
    t.env.bar = { rect: { x: 1864, y: 400, width: 56, height: 456 }, edge: 'right' }
    t.c.worldChanged()
    t.env.monitor = { ...MAIN, workArea: { x: 0, y: 0, width: 1920, height: 1000 } }
    t.c.worldChanged()
    vi.advanceTimersByTime(200)
    expect(mode(t)).toBe('held')
    expect(lastIgnore(t)).toBe(false)
    expect(t.window.setIgnoreMouse.mock.calls.length).toBe(calls)
    expect(foot(t).y).toBeLessThanOrEqual(1000) // 새 바닥 위로 자른다
  })

  it('날고 있는 펫을 잡을 수 있고, 날고 있는 펫을 클릭하면 폴짝 cue만 내고 계속 난다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    untilMode(t, 'air', 61_000) // 뛰어내리기
    vi.advanceTimersByTime(100)
    click(t)
    expect(mode(t)).toBe('air')
    expect(look(t)).toMatchObject({ cue: 'hop', cueSeq: 1 })
    vi.advanceTimersByTime(100)
    expect(mode(t)).toBe('air')
    pickUp(t) // 공중에서 잡는다
    expect(states(t).at(-1)).toBe('held')
    t.env.cursor = { x: 900, y: 700 }
    vi.advanceTimersByTime(200)
    t.c.press(false)
    expect(mode(t)).toBe('air')
    untilMode(t, 'idle', 3000)
    expect(foot(t)).toEqual({ x: 900, y: 1040 })
  })

  it('누르고 있는 동안 펫이 걸어서 커서에서 벗어나도 클릭 통과를 끈 채로 둔다', () => {
    const t = make()
    t.c.start()
    vi.advanceTimersByTime(4000)
    expect(mode(t)).toBe('walk')
    t.env.cursor = bodyPoint(t)
    t.c.press(true)
    vi.advanceTimersByTime(1500) // 90 DIP 걸어 커서가 몸 밖에 남는다
    expect(mode(t)).toBe('walk')
    expect(lastIgnore(t)).toBe(false)
    t.c.press(false)
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    expect(lastIgnore(t)).toBe(true)
  })

  it('(완료 기준) 바 꼭대기 위에서 멈춘 채 놓으면 1초 안에 앉는다', () => {
    const t = make()
    t.c.start()
    pickUp(t)
    t.env.cursor = { x: 1892, y: 200 }
    vi.advanceTimersByTime(200)
    t.c.press(false)
    expect(t.c.status().velocity).toEqual({ vx: 0, vy: 0 })
    vi.advanceTimersByTime(1000)
    expect(mode(t)).toBe('sit')
    expect(foot(t)).toEqual({ x: 1892, y: 292 })
    expect(states(t)).toEqual(['held', 'sit'])
  })

  it('꼭대기에서 집어 들면 바 방문으로 친다(45초 동안 다시 가지 않는다)', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    t.env.random = 0
    pickUp(t)
    t.env.cursor = { x: 960, y: 900 }
    vi.advanceTimersByTime(200)
    t.c.press(false)
    untilMode(t, 'idle', 3000)
    for (let i = 0; i < 80; i++) {
      vi.advanceTimersByTime(500)
      expect(mode(t)).toBe('idle')
    }
  })

  it('(Review Focus 4) 들린 동안 버튼 조회가 두 번 연속 false면 놓은 것으로 처리한다', () => {
    const t = make()
    t.c.start()
    t.env.buttons = true
    pickUp(t)
    t.env.buttons = false
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    expect(mode(t)).toBe('held')
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    expect(mode(t)).toBe('air')
    t.c.press(false) // 늦게 온 pointerup은 무시
    expect(mode(t)).toBe('air')
  })

  it('(Review Focus 4) false 다음 true면 이어서 들고, null이면 press(false)까지 들고 있다', () => {
    const t = make()
    t.c.start()
    t.env.buttons = true
    pickUp(t)
    for (const b of [false, true, false, true]) {
      t.env.buttons = b
      vi.advanceTimersByTime(PET_LOOP.frameMs)
    }
    expect(mode(t)).toBe('held')
    t.env.buttons = null
    vi.advanceTimersByTime(5000)
    expect(mode(t)).toBe('held')
    t.c.press(false)
    expect(mode(t)).toBe('air')
  })

  it('누르기만 한 채 버튼을 놓친 것도 두 번 연속 false면 끝낸다', () => {
    const t = make()
    t.c.start()
    t.env.cursor = bodyPoint(t)
    t.env.buttons = true
    t.c.press(true)
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    t.env.buttons = false
    vi.advanceTimersByTime(2 * PET_LOOP.frameMs)
    t.env.cursor = { x: 300, y: 300 }
    vi.advanceTimersByTime(500)
    expect(mode(t)).toBe('idle')
    expect(lastIgnore(t)).toBe(true)
  })

  it('(Review Focus 1) 놓은 뒤 커서가 몸 밖이면 마지막 setIgnoreMouse는 true', () => {
    const t = make()
    t.c.start()
    pickUp(t)
    t.env.cursor = { x: 600, y: 400 }
    vi.advanceTimersByTime(200)
    t.c.press(false)
    vi.advanceTimersByTime(3000)
    expect(mode(t)).toBe('idle')
    expect(lastIgnore(t)).toBe(true)
  })

  it('(Review Focus 1) 들린 채 숨겼다 다시 표시해도 첫 setIgnoreMouse는 true이고 펫은 떨어진다', () => {
    const t = make()
    t.c.start()
    pickUp(t)
    t.env.cursor = { x: 600, y: 400 }
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    expect(lastIgnore(t)).toBe(false)
    t.c.setFullscreen(true)
    expect(lastIgnore(t)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    const n = t.window.setIgnoreMouse.mock.calls.length
    t.c.setFullscreen(false)
    expect(t.window.setIgnoreMouse.mock.calls[n]).toEqual([true])
    expect(mode(t)).toBe('air')
    untilMode(t, 'idle', 3000)
    expect(lastIgnore(t)).toBe(true)
  })

  it('(Review Focus 1) 커서가 몸 위에 오면 클릭을 받고 나가면 다시 통과시킨다(값이 바뀔 때만)', () => {
    const t = make()
    t.c.start()
    expect(t.window.setIgnoreMouse.mock.calls).toEqual([[true]])
    t.env.cursor = bodyPoint(t)
    vi.advanceTimersByTime(150)
    expect(t.window.setIgnoreMouse.mock.calls).toEqual([[true], [false]])
    vi.advanceTimersByTime(500)
    expect(t.window.setIgnoreMouse.mock.calls).toEqual([[true], [false]])
    t.env.cursor = { x: 960, y: 900 }
    vi.advanceTimersByTime(100)
    expect(t.window.setIgnoreMouse.mock.calls).toEqual([[true], [false], [true]])
  })
})

describe('졸기', () => {
  it('표시 뒤 3분에 입력 없는 시간을 한 번 확인하고, 모자라면 남은 시간 뒤 다시 확인한다', () => {
    const t = make({ bar: null, random: 0 })
    t.c.start()
    vi.advanceTimersByTime(180_000 - 1)
    expect(t.idleSeconds).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(t.idleSeconds).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(180_000 - 1)
    expect(t.idleSeconds).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(t.idleSeconds).toHaveBeenCalledTimes(2)
    expect(mode(t)).toBe('idle')
  })

  it('100초면 80초 뒤 다시 확인하고, 넘었으면 그 자리에서 존다. 커서가 몸 위에 오면 깬다', () => {
    const t = make({ bar: null, random: 0 })
    t.c.start()
    t.env.idle = 100
    vi.advanceTimersByTime(180_000)
    expect(t.idleSeconds).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(80_000 - 1)
    expect(t.idleSeconds).toHaveBeenCalledTimes(1)
    t.env.idle = 180
    vi.advanceTimersByTime(1)
    expect(t.idleSeconds).toHaveBeenCalledTimes(2)
    expect(mode(t)).toBe('sleep')
    expect(look(t)).toMatchObject({ pose: 'sleep', face: 'asleep' })
    expect(look(t).props).toContain('zzz')
    expect(states(t)).toEqual(['sleep'])
    expect(vi.getTimerCount()).toBe(1) // 조회만

    vi.advanceTimersByTime(500)
    t.cursor.mockClear()
    t.window.setBounds.mockClear()
    t.window.send.mockClear()
    vi.advanceTimersByTime(1000)
    expect(t.cursor.mock.calls.length).toBeLessThanOrEqual(4)
    vi.advanceTimersByTime(5000)
    expect(t.window.setBounds).not.toHaveBeenCalled()
    expect(t.window.send).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)

    t.env.cursor = bodyPoint(t)
    vi.advanceTimersByTime(PET_LOOP.hitSleepMs)
    expect(states(t)).toEqual(['sleep', 'wake'])
    expect(mode(t)).toBe('idle')
    expect(look(t).props).not.toContain('zzz')
    expect(lastIgnore(t)).toBe(false)
  })

  it('잠들 때 커서가 이미 몸 위에 있으면 한 번 나갔다 들어와야 깬다', () => {
    const t = make({ bar: null, random: 0 })
    t.c.start()
    t.env.idle = 1000
    vi.advanceTimersByTime(180_000 - 300)
    t.env.cursor = { x: 960, y: 1033 }
    vi.advanceTimersByTime(300)
    expect(mode(t)).toBe('sleep')
    vi.advanceTimersByTime(2000)
    expect(mode(t)).toBe('sleep')
    t.env.cursor = { x: 300, y: 300 }
    vi.advanceTimersByTime(PET_LOOP.hitSleepMs)
    t.env.cursor = { x: 960, y: 1033 }
    vi.advanceTimersByTime(PET_LOOP.hitSleepMs)
    expect(mode(t)).toBe('idle')
  })

  it('(Review Focus 1) 자는 펫 위의 커서로 클릭을 받는 동안은 깨어 있을 때 주기로 조회해 0.1초 안에 통과로 되돌린다', () => {
    const t = make({ bar: null, random: 0 })
    t.c.start()
    t.env.idle = 1000
    vi.advanceTimersByTime(180_000 - 300)
    t.env.cursor = { x: 960, y: 1033 } // 서 있는 몸과 자는 몸 모두의 위
    vi.advanceTimersByTime(300)
    expect(mode(t)).toBe('sleep')
    expect(lastIgnore(t)).toBe(false)
    vi.advanceTimersByTime(200)
    t.cursor.mockClear()
    vi.advanceTimersByTime(1000)
    expect(t.cursor.mock.calls.length).toBeGreaterThanOrEqual(25) // 34ms(가까움)
    t.env.cursor = { x: 300, y: 300 }
    vi.advanceTimersByTime(PET_LOOP.hitFarMs)
    expect(lastIgnore(t)).toBe(true)
    expect(mode(t)).toBe('sleep')
    vi.advanceTimersByTime(300)
    t.cursor.mockClear()
    vi.advanceTimersByTime(1000)
    expect(t.cursor.mock.calls.length).toBeLessThanOrEqual(4) // 통과 중이면 다시 250ms
  })

  it('꼭대기에서 자다가 바가 없어지면 깸으로 기록하고 떨어진다', () => {
    const t = make({ settings: { sleepAfterMin: 1 } })
    t.c.start()
    t.env.idle = 1000
    vi.advanceTimersByTime(60_000)
    expect(mode(t)).toBe('sleep')
    t.env.bar = null
    t.c.worldChanged()
    expect(mode(t)).toBe('air')
    expect(states(t).slice(-2)).toEqual(['sleep', 'wake'])
    expect(stateLog(t, 'wake').box).toEqual(SIT_BOX)
    untilMode(t, 'idle', 3000)
    expect(states(t).slice(-3)).toEqual(['sleep', 'wake', 'land'])
  })

  it('바닥에서 자다가 다른 모니터 바닥 가운데로 옮겨지면 깸으로 기록한다', () => {
    const t = make({ bar: null, random: 0 })
    t.c.start()
    t.env.idle = 1000
    vi.advanceTimersByTime(180_000)
    expect(mode(t)).toBe('sleep')
    t.env.monitor = {
      ...MAIN,
      id: '2',
      bounds: { x: 0, y: 0, width: 1280, height: 720 },
      workArea: { x: 0, y: 0, width: 1280, height: 680 }
    }
    t.c.worldChanged()
    expect(mode(t)).toBe('idle')
    expect(foot(t)).toEqual({ x: 640, y: 680 })
    expect(states(t)).toEqual(['sleep', 'wake'])
    expect(stateLog(t, 'wake').box).toEqual(petBox({ x: 640, y: 680 }, 56))
  })

  it('꼭대기에서 졸면 깬 뒤 다시 앉는다', () => {
    const t = make({ settings: { sleepAfterMin: 1 } })
    t.c.start()
    t.env.idle = 1000
    vi.advanceTimersByTime(60_000)
    expect(mode(t)).toBe('sleep')
    expect(foot(t)).toEqual({ x: 1892, y: 292 })
    vi.advanceTimersByTime(500)
    t.env.cursor = bodyPoint(t)
    vi.advanceTimersByTime(PET_LOOP.hitSleepMs)
    expect(mode(t)).toBe('sit')
    expect(states(t).slice(-2)).toEqual(['sleep', 'wake'])
  })

  it('잘 때가 됐는데 들고 있었으면 내려놓아 바닥에 선 뒤 존다', () => {
    const t = make({ settings: { sleepAfterMin: 1 } })
    t.c.start()
    t.env.idle = 1000
    vi.advanceTimersByTime(59_000)
    pickUp(t)
    t.env.cursor = { x: 960, y: 500 }
    vi.advanceTimersByTime(2000)
    expect(mode(t)).toBe('held')
    t.c.press(false)
    untilMode(t, 'sleep', 3000)
    expect(foot(t).y).toBe(1040)
  })

  it('깬 뒤 첫 계획은 바 오르기다(바에 다녀온 지 45초가 안 됐어도)', () => {
    const t = make({ settings: { sleepAfterMin: 1 } })
    t.c.start()
    untilMode(t, 'sit')
    pickUp(t) // 꼭대기에서 집어 들면 바 방문으로 친다
    t.env.cursor = { x: 960, y: 500 }
    vi.advanceTimersByTime(200)
    t.c.press(false)
    t.env.cursor = { x: 100, y: 100 }
    t.env.idle = 1000
    untilMode(t, 'sleep', 40_000) // 표시 뒤 1분의 확인
    expect(foot(t).y).toBe(1040)
    vi.advanceTimersByTime(500)
    t.env.cursor = bodyPoint(t)
    vi.advanceTimersByTime(PET_LOOP.hitSleepMs)
    expect(mode(t)).toBe('idle')
    t.env.cursor = { x: 100, y: 100 }
    // 깬 뒤 3초에 바로 가는 긴 걷기(14초 넘게)를 시작한다. 바 계획이 아니면 120 DIP만 걷고 멈춘다
    vi.advanceTimersByTime(PET_TIMING.firstIdleMs + 6000)
    expect(mode(t)).toBe('walk')
    untilMode(t, 'climb', 15_000)
  })

  it('누르면 깨고 클릭으로 처리한다', () => {
    const t = make({ bar: null, random: 0 })
    t.c.start()
    t.env.idle = 1000
    vi.advanceTimersByTime(180_000)
    expect(mode(t)).toBe('sleep')
    click(t)
    expect(mode(t)).toBe('idle')
    expect(states(t)).toEqual(['sleep', 'wake'])
    expect(look(t).cueSeq).toBe(1)
  })
})

describe('선글라스·움직임 줄이기·refresh', () => {
  it('가명 처리가 켜져 있으면 모든 모습에 선글라스를 쓴다', () => {
    const t = make({ settings: { sleepAfterMin: 1 } })
    t.c.start()
    vi.advanceTimersByTime(40_000)
    pickUp(t)
    t.env.cursor = { x: 960, y: 500 }
    vi.advanceTimersByTime(200)
    t.c.press(false)
    t.env.idle = 1000
    vi.advanceTimersByTime(80_000)
    const poses = new Set(t.window.send.mock.calls.map(([v]) => v.look.pose))
    expect(poses).toEqual(new Set(['stand', 'walk', 'air', 'climb', 'sit', 'held', 'sleep']))
    for (const [v] of t.window.send.mock.calls) expect(v.look.props[0]).toBe('sunglasses')
  })

  it('refresh: 가명 처리 off면 선글라스를 벗는다(말풍선 없이)', () => {
    const t = make()
    t.c.start()
    expect(look(t).props).toEqual(['sunglasses'])
    t.env.masking = 'off'
    t.c.refresh()
    expect(look(t).props).toEqual([])
    expect(t.window.send.mock.lastCall![0]).toMatchObject({ bubble: null, look: { props: [] } })
  })

  it('refresh: visible false면 숨기고 true면 같은 자리에 다시 표시한다', () => {
    const t = make()
    t.c.start()
    t.env.settings = { ...t.env.settings, visible: false }
    t.c.refresh()
    expect(t.window.hide).toHaveBeenCalledTimes(1)
    expect(t.log).toHaveBeenCalledWith('pet.visibility', { visible: false, reason: 'setting' })
    expect(vi.getTimerCount()).toBe(0)
    t.env.settings = { ...t.env.settings, visible: true }
    t.c.refresh()
    expect(t.window.showInactive).toHaveBeenCalledTimes(2)
    expect(foot(t)).toEqual({ x: 960, y: 1040 })
    expect(t.log.mock.calls.filter(([e]) => e === 'pet.show')).toHaveLength(2)
  })

  it('refresh: 크기 72면 상자·창을 다시 계산한다', () => {
    const t = make()
    t.c.start()
    t.env.settings = { ...t.env.settings, size: 72 }
    t.c.refresh()
    expect(t.c.view()!.size).toBe(72)
    expect(t.c.view()!.box).toEqual({ x: 124, y: 167.75 })
    expect(t.c.status().window).toEqual({ x: 800, y: 807, width: 320, height: 240 })
    expect(t.window.setBounds.mock.lastCall![0]).toEqual({
      x: 800,
      y: 807,
      width: 320,
      height: 240
    })
    expect(t.window.send.mock.lastCall![0].size).toBe(72)
  })

  it('refresh: 크기 72로 앉아 있으면 꼭대기에 그대로 앉아 있다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    t.env.settings = { ...t.env.settings, size: 72 }
    t.c.refresh()
    expect(mode(t)).toBe('sit')
    expect(foot(t)).toEqual({ x: 1892, y: 292 })
  })

  it('refresh: 움직임 줄이기면 바닥에서 튀지 않고 cue를 만들지 않는다', () => {
    const t = make({ bar: null })
    t.c.start()
    t.env.settings = { ...t.env.settings, reduceMotion: true }
    t.c.refresh()
    expect(t.c.view()!.reduceMotion).toBe(true)
    dropFrom(t, { x: 960, y: 500 })
    const ys = fallYs(t)
    expect(ys.slice(ys.indexOf(1040))).toEqual(ys.slice(ys.indexOf(1040)).map(() => 1040))
    expect(mode(t)).toBe('idle')
    expect(states(t)).toContain('land')
    expect(look(t)).toMatchObject({ cue: null, cueSeq: 0 })
    click(t)
    expect(look(t)).toMatchObject({ cue: null, cueSeq: 0 })
    expect(t.log).toHaveBeenCalledWith('pet.click', { kind: 'hop' })
  })

  it('시스템 움직임 줄이기도 같다', () => {
    const t = make({ bar: null })
    t.env.systemReduced = true
    t.c.start()
    expect(t.c.view()!.reduceMotion).toBe(true)
    dropFrom(t, { x: 960, y: 500 })
    const ys = fallYs(t)
    expect(Math.min(...ys.slice(ys.indexOf(1040)))).toBe(1040)
  })

  it('refresh: 활발함을 바꾸면 걷는 속도가 바뀐다', () => {
    const t = make()
    t.c.start()
    vi.advanceTimersByTime(4000)
    t.env.settings = { ...t.env.settings, activity: 'lively' }
    t.c.refresh()
    const x0 = foot(t).x
    vi.advanceTimersByTime(1000)
    expect(foot(t).x - x0).toBeGreaterThanOrEqual(87)
    expect(foot(t).x - x0).toBeLessThanOrEqual(93)
  })
})

describe('Task 2에서 넘겨받은 주의', () => {
  it('새로 떨어질 때마다 bounced를 새로 시작한다(두 번째 낙하도 한 번 튄다)', () => {
    const t = make({ bar: null })
    t.c.start()
    for (let k = 0; k < 2; k++) {
      dropFrom(t, { x: 960, y: 500 })
      const ys = fallYs(t)
      const touched = ys.indexOf(1040)
      expect(touched).toBeGreaterThan(0)
      expect(Math.min(...ys.slice(touched))).toBeLessThan(1000)
      expect(mode(t)).toBe('idle')
    }
    expect(states(t)).toEqual(['held', 'land', 'held', 'land'])
  })

  it('now()가 NaN이거나 뒤로 가도 그 프레임은 멈추고 몸이 유한하며, 떨어진 자리 그대로 바닥에 선다', () => {
    const t = make({ bar: null })
    t.c.start()
    dropFrom(t, { x: 400, y: 300 })
    vi.advanceTimersByTime(200)
    const before = t.c.status()
    t.env.clock = () => NaN
    vi.advanceTimersByTime(3 * PET_LOOP.frameMs)
    const s = t.c.status()
    for (const v of [s.foot.x, s.foot.y, s.velocity.vx, s.velocity.vy])
      expect(Number.isFinite(v)).toBe(true)
    expect(s.mode).toBe('air')
    expect(s.foot).toEqual(before.foot)
    t.env.clock = () => Date.now() - 5000
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    expect(t.c.status().foot).toEqual(before.foot)
    t.env.clock = null
    untilMode(t, 'idle', 5000)
    expect(foot(t)).toEqual({ x: 400, y: 1040 }) // 바닥 가운데(960)로 재설정되지 않았다
  })

  it('걷는 중 시계가 앞으로 뛰어도 한 프레임의 dt는 0.1초까지만 쓴다', () => {
    const t = make()
    t.c.start()
    vi.advanceTimersByTime(5000)
    expect(mode(t)).toBe('walk')
    const x0 = foot(t).x
    t.env.clock = () => Date.now() + 5000
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    const x1 = foot(t).x
    expect(x1 - x0).toBeCloseTo(0.1 * 60, 6) // 5.034초가 아니라 0.1초만큼
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    expect(foot(t).x - x1).toBeCloseTo(0.034 * 60, 6) // 다음 프레임은 다시 34ms
  })

  it('view()와 send는 창 안 좌표, status().window는 화면 사각형이다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    const w = t.c.status().window!
    const box = petBox(foot(t), 56)
    expect(w).toEqual({ x: 1600, y: 57, width: 320, height: 240 })
    expect(t.c.view()!.box).toEqual({ x: box.x - w.x, y: box.y - w.y })
    expect(t.window.send.mock.lastCall![0].box).toEqual({ x: 264, y: 184.25 })
  })
})

describe('dispose', () => {
  it('타이머를 모두 지우고 이후 호출을 무시한다', () => {
    const t = make()
    t.c.start()
    vi.advanceTimersByTime(4000)
    t.c.dispose()
    expect(vi.getTimerCount()).toBe(0)
    t.c.press(true)
    t.c.worldChanged()
    t.c.refresh()
    vi.advanceTimersByTime(5000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('들고 있는 채 dispose하면 클릭 통과로 되돌리고 숨김으로 표시하며 몸짓을 멈춘다', () => {
    const t = make()
    t.c.start()
    t.env.buttons = true
    pickUp(t)
    expect(lastIgnore(t)).toBe(false)
    t.c.dispose()
    expect(lastIgnore(t)).toBe(true)
    expect(t.c.status()).toMatchObject({ shown: false, window: null })
    expect(t.c.status().mode).not.toBe('held')
    expect(t.c.view()).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    const calls = t.window.setIgnoreMouse.mock.calls.length
    t.c.press(false)
    t.c.press(true)
    t.c.setFullscreen(true)
    t.c.dispose()
    vi.advanceTimersByTime(5000)
    expect(t.window.setIgnoreMouse.mock.calls.length).toBe(calls)
    expect(t.window.hide).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('시계가 뒤로 가도', () => {
  const HOUR = 3_600_000

  it('바 방문 보장은 된 것으로 본다(뛰어내린 직후라도 다음 계획이 바 오르기)', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    t.env.random = 0
    untilMode(t, 'air', 61_000)
    untilMode(t, 'idle', 5000)
    t.env.clock = () => Date.now() - HOUR
    vi.advanceTimersByTime(5100) // 가만히 5초 뒤 계획
    expect(mode(t)).toBe('walk')
    untilMode(t, 'climb', 20_000)
  })

  it('더블클릭 시간은 지난 것으로 보고, 시계가 뒤로 간 누름은 클릭이 아니다', () => {
    const t = make()
    t.c.start()
    click(t)
    t.env.clock = () => Date.now() - HOUR
    vi.advanceTimersByTime(100)
    click(t)
    expect(t.openPalette).not.toHaveBeenCalled()
    expect(look(t).cueSeq).toBe(2)

    t.env.clock = null
    vi.advanceTimersByTime(600)
    t.c.press(true)
    t.env.clock = () => Date.now() - HOUR
    vi.advanceTimersByTime(100)
    t.c.press(false)
    expect(look(t).cueSeq).toBe(2)
    expect(t.openPalette).not.toHaveBeenCalled()
  })

  it('숨길 때 남은 쉼은 끝난 것으로 본다(다시 표시하면 바로 뛰어내린다)', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    vi.advanceTimersByTime(10_000) // 쉼 60초 중 10초
    t.env.clock = () => Date.now() - HOUR
    t.c.setFullscreen(true)
    t.c.setFullscreen(false)
    expect(mode(t)).toBe('sit')
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    expect(mode(t)).toBe('air')
  })
})

// ── 앱 반응과 말풍선(Task 7, 설계 §14-2 "앱과 연결", Review Focus 1·5) ──────────────

const COPIED: AppEvent = {
  type: 'prompt-copied',
  masking: 'restore',
  masked: [{ category: 'client', count: 1 }],
  target: 'Claude'
}
const COPIED_TEXT = '복사했어요. 고객사명 1건은 가명으로 바꿨어요. Claude 창에 붙여넣어 주세요.'
const WARN: AppEvent = { type: 'prompt-copied', masking: 'off', masked: [], target: 'Claude' }
const WARN_TEXT = '가명 처리가 꺼져 있어요. 이름이 그대로 들어갔어요.'
const UNMASKED: AppEvent = { type: 'unmasked', restored: 2 }
const NOTE: AppEvent = { type: 'capture-failed', reason: 'terminal' }

const reacts = (t: T): Record<string, unknown>[] =>
  t.log.mock.calls.filter(([e]) => e === 'pet.react').map(([, d]) => d)
const bubble = (t: T): PetView['bubble'] => t.c.view()!.bubble

/** 렌더러가 잰 말풍선(창 좌표): 자리 아래 가운데 180×58 */
function reportBubble(t: T): Rect {
  const slot = bubble(t)!.slot
  const r = {
    x: slot.x + (slot.width - 180) / 2,
    y: slot.y + slot.height - 58,
    width: 180,
    height: 58
  }
  t.c.bubbleRect(r)
  return r
}

describe('앱 반응', () => {
  it('걷는 중 복사: 같은 호출 안에서 말풍선·편지·폴짝을 보내고 멈춘다. 4초 뒤 말풍선이 사라진다', () => {
    const t = make()
    t.c.start()
    vi.advanceTimersByTime(5000)
    expect(mode(t)).toBe('walk')
    t.window.send.mockClear()
    const bounds = t.window.setBounds.mock.calls.length
    t.c.react(COPIED)
    expect(t.window.send).toHaveBeenCalledTimes(1)
    const v = t.window.send.mock.lastCall![0]
    expect(v.bubble).toMatchObject({ seq: 1, text: COPIED_TEXT, side: 'above' })
    expect(v.look).toMatchObject({ pose: 'stand', face: 'happy', cue: 'hop', cueSeq: 1 })
    // 선글라스(가명 처리 켬)는 그대로, 편지를 든다
    expect(v.look.props).toEqual(['sunglasses', 'envelope'])
    expect(mode(t)).toBe('idle')
    expect(reacts(t)).toEqual([{ kind: 'celebrate', bubble: true }])

    // 말풍선 자리: placeSlot(200×96, hop = hopRoom(56))을 창 좌표로
    const win = t.c.status().window!
    const box = petBox(foot(t), 56)
    const want = bubbleSlot({ box, window: win, bounds: MAIN.bounds, hop: hopRoom(56) })
    expect(v.bubble!.slot).toEqual({
      x: want.rect.x - win.x,
      y: want.rect.y - win.y,
      width: 200,
      height: 96
    })

    vi.advanceTimersByTime(3999)
    expect(bubble(t)?.text).toBe(COPIED_TEXT)
    vi.advanceTimersByTime(1)
    expect(bubble(t)).toBeNull()
    expect(t.window.send.mock.lastCall![0].bubble).toBeNull()
    expect(look(t).face).toBe('normal')
    expect(look(t).props).toEqual(['sunglasses'])
    // 반응 동안 창을 옮기지 않았다
    expect(t.window.setBounds.mock.calls.length).toBe(bounds)
  })

  it('반응이 끝나면 새 계획을 세운다(가만히였으면 다음 계획으로)', () => {
    const t = make()
    t.c.start()
    t.c.react(NOTE)
    vi.advanceTimersByTime(PET_TIMING.firstIdleMs + 500)
    // 첫 가만히 3초가 지났어도 반응 동안에는 계획하지 않는다
    expect(mode(t)).toBe('idle')
    vi.advanceTimersByTime(4000 - PET_TIMING.firstIdleMs - 500)
    expect(mode(t)).toBe('walk') // 바 오르기 계획
  })

  it('표의 네 줄: 경고는 걱정·느낌표(폴짝 없음), 되돌리기는 기쁨·폴짝, 가져오기 실패는 보통 얼굴', () => {
    const t = make()
    t.c.start()
    t.c.react(WARN)
    expect(look(t)).toMatchObject({
      face: 'worried',
      props: ['sunglasses', 'alert'],
      cue: null,
      cueSeq: 0
    })
    expect(bubble(t)).toMatchObject({ seq: 1, text: WARN_TEXT })
    t.c.react(UNMASKED)
    expect(look(t)).toMatchObject({ face: 'happy', props: ['sunglasses'], cue: 'hop', cueSeq: 1 })
    expect(bubble(t)).toMatchObject({ seq: 2, text: '원래 이름으로 되돌렸어요.' })
    t.c.react(NOTE)
    expect(look(t)).toMatchObject({ face: 'normal', props: ['sunglasses'], cue: 'hop', cueSeq: 1 })
    expect(bubble(t)).toMatchObject({ seq: 3, text: '터미널에서는 가져오지 않아요.' })
    expect(reacts(t)).toEqual([
      { kind: 'warn', bubble: true },
      { kind: 'hop', bubble: true },
      { kind: 'note', bubble: true }
    ])
  })

  it('(Review Focus 5) 1초에 10번: 마지막 문구 하나, seq 10, 반응 타이머는 하나(쉼 대신)라 타이머 수가 그대로', () => {
    const t = make()
    t.c.start()
    expect(vi.getTimerCount()).toBe(3) // 쉼·졸기·조회
    for (let i = 1; i <= 10; i++) {
      t.c.react({ ...COPIED, masked: [{ category: 'client', count: i }] } as AppEvent)
      expect(vi.getTimerCount(), `${i}번째`).toBe(3) // 반응·졸기·조회
      vi.advanceTimersByTime(100)
    }
    const v = t.c.view()!
    expect(v.bubble!.seq).toBe(10)
    expect(v.bubble!.text).toBe(
      '복사했어요. 고객사명 10건은 가명으로 바꿨어요. Claude 창에 붙여넣어 주세요.'
    )
    expect(look(t).cueSeq).toBe(10)
    // 새 반응이 타이머를 다시 시작한다: 마지막 반응 뒤 4초
    vi.advanceTimersByTime(4000 - 100 - 1)
    expect(bubble(t)).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(bubble(t)).toBeNull()
    expect(reacts(t)).toHaveLength(10)
  })

  it('(Review Focus 5) 숨김·전체 화면 중에는 반응하지 않고, 다시 표시해도 지난 반응이 나오지 않는다', () => {
    const off = make({ settings: { visible: false } })
    off.c.start()
    off.c.react(COPIED)
    expect(off.window.send).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(reacts(off)).toEqual([])

    const t = make()
    t.c.start()
    t.c.setFullscreen(true)
    t.window.send.mockClear()
    t.c.react(COPIED)
    t.c.react(WARN)
    expect(t.window.send).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    t.c.setFullscreen(false)
    expect(bubble(t)).toBeNull()
    expect(look(t).face).toBe('normal')
    expect(reacts(t)).toEqual([])
  })

  it('(Review Focus 5) 들고 있는 동안 두 번: 놓아서 바닥에 선 뒤 마지막 것 하나만', () => {
    const t = make()
    t.c.start()
    pickUp(t)
    t.window.send.mockClear()
    t.c.react(COPIED)
    t.c.react(WARN)
    expect(bubble(t)).toBeNull()
    expect(look(t)).toMatchObject({ pose: 'held', face: 'surprised' })
    expect(t.window.send.mock.calls.every(([v]) => v.bubble === null)).toBe(true)
    t.env.cursor = { x: 600, y: 900 }
    vi.advanceTimersByTime(200)
    t.c.press(false)
    expect(mode(t)).toBe('air')
    expect(bubble(t)).toBeNull()
    untilMode(t, 'idle', 3000)
    expect(bubble(t)).toMatchObject({ seq: 1, text: WARN_TEXT })
    expect(look(t)).toMatchObject({ face: 'worried', props: ['sunglasses', 'alert'] })
    expect(reacts(t)).toEqual([{ kind: 'warn', bubble: true }])
    expect(
      t.window.send.mock.calls
        .filter(([v]) => v.bubble !== null)
        .every(([v]) => v.bubble!.text === WARN_TEXT)
    ).toBe(true)
  })

  it('들고 있던 반응은 바 꼭대기에 놓으면 앉은 뒤 거기서 보인다', () => {
    const t = make()
    t.c.start()
    pickUp(t)
    t.c.react(UNMASKED)
    t.env.cursor = { x: 1892, y: 200 }
    vi.advanceTimersByTime(200)
    t.c.press(false)
    untilMode(t, 'sit', 1000)
    expect(bubble(t)).toMatchObject({ text: '원래 이름으로 되돌렸어요.', side: 'above' })
    expect(look(t)).toMatchObject({ pose: 'sit', face: 'happy' })
  })

  it('들림·숨김으로 저장한 반응은 버린다(숨긴 펫은 반응하지 않는다)', () => {
    const t = make()
    t.c.start()
    pickUp(t)
    t.c.react(COPIED)
    t.c.setFullscreen(true)
    t.c.setFullscreen(false)
    untilMode(t, 'idle', 3000)
    expect(bubble(t)).toBeNull()
    expect(reacts(t)).toEqual([])
  })

  it('반응 중 집어 들면 반응을 끝낸다(놀란 얼굴, 말풍선 없음)', () => {
    const t = make()
    t.c.start()
    t.c.react(COPIED)
    pickUp(t)
    expect(bubble(t)).toBeNull()
    expect(look(t)).toMatchObject({ pose: 'held', face: 'surprised', props: ['sunglasses'] })
    expect(vi.getTimerCount()).toBe(2) // 동작 고리·졸기(반응 타이머 없음)
  })

  it('반응 중 클릭은 폴짝만 하고 말풍선은 그대로', () => {
    const t = make()
    t.c.start()
    t.c.react(NOTE)
    click(t)
    expect(look(t)).toMatchObject({ cue: 'hop', cueSeq: 1, face: 'normal' })
    expect(bubble(t)).toMatchObject({ seq: 1 })
  })

  it('졸고 있으면 깬 뒤 반응한다', () => {
    const t = make({ bar: null, random: 0 })
    t.c.start()
    t.env.idle = 1000
    vi.advanceTimersByTime(180_000)
    expect(mode(t)).toBe('sleep')
    t.c.react(COPIED)
    expect(mode(t)).toBe('idle')
    expect(states(t)).toEqual(['sleep', 'wake'])
    expect(look(t)).toMatchObject({
      pose: 'stand',
      face: 'happy',
      props: ['sunglasses', 'envelope']
    })
    expect(bubble(t)).toMatchObject({ text: COPIED_TEXT })
  })

  it('잘 때가 됐어도 반응 중에는 졸지 않고, 반응이 끝나면 다시 확인한다', () => {
    const t = make({ bar: null, random: 0, settings: { sleepAfterMin: 1 } })
    t.c.start()
    t.env.idle = 1000
    vi.advanceTimersByTime(58_000)
    t.c.react(NOTE)
    vi.advanceTimersByTime(2500) // 졸기 확인(60초)은 반응 중
    expect(mode(t)).toBe('idle')
    expect(bubble(t)).not.toBeNull()
    vi.advanceTimersByTime(1500)
    expect(mode(t)).toBe('sleep')
  })

  it('앉아 있으면 꼭대기에서 반응하고, 쉼 시간은 반응 동안 멈췄다 이어 간다(타이머 3개 이하)', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    const sitAt = Date.now()
    vi.advanceTimersByTime(10_000) // 쉼 60초 중 10초
    t.c.react(COPIED)
    expect(mode(t)).toBe('sit')
    expect(look(t)).toMatchObject({ pose: 'sit', face: 'happy', props: ['sunglasses', 'envelope'] })
    expect(vi.getTimerCount()).toBeLessThanOrEqual(3) // 반응·졸기·조회
    vi.advanceTimersByTime(4000)
    expect(bubble(t)).toBeNull()
    expect(mode(t)).toBe('sit')
    expect(vi.getTimerCount()).toBeLessThanOrEqual(3) // 쉼·졸기·조회
    // 남은 쉼 50초 뒤(반응 4초만큼 늦게) 뛰어내린다. sitAt은 앉은 프레임보다 최대 한 프레임 늦게 잰 값
    vi.advanceTimersByTime(sitAt + 64_000 - Date.now() - 100)
    expect(mode(t)).toBe('sit')
    vi.advanceTimersByTime(200)
    expect(mode(t)).toBe('air')
  })

  it('오르는 중 반응: 반응 동안 멈췄다가(동작 고리 없음, 창 그대로) 이어 오른다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'climb')
    vi.advanceTimersByTime(1000)
    const y0 = foot(t).y
    const bounds = t.window.setBounds.mock.calls.length
    t.c.react(WARN)
    expect(mode(t)).toBe('climb')
    expect(look(t)).toMatchObject({
      pose: 'climb',
      face: 'worried',
      props: ['sunglasses', 'alert']
    })
    expect(vi.getTimerCount()).toBeLessThanOrEqual(3) // 반응·졸기·조회
    vi.advanceTimersByTime(3900)
    expect(foot(t).y).toBe(y0)
    expect(t.window.setBounds.mock.calls.length).toBe(bounds)
    vi.advanceTimersByTime(100 + 1000)
    expect(bubble(t)).toBeNull()
    expect(mode(t)).toBe('climb')
    expect(y0 - foot(t).y).toBeGreaterThan(40)
    untilMode(t, 'sit', 15_000)
  })

  it('반응 중 누르고 있어도(동작 고리) 오르기는 멈춘 채다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'climb')
    vi.advanceTimersByTime(1000)
    const y0 = foot(t).y
    t.c.react(NOTE)
    t.env.cursor = bodyPoint(t)
    t.c.press(true)
    vi.advanceTimersByTime(300)
    expect(foot(t).y).toBe(y0)
    t.c.press(false)
  })

  it('뛰어오르는 중 반응은 옆면에 붙어 오르기를 시작할 때 보인다(1초 안)', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'leap', 30_000)
    const at = Date.now()
    t.c.react(COPIED)
    expect(bubble(t)).toBeNull()
    until(() => bubble(t) !== null, 1000)
    expect(Date.now() - at).toBeLessThan(1000)
    expect(mode(t)).toBe('climb')
    expect(look(t)).toMatchObject({ pose: 'climb', face: 'happy' })
  })

  it('꼭대기로 올라서는 300ms 동안 온 반응은 앉은 뒤 보인다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'climb')
    until(() => foot(t).y === 292, 12_000)
    vi.advanceTimersByTime(PET_LOOP.frameMs) // 올라서는 중
    expect(mode(t)).toBe('climb')
    t.c.react(UNMASKED)
    expect(bubble(t)).toBeNull()
    untilMode(t, 'sit', 1000)
    expect(bubble(t)).toMatchObject({ text: '원래 이름으로 되돌렸어요.' })
  })

  it('뛰어내리는 중 반응은 바닥에 선 뒤 보인다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    untilMode(t, 'air', 61_000)
    t.c.react(NOTE)
    expect(bubble(t)).toBeNull()
    untilMode(t, 'idle', 5000)
    expect(bubble(t)).toMatchObject({ text: '터미널에서는 가져오지 않아요.' })
  })

  it('꼭대기가 화면 위쪽이면 말풍선은 옆(창 안)', () => {
    const t = make({ bar: { rect: { x: 1864, y: 120, width: 56, height: 456 }, edge: 'right' } })
    t.c.start()
    dropFrom(t, { x: 1892, y: 110 })
    untilMode(t, 'sit', 1000)
    t.c.react(COPIED)
    const win = t.c.status().window!
    expect(win).toEqual({ x: 1600, y: 0, width: 320, height: 240 })
    expect(bubble(t)).toMatchObject({
      side: 'left',
      slot: { x: 56, y: 49.25, width: 200, height: 96 }
    })
  })

  it('앉은 채 바를 옮기면 말풍선도 따라간다(창은 한 번 옮김)', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    t.c.react(COPIED)
    const before = bubble(t)!
    const winBefore = t.c.status().window!
    const bounds = t.window.setBounds.mock.calls.length
    t.env.bar = { rect: { x: 1864, y: 400, width: 56, height: 456 }, edge: 'right' }
    t.c.worldChanged()
    const after = bubble(t)!
    const winAfter = t.c.status().window!
    expect(after.seq).toBe(before.seq)
    // 화면에서 말풍선 자리가 바와 같이 108 DIP 내려간다
    expect(winAfter.y + after.slot.y).toBe(winBefore.y + before.slot.y + (400 - 292))
    expect(t.window.setBounds.mock.calls.length).toBe(bounds + 1)
  })

  it('앉은 채 바가 없어져 떨어지면 반응을 끝낸다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    t.c.react(COPIED)
    t.env.bar = null
    t.c.worldChanged()
    expect(mode(t)).toBe('air')
    expect(bubble(t)).toBeNull()
    untilMode(t, 'idle', 3000)
    expect(bubble(t)).toBeNull()
  })

  it('숨겼다 다시 표시하면 반응은 끝나 있고 앉은 쉼은 남은 시간대로 이어 간다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    const sitAt = Date.now()
    vi.advanceTimersByTime(20_000)
    t.c.react(COPIED)
    vi.advanceTimersByTime(1000)
    t.c.setFullscreen(true)
    vi.advanceTimersByTime(30_000)
    t.c.setFullscreen(false)
    expect(mode(t)).toBe('sit')
    expect(bubble(t)).toBeNull()
    // 쉼 60초 중 20초 + 반응 1초 + 숨김 30초: 남은 40초 뒤 뛰어내린다(sitAt은 최대 한 프레임 늦게 잰 값)
    vi.advanceTimersByTime(sitAt + 20_000 + 1000 + 30_000 + 40_000 - Date.now() - 100)
    expect(mode(t)).toBe('sit')
    vi.advanceTimersByTime(200)
    expect(mode(t)).toBe('air')
  })

  it('반응 끔이면 반응하지 않는다. 말풍선 끔이면 말풍선 없이 1.5초, 가져오기 실패는 없음', () => {
    const off = make({ settings: { reactions: false } })
    off.c.start()
    off.window.send.mockClear()
    off.c.react(COPIED)
    expect(off.window.send).not.toHaveBeenCalled()
    expect(reacts(off)).toEqual([])

    const quiet = make({ settings: { bubbles: false } })
    quiet.c.start()
    quiet.c.react(NOTE)
    expect(reacts(quiet)).toEqual([])
    quiet.c.react(COPIED)
    expect(look(quiet)).toMatchObject({
      face: 'happy',
      props: ['sunglasses', 'envelope'],
      cue: 'hop'
    })
    expect(bubble(quiet)).toBeNull()
    expect(reacts(quiet)).toEqual([{ kind: 'celebrate', bubble: false }])
    vi.advanceTimersByTime(1499)
    expect(look(quiet).face).toBe('happy')
    vi.advanceTimersByTime(1)
    expect(look(quiet).face).toBe('normal')
  })

  it('refresh로 반응을 끄면 보이던 반응도 끝나고, 말풍선을 끄면 말풍선이 닫힌다', () => {
    const t = make()
    t.c.start()
    t.c.react(COPIED)
    t.env.settings = { ...t.env.settings, bubbles: false }
    t.c.refresh()
    expect(bubble(t)).toBeNull()
    t.c.react(COPIED)
    expect(look(t).face).toBe('happy')
    t.env.settings = { ...t.env.settings, reactions: false }
    t.c.refresh()
    expect(look(t).face).toBe('normal')
  })

  it('가명 처리 모드 변경(refresh)은 반응이 아니다: 말풍선 없이 선글라스만 바뀐다', () => {
    const t = make()
    t.c.start()
    t.env.masking = 'off'
    t.c.refresh()
    expect(t.window.send.mock.lastCall![0]).toMatchObject({
      bubble: null,
      look: { face: 'normal', props: [] }
    })
    t.env.masking = 'remove'
    t.c.refresh()
    expect(t.window.send.mock.lastCall![0]).toMatchObject({
      bubble: null,
      look: { face: 'normal', props: ['sunglasses'] }
    })
    expect(reacts(t)).toEqual([])
  })

  it('기록 pet.react에는 종류와 말풍선 여부만(문구·AI 이름 없음)', () => {
    const t = make()
    t.c.start()
    for (const e of [COPIED, WARN, UNMASKED, NOTE]) t.c.react(e)
    const json = JSON.stringify(t.log.mock.calls)
    for (const word of [
      '복사했어요',
      'Claude',
      '고객사명',
      '가명 처리가 꺼져',
      '되돌렸어요',
      '터미널'
    ])
      expect(json, word).not.toContain(word)
  })

  it('dispose하면 반응 타이머도 지운다', () => {
    const t = make()
    t.c.start()
    t.c.react(COPIED)
    t.c.dispose()
    expect(vi.getTimerCount()).toBe(0)
    t.c.react(COPIED)
    t.c.bubbleClick()
    t.c.bubbleRect({ x: 0, y: 0, width: 10, height: 10 })
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('말풍선 누르기·클릭 판정', () => {
  it('bubbleClick: 즉시 말풍선을 닫고 반응을 끝낸다', () => {
    const t = make()
    t.c.start()
    t.c.react(COPIED)
    t.window.send.mockClear()
    t.c.bubbleClick()
    expect(t.window.send).toHaveBeenCalledTimes(1)
    expect(t.window.send.mock.lastCall![0]).toMatchObject({
      bubble: null,
      look: { face: 'normal' }
    })
    // 말풍선이 없을 때 누름은 무시
    t.window.send.mockClear()
    t.c.bubbleClick()
    expect(t.window.send).not.toHaveBeenCalled()
  })

  it('(Review Focus 1) 보고한 말풍선 위에서는 클릭을 받고, 눌러 닫은 뒤 커서가 몸 밖이면 마지막 setIgnoreMouse는 true', () => {
    const t = make()
    t.c.start()
    t.c.react(COPIED)
    const r = reportBubble(t)
    const win = t.c.status().window!
    t.env.cursor = { x: win.x + r.x + 90, y: win.y + r.y + 20 }
    vi.advanceTimersByTime(150)
    expect(lastIgnore(t)).toBe(false)
    t.c.bubbleClick()
    expect(bubble(t)).toBeNull()
    expect(lastIgnore(t)).toBe(true)
    vi.advanceTimersByTime(500)
    expect(lastIgnore(t)).toBe(true)
  })

  it('(Review Focus 1) 커서가 말풍선 위에 있는 채 4초가 지나 사라져도 마지막 setIgnoreMouse는 true', () => {
    const t = make()
    t.c.start()
    t.c.react(NOTE)
    const r = reportBubble(t)
    const win = t.c.status().window!
    t.env.cursor = { x: win.x + r.x + 10, y: win.y + r.y + 10 }
    vi.advanceTimersByTime(200)
    expect(lastIgnore(t)).toBe(false)
    vi.advanceTimersByTime(3800)
    expect(bubble(t)).toBeNull()
    expect(lastIgnore(t)).toBe(true)
  })

  it('bubbleRect(null)이면 판정에서 빼고, 말풍선이 없을 때 온 사각형·잘못된 사각형은 무시한다', () => {
    const t = make()
    t.c.start()
    const win = t.c.status().window!
    // 반응 전에 온(늦은) 사각형
    t.c.bubbleRect({ x: 60, y: 80, width: 180, height: 58 })
    t.env.cursor = { x: win.x + 100, y: win.y + 100 }
    vi.advanceTimersByTime(200)
    expect(lastIgnore(t)).toBe(true)

    t.c.react(COPIED)
    for (const bad of [
      { x: Number.NaN, y: 80, width: 180, height: 58 },
      { x: 60, y: 80, width: 0, height: 58 },
      { x: 60, y: 80, width: -5, height: 58 }
    ]) {
      t.c.bubbleRect(bad)
      vi.advanceTimersByTime(100)
      expect(lastIgnore(t)).toBe(true)
    }
    t.c.bubbleRect({ x: 60, y: 80, width: 180, height: 58 })
    vi.advanceTimersByTime(100)
    expect(lastIgnore(t)).toBe(false)
    t.c.bubbleRect(null)
    vi.advanceTimersByTime(100)
    expect(lastIgnore(t)).toBe(true)
  })

  it('(fix 1) 같은 문구의 새 말풍선(가명 처리 끈 채 두 번 복사): 사각형을 버리고, 렌더러가 새 seq로 다시 알리면 눌러 닫힌다', () => {
    const t = make()
    t.c.start()
    t.c.react(WARN)
    const r = reportBubble(t)
    const win = t.c.status().window!
    t.env.cursor = { x: win.x + r.x + 20, y: win.y + r.y + 10 }
    vi.advanceTimersByTime(100)
    expect(lastIgnore(t)).toBe(false)
    vi.advanceTimersByTime(1000)
    t.c.react(WARN) // 4초 안에 두 번째 복사: 문구·자리가 같은 새 말풍선
    expect(bubble(t)).toMatchObject({ seq: 2, text: WARN_TEXT })
    vi.advanceTimersByTime(100)
    expect(lastIgnore(t)).toBe(true) // main은 새 반응마다 사각형을 버린다
    t.c.bubbleRect(r) // 렌더러가 seq 2를 재어 다시 알림(bubbleMeasureKey에 seq가 있어서)
    vi.advanceTimersByTime(100)
    expect(lastIgnore(t)).toBe(false)
    t.c.bubbleClick()
    expect(bubble(t)).toBeNull()
    expect(lastIgnore(t)).toBe(true)
  })

  it('새 반응이 이전 말풍선을 대체하면 렌더러가 새로 잴 때까지 옛 사각형으로 클릭을 막지 않는다', () => {
    const t = make()
    t.c.start()
    t.c.react(COPIED)
    const r = reportBubble(t)
    const win = t.c.status().window!
    t.env.cursor = { x: win.x + r.x + 5, y: win.y + r.y + 5 }
    vi.advanceTimersByTime(100)
    expect(lastIgnore(t)).toBe(false)
    t.c.react(NOTE)
    vi.advanceTimersByTime(100)
    expect(lastIgnore(t)).toBe(true)
  })
})

describe('(Task 6 이월) 움직임 줄이기의 클릭 표시', () => {
  it(`클릭하면 폴짝 대신 ${REDUCED_CLICK_FACE_MS}ms 동안 웃는다(타이머를 늘리지 않음, 커서 조회로 되돌림)`, () => {
    const t = make({ bar: null, settings: { reduceMotion: true } })
    t.c.start()
    expect(vi.getTimerCount()).toBe(3)
    click(t)
    expect(look(t)).toMatchObject({ face: 'happy', cue: null, cueSeq: 0 })
    expect(t.window.send.mock.lastCall![0].look.face).toBe('happy')
    expect(vi.getTimerCount()).toBe(3)
    // 뗀 순간(클릭)부터 잰다
    vi.advanceTimersByTime(REDUCED_CLICK_FACE_MS - 1)
    expect(look(t).face).toBe('happy')
    vi.advanceTimersByTime(2)
    expect(look(t).face).toBe('normal')
    expect(t.window.send.mock.lastCall![0].look.face).toBe('normal')
    expect(vi.getTimerCount()).toBe(3)
  })

  it('움직임이 켜져 있으면 클릭은 폴짝만(얼굴은 그대로), 반응 중에는 반응 얼굴이 이긴다', () => {
    const moving = make({ bar: null })
    moving.c.start()
    click(moving)
    expect(look(moving)).toMatchObject({ face: 'normal', cue: 'hop' })

    const t = make({ bar: null, settings: { reduceMotion: true } })
    t.c.start()
    t.c.react(WARN)
    click(t)
    expect(look(t)).toMatchObject({ face: 'worried', cue: null })
  })

  it('앉아 있을 때 클릭해도 같고, 들어 올리면 놀란 얼굴이 이긴다', () => {
    const t = make({ settings: { reduceMotion: true } })
    t.c.start()
    untilMode(t, 'sit')
    t.env.cursor = bodyPoint(t)
    click(t)
    expect(look(t)).toMatchObject({ pose: 'sit', face: 'happy' })
    vi.advanceTimersByTime(REDUCED_CLICK_FACE_MS)
    expect(look(t)).toMatchObject({ pose: 'sit', face: 'content' })
    click(t)
    pickUp(t)
    expect(look(t)).toMatchObject({ pose: 'held', face: 'surprised' })
  })
})

// ── 오른쪽 클릭 메뉴와 조종 모드(Task 8, 설계 §14-2, Review Focus 1) ──────────────

/** 펫·메뉴에서 먼 곳(바닥 가운데 펫의 창 + 120 밖) */
const AWAY = { x: 300, y: 300 }

const menu = (t: T): PetView['menu'] => t.c.view()!.menu
const menus = (t: T): Record<string, unknown>[] =>
  t.log.mock.calls.filter(([e]) => e === 'pet.menu').map(([, d]) => d)
const controls = (t: T): Record<string, unknown>[] =>
  t.log.mock.calls.filter(([e]) => e === 'pet.control').map(([, d]) => d)

/** 메뉴 n번째 행 가운데(화면 DIP) */
function menuRow(t: T, n: number): { x: number; y: number } {
  const m = menu(t)!
  const w = t.c.status().window!
  return {
    x: w.x + m.rect.x + m.rect.width / 2,
    y: w.y + m.rect.y + SLOT.menuPad + SLOT.menuRow * n + SLOT.menuRow / 2
  }
}

/** 몸 위에서 오른쪽 클릭해 메뉴를 연다 */
function openMenu(t: T): void {
  t.env.cursor = bodyPoint(t)
  t.c.contextMenu()
  expect(menu(t)).not.toBeNull()
}

describe('오른쪽 클릭 메뉴(설계 §14-2, 닫기는 M5 펼침 메뉴와 같은 규칙)', () => {
  it('contextMenu: 4행 메뉴를 펫 위에 열고 걷던 펫을 멈춘다. 동작 고리 없이 조회·졸기 타이머 2개, 창은 그대로, 다시 누르면 닫힌다', () => {
    const t = make()
    t.c.start()
    vi.advanceTimersByTime(5000)
    expect(mode(t)).toBe('walk')
    t.env.cursor = bodyPoint(t)
    t.window.send.mockClear()
    t.window.setBounds.mockClear()
    t.c.contextMenu()
    expect(mode(t)).toBe('idle')
    const m = menu(t)!
    expect(m.rows.map((r) => r.action)).toEqual(['control', 'sleep', 'hide', 'settings'])
    const win = t.c.status().window!
    const want = menuSlot({ rows: 4, box: petBox(foot(t), 56), window: win, bounds: MAIN.bounds })
    expect(m.side).toBe('above')
    expect(m.rect).toEqual({
      x: want.rect.x - win.x,
      y: want.rect.y - win.y,
      width: 176,
      height: 136
    })
    // 같은 호출 안에서 보낸다
    expect(t.window.send).toHaveBeenCalledTimes(1)
    expect(t.window.send.mock.lastCall![0].menu).toEqual(m)
    expect(vi.getTimerCount()).toBe(2) // 조회·졸기(동작 고리·쉼 없음)
    const at = foot(t)
    t.env.cursor = menuRow(t, 0)
    vi.advanceTimersByTime(3000)
    expect(foot(t)).toEqual(at)
    expect(t.window.setBounds).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(2)
    t.c.contextMenu()
    expect(menu(t)).toBeNull()
    expect(t.window.send.mock.lastCall![0].menu).toBeNull()
    expect(menus(t)).toEqual([]) // 열고 닫기는 기록하지 않는다
  })

  it('열린 동안 버튼이 눌리고 커서가 펫·메뉴 밖이면 50ms 안에 닫힌다', () => {
    const t = make()
    t.c.start()
    openMenu(t)
    t.env.buttons = true // 오른쪽 버튼을 아직 누르고 있다(펫 위)
    vi.advanceTimersByTime(200)
    expect(menu(t)).not.toBeNull()
    t.env.cursor = AWAY
    vi.advanceTimersByTime(FLYOUT_TIMING.dismissPollMs)
    expect(menu(t)).toBeNull()
    expect(lastIgnore(t)).toBe(true)
  })

  it('버튼 조회가 null이어도 커서가 1.5초 동안 펫·메뉴 밖이면 닫힌다. 그 전에 메뉴로 돌아오면 다시 센다', () => {
    const t = make()
    t.c.start()
    openMenu(t)
    t.env.buttons = null
    t.env.cursor = AWAY
    vi.advanceTimersByTime(1000)
    expect(menu(t)).not.toBeNull()
    t.env.cursor = menuRow(t, 2)
    vi.advanceTimersByTime(100)
    t.env.cursor = AWAY
    vi.advanceTimersByTime(FLYOUT_TIMING.menuAwayMs - 100)
    expect(menu(t)).not.toBeNull()
    vi.advanceTimersByTime(150)
    expect(menu(t)).toBeNull()
  })

  it('커서가 메뉴 위에 있으면 버튼을 눌러도 열려 있고(클릭을 받음), 계획을 미룬다', () => {
    const t = make()
    t.c.start()
    openMenu(t)
    t.env.cursor = menuRow(t, 1)
    t.env.buttons = true
    vi.advanceTimersByTime(10_000)
    expect(menu(t)).not.toBeNull()
    expect(mode(t)).toBe('idle')
    expect(lastIgnore(t)).toBe(false)
  })

  it('(Review Focus 1) 행을 골라 닫히거나 바깥 클릭으로 닫힌 뒤 커서가 몸 밖이면 마지막 setIgnoreMouse는 true', () => {
    const t = make()
    t.c.start()
    t.env.cursor = bodyPoint(t)
    vi.advanceTimersByTime(PET_LOOP.hitFarMs)
    expect(lastIgnore(t)).toBe(false)
    t.c.contextMenu()
    t.env.cursor = menuRow(t, 3)
    vi.advanceTimersByTime(200)
    expect(lastIgnore(t)).toBe(false)
    t.c.menuAction('settings')
    expect(menu(t)).toBeNull()
    expect(lastIgnore(t)).toBe(true) // 같은 호출 안에서(다음 조회를 기다리지 않음)
    vi.advanceTimersByTime(500)
    expect(lastIgnore(t)).toBe(true)

    t.env.cursor = bodyPoint(t)
    vi.advanceTimersByTime(PET_LOOP.hitFarMs)
    t.c.contextMenu()
    t.env.cursor = menuRow(t, 0)
    vi.advanceTimersByTime(100)
    expect(lastIgnore(t)).toBe(false)
    t.env.cursor = AWAY
    t.env.buttons = true
    vi.advanceTimersByTime(FLYOUT_TIMING.dismissPollMs)
    expect(menu(t)).toBeNull()
    expect(lastIgnore(t)).toBe(true)
  })

  it('열린 동안 계획을 미루고, 닫으면 가만히의 남은 시간을 이어 간다', () => {
    const t = make()
    t.c.start()
    vi.advanceTimersByTime(1000) // 첫 가만히 3초 중 1초
    openMenu(t)
    t.env.cursor = menuRow(t, 0)
    vi.advanceTimersByTime(20_000)
    expect(mode(t)).toBe('idle')
    t.c.contextMenu()
    expect(menu(t)).toBeNull()
    vi.advanceTimersByTime(1999)
    expect(mode(t)).toBe('idle')
    vi.advanceTimersByTime(2)
    expect(mode(t)).toBe('walk')
  })

  it('열린 동안 졸 때가 되면 미뤘다가 닫은 뒤 다시 확인한다', () => {
    const t = make({ bar: null, random: 0, settings: { sleepAfterMin: 1 } })
    t.c.start()
    t.env.idle = 1000
    vi.advanceTimersByTime(59_000)
    expect(mode(t)).toBe('idle')
    openMenu(t)
    t.env.cursor = menuRow(t, 0)
    vi.advanceTimersByTime(2000) // 60초의 졸기 확인은 메뉴가 열린 동안
    expect(mode(t)).toBe('idle')
    expect(t.idleSeconds).toHaveBeenCalledTimes(1)
    t.c.contextMenu()
    expect(mode(t)).toBe('sleep')
    expect(states(t)).toEqual(['sleep'])
  })

  it('열린 동안 커서 조회는 50ms 이하 간격(닫기 확인을 겸하고 새 타이머는 없다)', () => {
    const t = make()
    t.c.start()
    openMenu(t)
    t.env.cursor = AWAY
    vi.advanceTimersByTime(100)
    t.cursor.mockClear()
    vi.advanceTimersByTime(1000)
    expect(t.cursor.mock.calls.length).toBeGreaterThanOrEqual(19)
    expect(vi.getTimerCount()).toBe(2)
  })

  it('들린·날던·오르던 펫, 숨긴 펫, 조종 중에는 열지 않는다', () => {
    const held = make()
    held.c.start()
    pickUp(held)
    held.c.contextMenu()
    expect(menu(held)).toBeNull()
    held.c.press(false)
    expect(mode(held)).toBe('air')
    held.c.contextMenu()
    expect(menu(held)).toBeNull()

    const climbing = make()
    climbing.c.start()
    untilMode(climbing, 'climb')
    climbing.c.contextMenu()
    expect(menu(climbing)).toBeNull()

    const hidden = make()
    hidden.c.start()
    hidden.c.setFullscreen(true)
    hidden.c.contextMenu()
    hidden.c.setFullscreen(false)
    expect(menu(hidden)).toBeNull()

    const driving = make()
    driving.c.start()
    driving.c.startControl()
    driving.c.contextMenu()
    expect(menu(driving)).toBeNull()
  })

  it('열린 동안 펫을 누르면 메뉴를 닫고 클릭(폴짝)으로 처리한다', () => {
    const t = make()
    t.c.start()
    openMenu(t)
    click(t)
    expect(menu(t)).toBeNull()
    expect(look(t)).toMatchObject({ cue: 'hop', cueSeq: 1 })
    expect(t.log).toHaveBeenCalledWith('pet.click', { kind: 'hop' })
  })

  it('열린 동안 온 반응은 메뉴가 닫힌 뒤 마지막 하나만 보인다(메뉴와 말풍선이 겹치지 않음)', () => {
    const t = make()
    t.c.start()
    openMenu(t)
    t.c.react(COPIED)
    t.c.react(WARN)
    expect(bubble(t)).toBeNull()
    expect(menu(t)).not.toBeNull()
    expect(reacts(t)).toEqual([])
    t.c.menuAction('settings')
    expect(menu(t)).toBeNull()
    expect(bubble(t)).toMatchObject({ seq: 1, text: WARN_TEXT })
    expect(reacts(t)).toEqual([{ kind: 'warn', bubble: true }])
  })

  it('메뉴를 열면 보이던 말풍선은 닫힌다(앉아 있던 쉼은 반응·메뉴 동안 멈췄다 이어 간다)', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    const sitAt = Date.now()
    vi.advanceTimersByTime(10_000)
    t.c.react(COPIED)
    vi.advanceTimersByTime(1000)
    openMenu(t)
    expect(bubble(t)).toBeNull()
    t.env.cursor = menuRow(t, 0)
    vi.advanceTimersByTime(5000)
    t.c.contextMenu()
    // 쉼 60초 중 10초 + 반응 1초(멈춤) + 메뉴 5초(멈춤): 남은 50초 뒤 뛰어내린다(sitAt은 최대 한 프레임 늦게 잰 값)
    vi.advanceTimersByTime(sitAt + 10_000 + 1000 + 5000 + 50_000 - Date.now() - 100)
    expect(mode(t)).toBe('sit')
    vi.advanceTimersByTime(200)
    expect(mode(t)).toBe('air')
  })

  it('잠든 펫: 두 번째 행은 깨우기, 메뉴 위의 커서로는 깨지 않는다. 깨우기 → 바닥이면 가만히', () => {
    const t = make({ bar: null, random: 0 })
    t.c.start()
    t.env.idle = 1000
    vi.advanceTimersByTime(180_000 - 300)
    t.env.cursor = { x: 960, y: 1033 } // 잠들 때 이미 몸 위(한 번 나가야 깬다)
    vi.advanceTimersByTime(300)
    expect(mode(t)).toBe('sleep')
    t.c.contextMenu()
    expect(menu(t)!.rows[1]).toEqual({ action: 'wake', title: '깨우기' })
    t.env.cursor = AWAY // 몸 밖으로 한 번 나간다(다음에 몸 위로 오면 깬다)
    vi.advanceTimersByTime(100)
    t.env.cursor = menuRow(t, 1) // 메뉴는 몸이 아니다
    vi.advanceTimersByTime(300)
    expect(mode(t)).toBe('sleep')
    expect(lastIgnore(t)).toBe(false)
    expect(vi.getTimerCount()).toBe(1) // 조회만
    t.c.menuAction('wake')
    expect(mode(t)).toBe('idle')
    expect(menu(t)).toBeNull()
    expect(states(t)).toEqual(['sleep', 'wake'])
    expect(menus(t)).toEqual([{ action: 'wake' }])
  })

  it('잠든 펫의 메뉴가 열린 채 커서가 몸으로 돌아오면 깨고 두 번째 행이 재우기로 바뀐다', () => {
    const t = make({ bar: null, random: 0 })
    t.c.start()
    t.env.idle = 1000
    vi.advanceTimersByTime(180_000 - 300)
    t.env.cursor = { x: 960, y: 1033 }
    vi.advanceTimersByTime(300)
    t.c.contextMenu()
    t.env.cursor = AWAY
    vi.advanceTimersByTime(100)
    t.env.cursor = { x: 960, y: 1033 }
    vi.advanceTimersByTime(100)
    expect(mode(t)).toBe('idle')
    expect(menu(t)!.rows[1].action).toBe('sleep')
    expect(t.window.send.mock.lastCall![0].menu!.rows[1].action).toBe('sleep')
  })

  it('잠든 펫의 메뉴가 열린 동안 온 반응은 메뉴가 닫히면 깨워서 보인다(졸 때 반응과 같음)', () => {
    const t = make({ bar: null, random: 0 })
    t.c.start()
    t.env.idle = 1000
    vi.advanceTimersByTime(180_000 - 300)
    t.env.cursor = { x: 960, y: 1033 }
    vi.advanceTimersByTime(300)
    t.c.contextMenu()
    t.c.react(COPIED)
    expect(mode(t)).toBe('sleep')
    expect(bubble(t)).toBeNull()
    t.c.contextMenu()
    expect(menu(t)).toBeNull()
    expect(mode(t)).toBe('idle')
    expect(states(t)).toEqual(['sleep', 'wake'])
    expect(bubble(t)).toMatchObject({ text: COPIED_TEXT })
  })

  it('꼭대기에서 졸던 펫을 메뉴로 깨우면 다시 앉는다', () => {
    const t = make({ settings: { sleepAfterMin: 1 } })
    t.c.start()
    t.env.idle = 1000
    vi.advanceTimersByTime(60_000)
    expect(mode(t)).toBe('sleep')
    expect(foot(t)).toEqual({ x: 1892, y: 292 })
    t.c.contextMenu()
    t.c.menuAction('wake')
    expect(mode(t)).toBe('sit')
  })

  it("동작 '재우기': 그 자리에서 졸고, 커서가 몸 위에 그대로면 깨지 않으며 나갔다 들어오면 깬다", () => {
    const t = make()
    t.c.start()
    openMenu(t)
    t.c.menuAction('sleep')
    expect(mode(t)).toBe('sleep')
    expect(menu(t)).toBeNull()
    expect(look(t)).toMatchObject({ pose: 'sleep', face: 'asleep' })
    expect(states(t)).toEqual(['sleep'])
    expect(menus(t)).toEqual([{ action: 'sleep' }])
    vi.advanceTimersByTime(3000)
    expect(mode(t)).toBe('sleep') // 커서가 몸 위에 그대로
    expect(vi.getTimerCount()).toBe(1) // 조회만
    t.env.cursor = AWAY
    vi.advanceTimersByTime(PET_LOOP.hitSleepMs)
    t.env.cursor = bodyPoint(t)
    vi.advanceTimersByTime(PET_LOOP.hitSleepMs)
    expect(mode(t)).toBe('idle')
    expect(states(t)).toEqual(['sleep', 'wake'])
  })

  it("동작 '재우기'를 메뉴 행에서 누르면(커서는 몸 밖) 다음에 몸 위로 올 때 깬다", () => {
    const t = make()
    t.c.start()
    openMenu(t)
    t.env.cursor = menuRow(t, 1)
    vi.advanceTimersByTime(100)
    t.c.menuAction('sleep')
    expect(mode(t)).toBe('sleep')
    expect(lastIgnore(t)).toBe(true) // 메뉴가 사라진 자리는 통과
    vi.advanceTimersByTime(1000)
    expect(mode(t)).toBe('sleep')
    t.env.cursor = bodyPoint(t)
    vi.advanceTimersByTime(PET_LOOP.hitSleepMs)
    expect(mode(t)).toBe('idle')
  })

  it("동작 '숨기기': setVisible(false)를 부르고 바로 숨긴다(클릭 통과·타이머 0). 저장 전 세계 변화로 다시 나타나지 않는다", async () => {
    const t = make()
    t.c.start()
    openMenu(t)
    t.c.menuAction('hide')
    expect(t.setVisible.mock.calls).toEqual([[false]])
    expect(t.window.hide).toHaveBeenCalledTimes(1)
    expect(t.c.status()).toMatchObject({ shown: false, window: null })
    expect(lastIgnore(t)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(t.log).toHaveBeenCalledWith('pet.visibility', { visible: false, reason: 'setting' })
    expect(menus(t)).toEqual([{ action: 'hide' }])
    t.c.worldChanged()
    expect(t.window.showInactive).toHaveBeenCalledTimes(1)
    // 런타임이 저장한 뒤 refresh
    t.env.settings = { ...t.env.settings, visible: false }
    t.c.refresh()
    await Promise.resolve()
    t.c.worldChanged()
    expect(t.c.status().shown).toBe(false)
    // 나중에 바의 펫 단추로 다시 부른다
    t.env.settings = { ...t.env.settings, visible: true }
    t.c.refresh()
    expect(t.window.showInactive).toHaveBeenCalledTimes(2)
  })

  it("'숨기기' 저장이 실패하면 다시 나타난다(설정은 그대로 보이기)", async () => {
    const t = make({ setVisible: () => Promise.reject(new Error('저장 실패')) })
    t.c.start()
    openMenu(t)
    t.c.menuAction('hide')
    expect(t.c.status().shown).toBe(false)
    await Promise.resolve()
    await Promise.resolve()
    expect(t.c.status().shown).toBe(true)
    expect(t.window.showInactive).toHaveBeenCalledTimes(2)
  })

  it("동작 '펫 설정': openSettings를 부르고 메뉴를 닫는다(펫은 하던 대로)", () => {
    const t = make()
    t.c.start()
    openMenu(t)
    t.c.menuAction('settings')
    expect(t.openSettings).toHaveBeenCalledTimes(1)
    expect(menu(t)).toBeNull()
    expect(menus(t)).toEqual([{ action: 'settings' }])
    vi.advanceTimersByTime(PET_TIMING.firstIdleMs)
    expect(mode(t)).toBe('walk')
  })

  it('메뉴가 닫힌 뒤 온 동작(늦은 클릭)은 무시한다', () => {
    const t = make()
    t.c.start()
    for (const a of ['control', 'sleep', 'wake', 'hide', 'settings'] as const) t.c.menuAction(a)
    expect(t.setVisible).not.toHaveBeenCalled()
    expect(t.openSettings).not.toHaveBeenCalled()
    expect(t.c.controlling()).toBe(false)
    expect(mode(t)).toBe('idle')
    expect(menus(t)).toEqual([])
  })

  it('열린 채 앉아 있던 바가 옮겨지면 메뉴가 따라가고, 바가 없어지면 떨어지며 메뉴를 닫는다', () => {
    const t = make()
    t.c.start()
    untilMode(t, 'sit')
    openMenu(t)
    const before = menu(t)!
    t.env.bar = { rect: { x: 1864, y: 400, width: 56, height: 456 }, edge: 'right' }
    t.c.worldChanged()
    expect(mode(t)).toBe('sit')
    expect(menu(t)).toEqual(before) // 창이 펫과 함께 옮겨지므로 창 좌표는 그대로
    t.env.bar = null
    t.c.worldChanged()
    expect(mode(t)).toBe('air')
    expect(menu(t)).toBeNull()
    untilMode(t, 'idle', 3000)
  })

  it('꼭대기가 화면 위쪽이면 메뉴는 펫 옆(창 안)', () => {
    const t = make({ bar: { rect: { x: 1864, y: 120, width: 56, height: 456 }, edge: 'right' } })
    t.c.start()
    dropFrom(t, { x: 1892, y: 110 })
    untilMode(t, 'sit', 1000)
    t.c.contextMenu()
    expect(t.c.status().window).toEqual({ x: 1600, y: 0, width: 320, height: 240 })
    expect(menu(t)).toMatchObject({
      side: 'left',
      rect: { x: 80, y: 29.25, width: 176, height: 136 }
    })
  })

  it('(fix) 몸과 메뉴 사이 틈(약 21 DIP)에서는 클릭을 받고 메뉴가 열려 있다(몸에서 행으로 가는 길·틈 누름). 닫힌 뒤 틈은 통과', () => {
    const t = make()
    t.c.start()
    openMenu(t)
    // 메뉴가 열린 동안 조회는 50ms 이하 간격
    vi.advanceTimersByTime(FLYOUT_TIMING.dismissPollMs + 1)
    expect(lastIgnore(t)).toBe(false)
    const m = menu(t)!
    const win = t.c.status().window!
    const bodyTop = Math.min(...hitShape('stand', petBox(foot(t), 56), false).map((r) => r.y))
    const menuBottom = win.y + m.rect.y + m.rect.height
    expect(bodyTop - menuBottom).toBeGreaterThan(20)
    // 몸 가운데에서 곧장 위로, 그리고 첫 행 왼쪽으로 비스듬히
    for (const x of [960, 880]) {
      t.env.cursor = { x, y: (menuBottom + bodyTop) / 2 }
      vi.advanceTimersByTime(FLYOUT_TIMING.dismissPollMs + 1)
      expect(lastIgnore(t), String(x)).toBe(false)
    }
    vi.advanceTimersByTime(FLYOUT_TIMING.menuAwayMs + 100)
    expect(menu(t)).not.toBeNull() // 틈은 메뉴 안이다
    t.env.buttons = true
    vi.advanceTimersByTime(FLYOUT_TIMING.dismissPollMs * 2)
    expect(menu(t)).not.toBeNull() // 틈에서 누름은 바깥 누름이 아니다
    t.env.buttons = null
    t.c.contextMenu()
    expect(menu(t)).toBeNull()
    expect(lastIgnore(t)).toBe(true) // 닫힌 뒤 틈은 아래 창으로 통과
  })

  it('(fix) 메뉴 동안 온 반응은 조종하기를 고르면 키 안내에 밀려 조종이 끝난 뒤 보인다', () => {
    const t = make()
    t.c.start()
    openMenu(t)
    t.c.react(COPIED)
    t.c.menuAction('control')
    expect(bubble(t)).toMatchObject({ text: PET_CONTROL_GUIDE })
    expect(reacts(t)).toEqual([])
    vi.advanceTimersByTime(5000)
    expect(bubble(t)).toBeNull() // 조종 중에는 보이지 않는다
    t.c.key('end', true)
    expect(bubble(t)).toMatchObject({ text: COPIED_TEXT })
    expect(reacts(t)).toEqual([{ kind: 'celebrate', bubble: true }])
  })

  it('(fix) 조종 중 새 반응이 오면 메뉴 동안 온 옛 반응은 끝낸 뒤에도 보이지 않는다(마지막 하나). 숨기면 버린다', () => {
    const t = make()
    t.c.start()
    openMenu(t)
    t.c.react(COPIED)
    t.c.menuAction('control')
    t.c.react(WARN)
    expect(bubble(t)).toMatchObject({ text: WARN_TEXT })
    vi.advanceTimersByTime(5000)
    t.c.key('end', true)
    expect(bubble(t)).toBeNull()
    expect(reacts(t)).toEqual([{ kind: 'warn', bubble: true }])

    const hidden = make()
    hidden.c.start()
    openMenu(hidden)
    hidden.c.react(COPIED)
    hidden.c.menuAction('control')
    hidden.c.setFullscreen(true)
    hidden.c.setFullscreen(false)
    expect(bubble(hidden)).toBeNull()
    expect(reacts(hidden)).toEqual([])
  })

  it('(fix) 메뉴 동안 온 반응은 재우기를 고르면 버린다(바로 깨지 않는다)', () => {
    const t = make()
    t.c.start()
    openMenu(t)
    t.c.react(COPIED)
    t.c.menuAction('sleep')
    expect(mode(t)).toBe('sleep')
    expect(bubble(t)).toBeNull()
    vi.advanceTimersByTime(3000)
    expect(mode(t)).toBe('sleep')
    expect(states(t)).toEqual(['sleep'])
    expect(reacts(t)).toEqual([])
  })
})

describe('조종 모드(설계 §14-2 "펫 창이 키보드를 받는다")', () => {
  it('메뉴의 조종하기: 앞 창을 기억하고 setFocusable(true) 다음 focus(), controlling·소품 control, 메뉴 닫힘, 기록 start', () => {
    const t = make()
    t.c.start()
    t.env.foreground = '4242'
    openMenu(t)
    t.c.menuAction('control')
    expect(t.foreground).toHaveBeenCalledTimes(1)
    expect(t.window.setFocusable.mock.calls).toEqual([[true]])
    expect(t.window.focus).toHaveBeenCalledTimes(1)
    const order = (f: { mock: { invocationCallOrder: number[] } }): number =>
      f.mock.invocationCallOrder[0]
    expect(order(t.foreground)).toBeLessThan(order(t.window.setFocusable))
    expect(order(t.window.setFocusable)).toBeLessThan(order(t.window.focus))
    expect(t.c.controlling()).toBe(true)
    const v = t.c.view()!
    expect(v).toMatchObject({ controlling: true, menu: null })
    expect(v.look.props).toContain('control')
    expect(t.window.send.mock.lastCall![0]).toMatchObject({ controlling: true, menu: null })
    expect(controls(t)).toEqual([{ phase: 'start' }])
    expect(menus(t)).toEqual([{ action: 'control' }])
  })

  it('조종 중 말풍선은 머리 위 조종 표시 위로 비킨다(bubbleHop), 끝나면 원래 높이', () => {
    const t = make()
    t.c.start()
    t.c.startControl()
    const win = t.c.status().window!
    const box = petBox(foot(t), 56)
    const want = bubbleSlot({ box, window: win, bounds: MAIN.bounds, hop: bubbleHop(56, true) })
    expect(bubble(t)!.slot).toEqual({
      x: want.rect.x - win.x,
      y: want.rect.y - win.y,
      width: 200,
      height: 96
    })
    expect(bubble(t)!.slot.y).toBe(184.25 - 30 - 8 - 96)
    t.c.key('end', true)
    t.c.react(NOTE)
    expect(bubble(t)!.slot.y).toBe(184.25 - 12 - 8 - 96)
  })

  it('시작하면 폴짝하며 키 안내 말풍선을 4초 보이고, 계획·졸기는 멈춘다(가만히 타이머는 조회 하나)', () => {
    const t = make({ settings: { sleepAfterMin: 1 } })
    t.c.start()
    t.env.idle = 1000
    t.c.startControl()
    expect(look(t)).toMatchObject({ face: 'happy', cue: 'hop', cueSeq: 1 })
    expect(bubble(t)).toMatchObject({ seq: 1, text: PET_CONTROL_GUIDE })
    expect(reacts(t)).toEqual([]) // 앱 반응이 아니다
    expect(vi.getTimerCount()).toBe(2) // 안내 말풍선·조회
    vi.advanceTimersByTime(4000)
    expect(bubble(t)).toBeNull()
    expect(look(t).face).toBe('normal')
    expect(vi.getTimerCount()).toBe(1) // 조회만(쉼·졸기 없음)
    vi.advanceTimersByTime(120_000)
    expect(mode(t)).toBe('idle')
    expect(foot(t)).toEqual({ x: 960, y: 1040 })
    expect(t.idleSeconds).not.toHaveBeenCalled()
  })

  it('말풍선 끔이면 안내 말풍선 없이 웃는 얼굴·폴짝만 1.5초, 움직임 줄이기면 폴짝 없이 웃는 얼굴만', () => {
    const quiet = make({ settings: { bubbles: false } })
    quiet.c.start()
    quiet.c.startControl()
    expect(bubble(quiet)).toBeNull()
    expect(look(quiet)).toMatchObject({ face: 'happy', cue: 'hop' })
    vi.advanceTimersByTime(1500)
    expect(look(quiet).face).toBe('normal')

    const still = make({ settings: { reduceMotion: true } })
    still.c.start()
    still.c.startControl()
    expect(look(still)).toMatchObject({ face: 'happy', cue: null, cueSeq: 0 })
    expect(bubble(still)?.text).toBe(PET_CONTROL_GUIDE)
  })

  it("key('right', true) 1초 → 발 x + 60 ± 2·오른쪽을 봄, 떼면 멈춘다(걷는 동안만 동작 고리)", () => {
    const t = make({ settings: { bubbles: false } })
    t.c.start()
    t.c.startControl()
    vi.advanceTimersByTime(2000)
    expect(vi.getTimerCount()).toBe(1) // 조회
    const x0 = foot(t).x
    t.c.key('right', true)
    expect(mode(t)).toBe('walk')
    expect(vi.getTimerCount()).toBe(1) // 동작 고리
    vi.advanceTimersByTime(1000)
    const dx = foot(t).x - x0
    expect(dx).toBeGreaterThanOrEqual(58)
    expect(dx).toBeLessThanOrEqual(62)
    expect(look(t)).toMatchObject({ pose: 'walk', facing: 'right' })
    expect(foot(t).y).toBe(1040)
    t.c.key('right', false)
    expect(mode(t)).toBe('idle')
    const x1 = foot(t).x
    vi.advanceTimersByTime(1000)
    expect(foot(t).x).toBe(x1)
    expect(vi.getTimerCount()).toBe(1) // 조회
    t.c.key('left', true)
    vi.advanceTimersByTime(500)
    expect(look(t).facing).toBe('left')
    expect(foot(t).x).toBeLessThan(x1 - 25)
  })

  it('←와 →를 함께 누르면 나중에 누른 쪽으로, 그 키를 떼면 남은 쪽으로 걷는다', () => {
    const t = make({ settings: { bubbles: false } })
    t.c.start()
    t.c.startControl()
    t.c.key('right', true)
    t.c.key('left', true)
    vi.advanceTimersByTime(300)
    expect(look(t).facing).toBe('left')
    const x = foot(t).x
    t.c.key('left', false)
    vi.advanceTimersByTime(300)
    expect(look(t).facing).toBe('right')
    expect(foot(t).x).toBeGreaterThan(x)
    t.c.key('right', false)
    expect(mode(t)).toBe('idle')
  })

  it("key('jump', true): 땅에서 jumpVelocity(크기)로 뛰어(56 → vy −473) 바닥에 선다. 걷던 vx를 유지하고 공중에서는 다시 뛰지 않는다", () => {
    const t = make({ settings: { bubbles: false } })
    t.c.start()
    t.c.startControl()
    vi.advanceTimersByTime(2000)
    t.c.key('jump', true)
    expect(mode(t)).toBe('air')
    const v = t.c.status().velocity
    expect(v.vy).toBeCloseTo(jumpVelocity(56), 6)
    expect(Math.abs(v.vy + 473)).toBeLessThanOrEqual(1)
    expect(v.vx).toBe(0)
    t.c.key('jump', false)
    t.c.key('jump', true) // 공중: 무시
    expect(t.c.status().velocity).toEqual(v)
    untilMode(t, 'idle', 3000)
    expect(foot(t)).toEqual({ x: 960, y: 1040 })

    t.c.key('right', true)
    vi.advanceTimersByTime(200)
    t.c.key('jump', true)
    expect(mode(t)).toBe('air')
    expect(t.c.status().velocity.vx).toBe(60)
  })

  it('바 옆 24 DIP 안에서 ↑: 뛰어올라 옆면에 붙고, 누르는 동안 올라 꼭대기에 앉는다. 떼면 붙은 채 멈춘다. 24 DIP 밖이면 오르지 않는다', () => {
    const t = make({ settings: { bubbles: false } })
    t.c.start()
    dropFrom(t, { x: 1820, y: 1000 })
    untilMode(t, 'idle', 3000)
    t.c.startControl()
    vi.advanceTimersByTime(2000)
    t.c.key('up', true)
    expect(mode(t)).toBe('idle') // 옆면(1853.5)에서 33.5 DIP: 24 밖
    expect(CONTROL.nearBar).toBe(24)
    t.c.key('right', true) // ↑를 누른 채 다가가면 24 안에서 오르기 시작
    untilMode(t, 'leap', 2000)
    expect(foot(t).x).toBe(1853.5)
    t.c.key('right', false)
    untilMode(t, 'climb', 2000)
    expect(foot(t)).toEqual({ x: 1853.5, y: 748 })
    vi.advanceTimersByTime(1000)
    const y1 = foot(t).y
    expect(748 - y1).toBeGreaterThanOrEqual(40)
    t.c.key('up', false)
    vi.advanceTimersByTime(1000)
    expect(foot(t).y).toBe(y1) // 붙은 채 멈춤
    expect(mode(t)).toBe('climb')
    expect(vi.getTimerCount()).toBe(1) // 조회(동작 고리 없음)
    t.c.key('up', true)
    untilMode(t, 'sit', 15_000)
    expect(foot(t)).toEqual({ x: 1892, y: 292 })
    expect(states(t).slice(-2)).toEqual(['climb', 'sit'])
  })

  it('꼭대기에서 ↓: 옆면 위쪽으로 돌아가(300ms) 내려가고, 옆면 아래 끝을 지나면 바와 겹치지 않는 자리에서 떨어져 바닥에 선다', () => {
    const t = make({ settings: { bubbles: false } })
    t.c.start()
    untilMode(t, 'sit')
    t.c.startControl()
    vi.advanceTimersByTime(2000)
    t.c.key('down', true)
    expect(mode(t)).toBe('climb')
    expect(look(t)).toMatchObject({ pose: 'climb', facing: 'right' })
    vi.advanceTimersByTime(STEP_UP_MS + 2 * PET_LOOP.frameMs)
    expect(foot(t).x).toBe(1853.5)
    const y = foot(t).y
    vi.advanceTimersByTime(1000)
    expect(foot(t).y - y).toBeGreaterThanOrEqual(40)
    untilMode(t, 'air', 15_000)
    expect(foot(t).y).toBeGreaterThan(748)
    expect(foot(t).x).toBe(1836) // 바 안쪽 면(1864) − 몸 반(28)
    until(() => mode(t) !== 'air', 3000)
    expect(mode(t)).toBe('idle')
    expect(foot(t)).toEqual({ x: 1836, y: 1040 })
  })

  it('꼭대기에서 →로 바 끝(+크기/4)을 넘으면 바와 겹치지 않는 자리에서 걷던 속도로 떨어지고, 누르고 있으면 바닥에서 이어 걷는다', () => {
    const t = make({ bar: LEFT_BAR, settings: { bubbles: false } })
    t.c.start()
    untilMode(t, 'sit')
    expect(foot(t)).toEqual({ x: 28, y: 292 })
    t.c.startControl()
    vi.advanceTimersByTime(2000)
    t.c.key('right', true)
    expect(mode(t)).toBe('walk')
    vi.advanceTimersByTime(500)
    expect(foot(t).y).toBe(292) // 꼭대기 위를 걷는다
    expect(foot(t).x).toBeGreaterThan(50)
    expect(foot(t).x).toBeLessThanOrEqual(56 + 14)
    until(() => mode(t) === 'air', 1000)
    expect(foot(t)).toEqual({ x: 84, y: 292 }) // 바 오른쪽 면(56) + 몸 반(28)
    expect(t.c.status().velocity).toEqual({ vx: 60, vy: 0 })
    until(() => mode(t) !== 'air', 3000)
    expect(mode(t)).toBe('walk')
    expect(foot(t).y).toBe(1040)
    t.c.key('right', false)
    expect(mode(t)).toBe('idle')
  })

  it('꼭대기에서 뛰면 다시 꼭대기에 앉는다', () => {
    const t = make({ settings: { bubbles: false } })
    t.c.start()
    untilMode(t, 'sit')
    t.c.startControl()
    vi.advanceTimersByTime(2000)
    t.c.key('jump', true)
    expect(mode(t)).toBe('air')
    untilMode(t, 'sit', 2000)
    expect(foot(t)).toEqual({ x: 1892, y: 292 })
  })

  it('(Task 5 이월) 꼭대기를 걷는 펫은 refresh()·worldChanged()로 바닥에 떨어지지 않고, 바를 옮기면 따라간다', () => {
    const t = make({ bar: LEFT_BAR, settings: { bubbles: false } })
    t.c.start()
    untilMode(t, 'sit')
    t.c.startControl()
    vi.advanceTimersByTime(2000)
    t.c.key('right', true)
    vi.advanceTimersByTime(300)
    expect(mode(t)).toBe('walk')
    const x = foot(t).x
    expect(foot(t).y).toBe(292)
    t.c.refresh()
    expect(foot(t)).toEqual({ x, y: 292 })
    t.c.worldChanged()
    expect(foot(t)).toEqual({ x, y: 292 })
    expect(mode(t)).toBe('walk')
    t.env.bar = { rect: { x: 0, y: 400, width: 56, height: 456 }, edge: 'left' }
    t.c.worldChanged()
    expect(foot(t)).toEqual({ x, y: 400 })
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    expect(foot(t).y).toBe(400)
    expect(mode(t)).toBe('walk')
  })

  it("key('end', true) → setFocusable(false) 다음 기억한 창으로 restoreFocus 한 번, controlling false, 새 계획, 기록 end esc", () => {
    const t = make()
    t.c.start()
    t.env.foreground = '4242'
    t.c.startControl()
    vi.advanceTimersByTime(4000)
    t.c.key('end', true)
    expect(t.window.setFocusable.mock.calls).toEqual([[true], [false]])
    expect(t.restoreFocus.mock.calls).toEqual([['4242']])
    expect(t.window.setFocusable.mock.invocationCallOrder[1]).toBeLessThan(
      t.restoreFocus.mock.invocationCallOrder[0]
    )
    expect(t.c.controlling()).toBe(false)
    expect(t.c.view()).toMatchObject({ controlling: false })
    expect(look(t).props).not.toContain('control')
    expect(controls(t)).toEqual([{ phase: 'start' }, { phase: 'end', reason: 'esc' }])
    expect(mode(t)).toBe('walk') // 새 계획(처음 계획은 바 오르기)
    t.c.key('end', true)
    t.c.endControl('esc')
    expect(t.restoreFocus).toHaveBeenCalledTimes(1)
    expect(controls(t)).toHaveLength(2)
  })

  it("endControl('blur')는 포커스를 되돌리지 않는다(다른 창을 눌렀다)", () => {
    const t = make()
    t.c.start()
    t.c.startControl()
    t.c.endControl('blur')
    expect(t.window.setFocusable.mock.calls).toEqual([[true], [false]])
    expect(t.restoreFocus).not.toHaveBeenCalled()
    expect(t.c.controlling()).toBe(false)
    expect(controls(t)).toEqual([{ phase: 'start' }, { phase: 'end', reason: 'blur' }])
  })

  it('foreground()가 null이면(Win32 없음) 끝낼 때 restoreFocus를 부르지 않는다', () => {
    const t = make()
    t.c.start()
    t.env.foreground = null
    t.c.startControl()
    t.c.key('end', true)
    expect(t.restoreFocus).not.toHaveBeenCalled()
    expect(t.window.setFocusable.mock.calls).toEqual([[true], [false]])
  })

  it('시작 전·끝낸 뒤의 key는 무시한다', () => {
    const t = make({ bar: null, random: 0 })
    t.c.start()
    t.c.key('right', true)
    t.c.key('jump', true)
    t.c.key('end', true)
    vi.advanceTimersByTime(1000)
    expect(mode(t)).toBe('idle')
    expect(foot(t)).toEqual({ x: 960, y: 1040 })
    expect(t.window.setFocusable).not.toHaveBeenCalled()
    t.c.startControl()
    t.c.key('end', true)
    t.c.key('right', true)
    t.c.key('jump', true)
    expect(mode(t)).toBe('idle')
    vi.advanceTimersByTime(1000)
    expect(foot(t)).toEqual({ x: 960, y: 1040 })
  })

  it('(Review Focus 1) 끝낸 뒤 커서가 몸 밖이면 마지막 setIgnoreMouse는 true(메뉴로 시작해도)', () => {
    const t = make()
    t.c.start()
    t.c.startControl()
    vi.advanceTimersByTime(4000)
    t.env.cursor = bodyPoint(t)
    vi.advanceTimersByTime(PET_LOOP.hitFarMs)
    expect(lastIgnore(t)).toBe(false)
    t.env.cursor = AWAY
    t.c.key('end', true)
    expect(lastIgnore(t)).toBe(true)

    const m = make()
    m.c.start()
    openMenu(m)
    m.env.cursor = menuRow(m, 0)
    vi.advanceTimersByTime(100)
    expect(lastIgnore(m)).toBe(false)
    m.c.menuAction('control')
    expect(lastIgnore(m)).toBe(true)
    m.c.key('end', true)
    expect(lastIgnore(m)).toBe(true)
  })

  it('toggleControl: 켜고 끈다(끌 때 reason toggle, 포커스 복귀)', () => {
    const t = make()
    t.c.start()
    t.env.foreground = '77'
    t.c.toggleControl()
    expect(t.c.controlling()).toBe(true)
    t.c.toggleControl()
    expect(t.c.controlling()).toBe(false)
    expect(t.restoreFocus.mock.calls).toEqual([['77']])
    expect(controls(t)).toEqual([{ phase: 'start' }, { phase: 'end', reason: 'toggle' }])
  })

  it('조종 중 숨김(전체 화면): 조종을 끝내고 포커스는 되돌리지 않는다. 다시 보여도 조종 중이 아니다', () => {
    const t = make()
    t.c.start()
    t.c.startControl()
    t.c.key('right', true)
    vi.advanceTimersByTime(300)
    t.c.setFullscreen(true)
    expect(t.c.controlling()).toBe(false)
    expect(t.window.setFocusable.mock.calls).toEqual([[true], [false]])
    expect(t.restoreFocus).not.toHaveBeenCalled()
    expect(controls(t)).toEqual([{ phase: 'start' }, { phase: 'end', reason: 'hide' }])
    expect(vi.getTimerCount()).toBe(0)
    t.c.key('right', true)
    t.c.setFullscreen(false)
    expect(t.c.view()).toMatchObject({ controlling: false })
    expect(look(t).props).not.toContain('control')
    expect(mode(t)).toBe('idle')
  })

  it('숨긴 동안·이미 조종 중이면 startControl을 무시한다', () => {
    const t = make()
    t.c.start()
    t.c.setFullscreen(true)
    t.c.startControl()
    expect(t.foreground).not.toHaveBeenCalled()
    expect(t.window.setFocusable).not.toHaveBeenCalled()
    t.c.setFullscreen(false)
    t.c.startControl()
    t.c.startControl()
    expect(t.window.setFocusable.mock.calls).toEqual([[true]])
    expect(t.window.focus).toHaveBeenCalledTimes(1)
    expect(controls(t)).toEqual([{ phase: 'start' }])
  })

  it('조종 중에도 들어 던질 수 있고, 내려앉으면 계획 없이 가만히 기다린다', () => {
    const t = make({ settings: { bubbles: false } })
    t.c.start()
    t.c.startControl()
    vi.advanceTimersByTime(2000)
    dropFrom(t, { x: 600, y: 900 })
    untilMode(t, 'idle', 3000)
    expect(t.c.controlling()).toBe(true)
    vi.advanceTimersByTime(30_000)
    expect(mode(t)).toBe('idle')
    expect(foot(t)).toEqual({ x: 600, y: 1040 })
    expect(vi.getTimerCount()).toBe(1)
  })

  it('조종 중 앱 반응은 표정·말풍선만 바꾸고 걷기를 멈추지 않는다', () => {
    const t = make()
    t.c.start()
    t.c.startControl()
    vi.advanceTimersByTime(4000)
    t.c.key('right', true)
    vi.advanceTimersByTime(300)
    t.c.react(COPIED)
    expect(mode(t)).toBe('walk')
    expect(bubble(t)).toMatchObject({ text: COPIED_TEXT })
    expect(look(t)).toMatchObject({ pose: 'walk', face: 'happy' })
    expect(look(t).props).toEqual(['sunglasses', 'envelope', 'control'])
    const x = foot(t).x
    vi.advanceTimersByTime(500)
    expect(foot(t).x).toBeGreaterThan(x + 25)
    vi.advanceTimersByTime(3600)
    expect(bubble(t)).toBeNull()
    expect(mode(t)).toBe('walk')
    expect(reacts(t)).toEqual([{ kind: 'celebrate', bubble: true }])
  })

  it('잠든 펫에서 조종을 시작하면 깨어나 조종한다', () => {
    const t = make({ bar: null, random: 0 })
    t.c.start()
    t.env.idle = 1000
    vi.advanceTimersByTime(180_000)
    expect(mode(t)).toBe('sleep')
    t.c.startControl()
    expect(mode(t)).toBe('idle')
    expect(states(t)).toEqual(['sleep', 'wake'])
    expect(t.c.controlling()).toBe(true)
    t.c.key('left', true)
    vi.advanceTimersByTime(500)
    expect(mode(t)).toBe('walk')
    expect(foot(t).x).toBeLessThan(960 - 25)
  })

  it('끝낼 때: 꼭대기면 새 쉼(타이머 쉼·졸기·조회), 옆면에 붙어 있으면 이어 올라 앉는다', () => {
    const top = make({ settings: { bubbles: false } })
    top.c.start()
    untilMode(top, 'sit')
    top.c.startControl()
    vi.advanceTimersByTime(2000)
    expect(vi.getTimerCount()).toBe(1)
    top.c.key('end', true)
    expect(mode(top)).toBe('sit')
    expect(vi.getTimerCount()).toBe(3) // 새 쉼·졸기·조회
    vi.advanceTimersByTime(60_000 - 100) // random 0.5 → 쉼 60초
    expect(mode(top)).toBe('sit')
    vi.advanceTimersByTime(200)
    expect(mode(top)).toBe('air')

    const side = make({ settings: { bubbles: false } })
    side.c.start()
    dropFrom(side, { x: 1840, y: 1000 })
    untilMode(side, 'idle', 3000)
    side.c.startControl()
    side.c.key('up', true)
    untilMode(side, 'climb', 2000)
    vi.advanceTimersByTime(1000)
    side.c.key('up', false)
    const y = foot(side).y
    side.c.key('end', true)
    vi.advanceTimersByTime(1000)
    expect(foot(side).y).toBeLessThan(y - 40) // 혼자 이어 오른다
    untilMode(side, 'sit', 15_000)
  })

  it('끝낼 때 키 안내 말풍선은 닫고, 앱 반응 말풍선은 그대로 둔다', () => {
    const t = make({ bar: null, random: 0 })
    t.c.start()
    t.c.startControl()
    expect(bubble(t)?.text).toBe(PET_CONTROL_GUIDE)
    t.c.key('end', true)
    expect(bubble(t)).toBeNull()
    t.c.startControl()
    t.c.react(NOTE)
    t.c.key('end', true)
    expect(bubble(t)).toMatchObject({ text: '터미널에서는 가져오지 않아요.' })
  })

  it('조종 중 타이머: 가만히·앉기·옆면에 붙음은 조회 하나, 걷기·오르기는 동작 고리 하나(키 안내 말풍선 동안 하나 더)', () => {
    const t = make()
    t.c.start()
    t.c.startControl()
    expect(vi.getTimerCount()).toBe(2) // 안내 말풍선·조회
    t.c.key('right', true)
    expect(vi.getTimerCount()).toBe(2) // 안내 말풍선·동작 고리
    vi.advanceTimersByTime(4000)
    expect(vi.getTimerCount()).toBe(1) // 동작 고리
    t.c.key('right', false)
    expect(vi.getTimerCount()).toBe(1) // 조회
  })

  it('dispose: 조종 중이면 setFocusable(false), 포커스는 되돌리지 않고 타이머 0, 이후 호출 무시', () => {
    const t = make()
    t.c.start()
    t.c.startControl()
    t.c.dispose()
    expect(t.window.setFocusable.mock.calls).toEqual([[true], [false]])
    expect(t.restoreFocus).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(t.c.controlling()).toBe(false)
    t.c.key('right', true)
    t.c.startControl()
    t.c.contextMenu()
    t.c.menuAction('hide')
    expect(t.window.setFocusable).toHaveBeenCalledTimes(2)
    expect(t.setVisible).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
