import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { AppEvent } from '../../shared/app-events'
import { PET_TIMING } from '../../shared/pet/pet-behavior'
import { bubbleSlot, hitShape, hopRoom, petBox } from '../../shared/pet/pet-frame'
import { DEFAULT_PET_SETTINGS, type PetSettings } from '../../shared/pet/pet-settings'
import type { PetView } from '../../shared/pet/pet-view'
import { petWorld, type PetBar, type PetWorld } from '../../shared/pet/pet-world'
import type { MaskingMode, MonitorInfo, Rect } from '../../shared/types'
import { globalTimers } from '../bar/test-timers'
import {
  createPetController,
  GESTURE,
  PET_LOOP,
  REDUCED_CLICK_FACE_MS,
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
  }
  cursor: Mock<() => { x: number; y: number }>
  idleSeconds: Mock<() => number>
  world: Mock<(size: number) => PetWorld | null>
  openPalette: Mock<() => void>
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
    clock: null
  }
  const boundsAt: number[] = []
  const window = {
    setBounds: vi.fn<(r: Rect) => void>(() => void boundsAt.push(Date.now())),
    showInactive: vi.fn<() => void>(),
    hide: vi.fn<() => void>(),
    send: vi.fn<(v: PetView) => void>(),
    setIgnoreMouse: vi.fn<(ignore: boolean) => void>()
  }
  const cursor = vi.fn(() => ({ ...env.cursor }))
  const idleSeconds = vi.fn(() => env.idle)
  const world = vi.fn((size: number) => (env.display ? petWorld(env.monitor, env.bar, size) : null))
  const openPalette = vi.fn<() => void>()
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
    timers: globalTimers(),
    now: () => (env.clock ? env.clock() : Date.now()),
    random: () => env.random,
    log
  })
  return { c, env, window, cursor, idleSeconds, world, openPalette, log, boundsAt }
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
