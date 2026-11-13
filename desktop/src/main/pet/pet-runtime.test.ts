import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { AppEvent } from '../../shared/app-events'
import type { BarViewState } from '../../shared/bar/bar-items'
import { PET_CRASH_NOTICE, PET_NUDGE_LINES } from '../../shared/pet/pet-copy'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings/settings'
import type { MonitorInfo, Rect } from '../../shared/types'
import { DISPLAY_SETTLE_MS, type BarController } from '../bar/bar-controller'
import { globalTimers } from '../bar/test-timers'
import { RAISE_INTERVAL_MS } from '../bar/topmost-keeper'
import { ERROR_KINDS_MAX } from '../error-once'
import type { PetWindow } from '../windows/pet-window'
import { PET_LOOP, type PetWindowPort } from './pet-controller'
import { barWorld, CONTROL_FOCUS_CHECK_MS, createCoalescer, createPetRuntime, createSettler, type PetRuntimeEnv, type PetRuntimeOptions } from './pet-runtime'

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
const SIDE: MonitorInfo = {
  id: '2',
  bounds: { x: -1280, y: 0, width: 1280, height: 1024 },
  workArea: { x: -1280, y: 0, width: 1280, height: 984 },
  scaleFactor: 1.25,
  isPrimary: false,
  isInternal: false
}
const RIGHT_BAR: Rect = { x: 1864, y: 292, width: 56, height: 456 }
const SETTINGS: Settings = { ...DEFAULT_SETTINGS, bar: { ...DEFAULT_SETTINGS.bar, monitor: 'primary' } }

/** 바 컨트롤러 가운데 펫이 읽는 부분(보임·접힘·자리)과 전체 화면 상태. s를 바꾸면 바가 바뀐다 */
type FakeBar = {
  s: { visible: boolean; collapsed: boolean; rect: Rect; fullscreen: boolean }
  rt: { bar: BarController; fullscreen(): boolean }
}

function fakeBar(o: Partial<FakeBar['s']> = {}): FakeBar {
  const s = { visible: true, collapsed: false, rect: RIGHT_BAR, fullscreen: false, ...o }
  const bar = {
    visible: () => s.visible,
    state: () => ({ collapsed: s.collapsed }) as BarViewState,
    anchor: (id: string | null) => (s.visible && id === null ? { bar: s.rect, item: null, edge: 'right' as const, workArea: MAIN.workArea } : null)
  } as unknown as BarController
  return { s, rt: { bar, fullscreen: () => s.fullscreen } }
}

type PortMocks = { [K in keyof PetWindowPort]: Mock<PetWindowPort[K]> }
type FakePetWindow = Omit<PetWindow, 'port' | 'recheckSize' | 'raise' | 'destroy' | 'isFocused' | 'reload'> & {
  port: PortMocks
  recheckSize: Mock<() => void>
  raise: Mock<() => void>
  destroy: Mock<() => void>
  isFocused: Mock<() => boolean>
  reload: Mock<() => void>
}
/** 펫 창(포트·맨 앞 올리기·창 이벤트)의 가짜. blur·close·closed·renderGone은 창 이벤트를 낸다 */
type FakeWindow = {
  w: FakePetWindow
  blur(): void
  close(): { preventDefault: Mock<() => void> }
  closed(): void
  renderGone(reason: string): void
}

function fakeWindow(): FakeWindow {
  const on = {
    blur: [] as (() => void)[],
    close: [] as ((e: { preventDefault(): void }) => void)[],
    closed: [] as (() => void)[],
    renderGone: [] as ((reason: string) => void)[]
  }
  const w: FakePetWindow = {
    hwnd: '77',
    contentsId: 31,
    port: {
      setBounds: vi.fn<PetWindowPort['setBounds']>(),
      showInactive: vi.fn<PetWindowPort['showInactive']>(),
      hide: vi.fn<PetWindowPort['hide']>(),
      send: vi.fn<PetWindowPort['send']>(),
      setIgnoreMouse: vi.fn<PetWindowPort['setIgnoreMouse']>(),
      setFocusable: vi.fn<PetWindowPort['setFocusable']>(),
      focus: vi.fn<PetWindowPort['focus']>()
    },
    recheckSize: vi.fn<() => void>(),
    raise: vi.fn<() => void>(),
    isFocused: vi.fn<() => boolean>(() => true),
    reload: vi.fn<() => void>(),
    onBlur: (cb) => void on.blur.push(cb),
    onClose: (cb) => void on.close.push(cb),
    onClosed: (cb) => void on.closed.push(cb),
    onRenderGone: (cb) => void on.renderGone.push(cb),
    destroy: vi.fn<() => void>()
  }
  return {
    w,
    blur: () => on.blur.forEach((f) => f()),
    close: () => {
      const e = { preventDefault: vi.fn<() => void>() }
      on.close.forEach((f) => f(e))
      return e
    },
    closed: () => on.closed.forEach((f) => f()),
    renderGone: (reason) => on.renderGone.forEach((f) => f(reason))
  }
}

type FakeEnv = {
  env: PetRuntimeEnv & {
    createWindow: Mock<() => PetWindow>
    foreground: Mock<() => string | null>
    restoreFocus: Mock<(hwnd: string) => boolean>
    now: Mock<() => number>
  }
  win: FakeWindow
  /** 구독 중인 모니터 변화·앱 끝내기·앱 일 받는 쪽 */
  displays: Set<() => void>
  quits: Set<() => void>
  listeners: Set<(e: AppEvent) => void>
  emit(e: AppEvent): void
  displaysChanged(): void
  quit(): void
}

function fakeEnv(o: { monitors?: MonitorInfo[] } = {}): FakeEnv {
  const win = fakeWindow()
  const displays = new Set<() => void>()
  const quits = new Set<() => void>()
  const listeners = new Set<(e: AppEvent) => void>()
  const env: FakeEnv['env'] = {
    createWindow: vi.fn<() => PetWindow>(() => win.w),
    monitors: () => o.monitors ?? [MAIN],
    cursor: () => ({ x: 100, y: 100 }),
    mouseButtonDown: () => null,
    idleSeconds: () => 0,
    systemReducedMotion: () => false,
    foreground: vi.fn<() => string | null>(() => '1001'),
    restoreFocus: vi.fn<(hwnd: string) => boolean>(() => true),
    onDisplays: (cb) => {
      displays.add(cb)
      return () => void displays.delete(cb)
    },
    onBeforeQuit: (cb) => {
      quits.add(cb)
      return () => void quits.delete(cb)
    },
    appEvents: {
      on: (cb) => {
        listeners.add(cb)
        return () => void listeners.delete(cb)
      }
    },
    timers: globalTimers(),
    now: vi.fn<() => number>(() => Date.now()),
    random: () => 0.5
  }
  return {
    env,
    win,
    displays,
    quits,
    listeners,
    emit: (e) => listeners.forEach((f) => f(e)),
    displaysChanged: () => displays.forEach((f) => f()),
    quit: () => quits.forEach((f) => f())
  }
}

type Opts = PetRuntimeOptions & {
  openPalette: Mock<() => void>
  openSettings: Mock<() => Promise<void>>
  setPetVisible: Mock<(v: boolean) => Promise<void>>
  notify: Mock<(message: string) => void>
  log: Mock<(event: string, data: Record<string, unknown>) => void>
}

function options(o: { bar?: PetRuntimeOptions['bar']; getSettings?: () => Settings; openSettings?: () => Promise<void> } = {}): Opts {
  return {
    bar: o.bar ?? null,
    getSettings: o.getSettings ?? (() => SETTINGS),
    openPalette: vi.fn<() => void>(),
    openSettings: vi.fn<() => Promise<void>>(o.openSettings ?? (async () => {})),
    setPetVisible: vi.fn<(v: boolean) => Promise<void>>(async () => {}),
    notify: vi.fn<(message: string) => void>(),
    log: vi.fn<(event: string, data: Record<string, unknown>) => void>()
  }
}

const UNMASKED: AppEvent = { type: 'unmasked', restored: 2 }

describe('createCoalescer: 잦은 바 변화를 34ms에 한 번 이하로 묶는다(펫 30fps 이하, Task 5 이월)', () => {
  it('한 번 요청은 동기로 부르지 않고 다음 차례(0ms)에 한 번 부른다(바가 자리·화면을 다 바꾼 뒤 읽게)', () => {
    const run = vi.fn()
    const c = createCoalescer({ timers: globalTimers(), now: () => Date.now(), gapMs: 34, run })
    c.request()
    c.request()
    c.request()
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(0)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('바 끌기(약 60Hz, 1초)는 30번 이하로, 34ms 넘는 간격으로, 마지막 변화 뒤 34ms 안에 반영한다', () => {
    const at: number[] = []
    const c = createCoalescer({ timers: globalTimers(), now: () => Date.now(), gapMs: 34, run: () => void at.push(Date.now()) })
    const start = Date.now()
    let lastRequest = start
    for (let i = 0; i < 60; i++) {
      c.request()
      lastRequest = Date.now()
      vi.advanceTimersByTime(i % 3 === 2 ? 16 : 17)
    }
    vi.advanceTimersByTime(100)
    expect(at.length).toBeLessThanOrEqual(30)
    expect(at.length).toBeGreaterThanOrEqual(25)
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(34)
    const last = at[at.length - 1]
    expect(last).toBeGreaterThanOrEqual(lastRequest)
    expect(last - lastRequest).toBeLessThanOrEqual(34)
  })

  it('오래 조용했으면 다음 요청은 기다리지 않는다(0ms)', () => {
    const run = vi.fn()
    const c = createCoalescer({ timers: globalTimers(), now: () => Date.now(), gapMs: 34, run })
    c.request()
    vi.advanceTimersByTime(0)
    vi.advanceTimersByTime(1000)
    c.request()
    vi.advanceTimersByTime(0)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('시계가 뒤로 가도 gapMs보다 오래 기다리지 않는다', () => {
    let clock = 10_000
    const run = vi.fn()
    const c = createCoalescer({ timers: globalTimers(), now: () => clock, gapMs: 34, run })
    c.request()
    vi.advanceTimersByTime(0)
    clock = 0
    c.request()
    vi.advanceTimersByTime(33)
    expect(run).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('dispose 뒤에는 부르지 않고 타이머를 남기지 않는다', () => {
    const run = vi.fn()
    const c = createCoalescer({ timers: globalTimers(), now: () => Date.now(), gapMs: 34, run })
    c.request()
    c.dispose()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(100)
    c.request()
    vi.advanceTimersByTime(100)
    expect(run).not.toHaveBeenCalled()
  })
})

describe('createSettler: 몰려 오는 모니터 변화는 조용해진 뒤 한 번', () => {
  it('100ms 안에 세 번 와도 마지막 뒤 200ms에 한 번 부른다', () => {
    const run = vi.fn()
    const s = createSettler({ timers: globalTimers(), ms: DISPLAY_SETTLE_MS, run })
    expect(DISPLAY_SETTLE_MS).toBe(200)
    s.request()
    vi.advanceTimersByTime(50)
    s.request()
    vi.advanceTimersByTime(50)
    s.request()
    vi.advanceTimersByTime(199)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('dispose 뒤에는 부르지 않는다', () => {
    const run = vi.fn()
    const s = createSettler({ timers: globalTimers(), ms: 200, run })
    s.request()
    s.dispose()
    s.request()
    vi.advanceTimersByTime(1000)
    expect(run).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('barWorld: 펫이 다니는 세계(바가 있는 모니터, 보이고 펼친 바)', () => {
  it('보이고 펼친 바는 그 모니터 세계의 바가 된다', () => {
    const { rt } = fakeBar()
    const w = barWorld([SIDE, MAIN], SETTINGS, rt.bar, 56)
    expect(w?.displayId).toBe('1')
    expect(w?.bar).toEqual({ rect: RIGHT_BAR, edge: 'right' })
    expect(w?.ledge).not.toBeNull()
  })

  it('자동 숨김으로 접힌 바·숨은 바·바 런타임 없음은 바 없는 세계(펫은 떨어지거나 바닥만 다닌다)', () => {
    expect(barWorld([MAIN], SETTINGS, fakeBar({ collapsed: true }).rt.bar, 56)?.bar).toBeNull()
    expect(barWorld([MAIN], SETTINGS, fakeBar({ visible: false }).rt.bar, 56)?.bar).toBeNull()
    expect(barWorld([MAIN], SETTINGS, null, 56)?.bar).toBeNull()
    expect(barWorld([MAIN], SETTINGS, null, 56)?.floorY).toBe(1040)
  })

  it('바 모니터 설정을 따르고, 모니터가 없으면 null', () => {
    const settings = { ...SETTINGS, bar: { ...SETTINGS.bar, monitor: '2' } }
    expect(barWorld([MAIN, SIDE], settings, null, 56)?.displayId).toBe('2')
    expect(barWorld([], SETTINGS, null, 56)).toBeNull()
  })

  it('바를 읽다 오류가 나면 바 없는 세계로 본다(펫은 계속 다닌다)', () => {
    const bar = {
      visible: () => true,
      state: () => {
        throw new Error('layout')
      },
      anchor: () => null
    } as unknown as BarController
    expect(barWorld([MAIN], SETTINGS, bar, 56)?.bar).toBeNull()
  })
})

describe('createPetRuntime: 펫 창을 앱에 연결한다', () => {
  it('시작: 보이면 펫 창을 띄우고 바로 한 번 맨 앞으로 올린다. 시계는 주입한 단조 시계를 쓴다', () => {
    const f = fakeEnv()
    const rt = createPetRuntime(options({ bar: fakeBar().rt }), f.env)
    expect(f.win.w.port.showInactive).toHaveBeenCalledTimes(1)
    expect(f.win.w.raise).toHaveBeenCalledTimes(1)
    expect(rt.controller.status().shown).toBe(true)
    expect(rt.petContentsId).toBe(31)
    expect(f.env.now).toHaveBeenCalled()
    rt.dispose()
  })

  it('시작: 바 런타임의 전체 화면 상태를 먼저 읽어 전체 화면이면 띄우지 않고, 끝나면 띄운다', () => {
    const f = fakeEnv()
    const bar = fakeBar({ fullscreen: true })
    const rt = createPetRuntime(options({ bar: bar.rt }), f.env)
    expect(f.win.w.port.showInactive).not.toHaveBeenCalled()
    expect(rt.controller.status().shown).toBe(false)
    rt.setFullscreen(false)
    expect(f.win.w.port.showInactive).toHaveBeenCalledTimes(1)
    expect(rt.controller.status().shown).toBe(true)
    rt.dispose()
  })

  it('설정에서 숨겼으면 띄우지 않고 refresh로 다시 판단한다', () => {
    const f = fakeEnv()
    let settings: Settings = { ...SETTINGS, pet: { ...SETTINGS.pet, visible: false } }
    const rt = createPetRuntime(options({ getSettings: () => settings }), f.env)
    expect(f.win.w.port.showInactive).not.toHaveBeenCalled()
    settings = SETTINGS
    rt.refresh()
    expect(f.win.w.port.showInactive).toHaveBeenCalledTimes(1)
    rt.dispose()
  })

  it('맨 앞 유지: 바가 보이는 동안은 바 런타임이 올리고(afterRaise → raise), 바가 숨으면 펫이 2초마다 스스로, 펫이 숨으면 멈춘다', () => {
    const f = fakeEnv()
    const bar = fakeBar()
    const rt = createPetRuntime(options({ bar: bar.rt }), f.env)
    const raise = f.win.w.raise
    expect(raise).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2 * RAISE_INTERVAL_MS)
    expect(raise).toHaveBeenCalledTimes(1)
    // 바 런타임의 afterRaise
    rt.raise()
    expect(raise).toHaveBeenCalledTimes(2)

    // 바를 끄거나 잠시 숨김: 바 창이 숨은 뒤 onBarChange → worldChanged
    bar.s.visible = false
    rt.worldChanged()
    vi.advanceTimersByTime(0)
    expect(raise).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(RAISE_INTERVAL_MS)
    expect(raise).toHaveBeenCalledTimes(4)

    // 전체 화면: 펫이 숨으면 펫 혼자 올리기도 멈춘다(숨긴 펫에는 타이머가 없다)
    rt.setFullscreen(true)
    expect(rt.controller.status().shown).toBe(false)
    vi.advanceTimersByTime(3 * RAISE_INTERVAL_MS)
    expect(raise).toHaveBeenCalledTimes(4)
    rt.raise()
    expect(raise).toHaveBeenCalledTimes(4)

    // 바와 함께 돌아오면(바 다음 펫) 한 번 올리고, 바가 보이니 혼자 올리기는 하지 않는다
    bar.s.visible = true
    rt.setFullscreen(false)
    expect(raise).toHaveBeenCalledTimes(5)
    vi.advanceTimersByTime(3 * RAISE_INTERVAL_MS)
    expect(raise).toHaveBeenCalledTimes(5)
    rt.dispose()
  })

  it('바 런타임 없이 시작하면 바 없는 세계이고 전체 화면 숨김 없이 스스로 맨 앞을 지킨다', () => {
    const f = fakeEnv()
    const rt = createPetRuntime(options({ bar: null }), f.env)
    expect(rt.controller.status().shown).toBe(true)
    // 보일 때 한 번(펫 혼자 올리기의 첫 올림), 그 뒤 2초마다
    expect(f.win.w.raise).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(RAISE_INTERVAL_MS)
    expect(f.win.w.raise).toHaveBeenCalledTimes(2)
    rt.dispose()
  })

  it('바 변화(worldChanged)는 34ms에 한 번 이하로 컨트롤러에 넘긴다', () => {
    const f = fakeEnv()
    const rt = createPetRuntime(options({ bar: fakeBar().rt }), f.env)
    const spy = vi.spyOn(rt.controller, 'worldChanged')
    for (let i = 0; i < 60; i++) {
      rt.worldChanged()
      vi.advanceTimersByTime(i % 3 === 2 ? 16 : 17)
    }
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    expect(spy.mock.calls.length).toBeLessThanOrEqual(30)
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(25)
    rt.dispose()
  })

  it('(Task 9 #3) 숨긴 펫(설정·전체 화면)에는 바 변화가 타이머를 만들지 않는다(다시 표시할 때 새 세계를 읽는다)', () => {
    const f = fakeEnv()
    const rt = createPetRuntime(options({ bar: fakeBar().rt }), f.env)
    rt.setFullscreen(true)
    expect(rt.controller.status().shown).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    const spy = vi.spyOn(rt.controller, 'worldChanged')
    for (let i = 0; i < 5; i++) {
      rt.worldChanged()
      expect(vi.getTimerCount()).toBe(0)
      vi.advanceTimersByTime(17)
    }
    expect(spy).not.toHaveBeenCalled()
    rt.setFullscreen(false)
    expect(rt.controller.status().shown).toBe(true)
    rt.dispose()
  })

  it('(Task 9 #3) 디스플레이가 없어 숨은 펫은 모니터 변화(200ms 뒤 묶어서)로 다시 나타난다. 바 변화는 그동안 무시한다', () => {
    const monitors: MonitorInfo[] = []
    const f = fakeEnv({ monitors })
    const rt = createPetRuntime(options({ bar: fakeBar().rt }), f.env)
    expect(rt.controller.status().shown).toBe(false)
    rt.worldChanged()
    expect(vi.getTimerCount()).toBe(0)
    monitors.push(MAIN)
    f.displaysChanged()
    vi.advanceTimersByTime(DISPLAY_SETTLE_MS + PET_LOOP.frameMs)
    expect(rt.controller.status().shown).toBe(true)
    rt.dispose()
  })

  it('모니터 변화: 올 때마다 다음 놓기의 크기 확인을 켜고, 200ms 조용해진 뒤 세계를 한 번 다시 읽는다', () => {
    const f = fakeEnv()
    const rt = createPetRuntime(options({ bar: fakeBar().rt }), f.env)
    const spy = vi.spyOn(rt.controller, 'worldChanged')
    f.displaysChanged()
    vi.advanceTimersByTime(50)
    f.displaysChanged()
    vi.advanceTimersByTime(50)
    f.displaysChanged()
    expect(f.win.w.recheckSize).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(DISPLAY_SETTLE_MS - 1)
    expect(spy).not.toHaveBeenCalled()
    // 200ms가 지나면 바 변화와 같은 묶기를 거쳐 다음 차례에 한 번
    vi.advanceTimersByTime(PET_LOOP.frameMs)
    expect(spy).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(spy).toHaveBeenCalledTimes(1)
    rt.dispose()
  })

  it('바가 다른 모니터로 가면 다음 놓기에서 창 크기를 다시 확인한다', () => {
    const f = fakeEnv({ monitors: [MAIN, SIDE] })
    let settings = SETTINGS
    const rt = createPetRuntime(options({ getSettings: () => settings }), f.env)
    expect(f.win.w.recheckSize).not.toHaveBeenCalled()
    settings = { ...SETTINGS, bar: { ...SETTINGS.bar, monitor: '2' } }
    rt.refresh()
    expect(f.win.w.recheckSize).toHaveBeenCalledTimes(1)
    expect(rt.controller.status().window?.x).toBeLessThan(0)
    rt.dispose()
  })

  it('blur: 조종 중일 때만 조종을 끝내고 원래 창으로 포커스를 돌리지 않는다(다른 창을 눌렀다)', () => {
    const f = fakeEnv()
    const rt = createPetRuntime(options({ bar: fakeBar().rt }), f.env)
    const end = vi.spyOn(rt.controller, 'endControl')
    f.win.blur()
    expect(end).not.toHaveBeenCalled()
    rt.controller.startControl()
    expect(rt.controller.controlling()).toBe(true)
    f.win.blur()
    expect(end).toHaveBeenCalledWith('blur')
    expect(rt.controller.controlling()).toBe(false)
    expect(f.env.restoreFocus).not.toHaveBeenCalled()
    rt.dispose()
  })

  it('(M5) 조종을 시작하고 300ms 뒤에도 펫 창이 포커스를 받지 못했으면(앞 창 잠금) 조종을 끝낸다(blur처럼 포커스는 돌리지 않는다)', () => {
    const f = fakeEnv()
    const o = options({ bar: fakeBar().rt })
    const rt = createPetRuntime(o, f.env)
    f.win.w.isFocused.mockReturnValue(false)
    rt.controller.startControl()
    expect(f.win.w.port.focus).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(CONTROL_FOCUS_CHECK_MS - 1)
    expect(rt.controller.controlling()).toBe(true)
    vi.advanceTimersByTime(1)
    expect(rt.controller.controlling()).toBe(false)
    expect(f.env.restoreFocus).not.toHaveBeenCalled()
    expect(f.win.w.port.setFocusable).toHaveBeenLastCalledWith(false)
    expect(o.log).toHaveBeenCalledWith('pet.focusRefused', {})
    expect(o.log).toHaveBeenCalledWith('pet.control', { phase: 'end', reason: 'blur' })
    rt.dispose()
  })

  it('(M5) 포커스를 받았으면 조종을 이어 가고, 확인 전에 조종이 끝나거나 펫이 숨으면 확인하지 않고 타이머도 남기지 않는다', () => {
    const f = fakeEnv()
    const o = options({ bar: fakeBar().rt })
    const rt = createPetRuntime(o, f.env)
    rt.controller.startControl()
    vi.advanceTimersByTime(CONTROL_FOCUS_CHECK_MS)
    expect(rt.controller.controlling()).toBe(true)
    rt.controller.endControl('esc')

    // 포커스를 받지 못했어도 그 전에 Esc로 끝났으면 다시 끝내지 않는다
    f.win.w.isFocused.mockReturnValue(false)
    rt.controller.startControl()
    rt.controller.endControl('esc')
    vi.advanceTimersByTime(CONTROL_FOCUS_CHECK_MS)
    expect(o.log.mock.calls.filter(([e]) => e === 'pet.focusRefused')).toEqual([])

    // 전체 화면으로 숨으면 확인 타이머도 지운다(숨긴 펫에는 타이머가 없다)
    rt.controller.startControl()
    rt.setFullscreen(true)
    expect(rt.controller.controlling()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    rt.dispose()
  })

  it('close(조종 중 Alt+F4 등): 앱을 끝내는 중이 아니면 막고 조종을 끝낸다(원래 창으로). 앱을 끝낼 때는 막지 않는다', () => {
    const f = fakeEnv()
    const o = options({ bar: fakeBar().rt })
    const rt = createPetRuntime(o, f.env)
    rt.controller.startControl()
    const e = f.win.close()
    expect(e.preventDefault).toHaveBeenCalledTimes(1)
    expect(rt.controller.controlling()).toBe(false)
    expect(f.env.restoreFocus).toHaveBeenCalledWith('1001')
    expect(f.win.w.destroy).not.toHaveBeenCalled()
    // 조종 중이 아니어도 펫 창은 닫히지 않는다
    expect(f.win.close().preventDefault).toHaveBeenCalledTimes(1)
    // 앱을 끝내기 시작하면(before-quit) 닫기를 막지 않는다(막으면 끝내기가 취소된다)
    f.quit()
    expect(f.win.close().preventDefault).not.toHaveBeenCalled()
    rt.dispose()
  })

  it('앱 일(appEvents)에 반응한다', () => {
    const f = fakeEnv()
    const rt = createPetRuntime(options({ bar: fakeBar().rt }), f.env)
    const react = vi.spyOn(rt.controller, 'react')
    f.emit(UNMASKED)
    expect(react).toHaveBeenCalledWith(UNMASKED)
    expect(rt.petView()?.bubble).not.toBeNull()
    rt.dispose()
  })

  it('펫 IPC: 메뉴 숨기기는 setPetVisible(false)로 저장하고 바로 숨긴다. 펫 설정은 설정 창을 연다', async () => {
    const f = fakeEnv()
    const o = options({ bar: fakeBar().rt })
    const rt = createPetRuntime(o, f.env)
    rt.petContextMenu()
    expect(rt.petView()?.menu).not.toBeNull()
    rt.petMenu('settings')
    expect(o.openSettings).toHaveBeenCalledTimes(1)
    rt.petContextMenu()
    rt.petMenu('hide')
    expect(o.setPetVisible).toHaveBeenCalledWith(false)
    expect(f.win.w.port.hide).toHaveBeenCalledTimes(1)
    expect(rt.petView()).toBeNull()
    await vi.advanceTimersByTimeAsync(0)
    rt.dispose()
  })

  it('펫 설정 열기가 거부돼도 던지지 않고 기록만 한다', async () => {
    const f = fakeEnv()
    const o = options({ bar: fakeBar().rt, openSettings: async () => Promise.reject(new Error('busy')) })
    const rt = createPetRuntime(o, f.env)
    rt.petContextMenu()
    expect(() => rt.petMenu('settings')).not.toThrow()
    await vi.advanceTimersByTimeAsync(0)
    expect(o.log).toHaveBeenCalledWith('pet.error', { where: 'openSettings', error: 'busy' })
    rt.dispose()
  })

  it('처리 중 오류가 나도 던지지 않고(종류마다 한 번 기록) 다음 일은 처리한다', () => {
    const f = fakeEnv()
    const o = options({ bar: fakeBar().rt })
    const rt = createPetRuntime(o, f.env)
    const react = vi.spyOn(rt.controller, 'react').mockImplementation(() => {
      throw new Error('boom')
    })
    expect(() => f.emit(UNMASKED)).not.toThrow()
    expect(() => f.emit(UNMASKED)).not.toThrow()
    expect(react).toHaveBeenCalledTimes(2)
    expect(o.log.mock.calls.filter(([event]) => event === 'pet.error')).toEqual([['pet.error', { where: 'react', error: 'boom' }]])
    vi.spyOn(rt.controller, 'worldChanged').mockImplementation(() => {
      throw new Error('world')
    })
    rt.worldChanged()
    expect(() => vi.advanceTimersByTime(0)).not.toThrow()
    rt.dispose()
  })

  it('(Task 9 #4) 기록하는 종류는 곳과 오류 글: 같은 곳의 다른 오류는 따로 한 번씩, 종류 수에는 한도가 있다', () => {
    const f = fakeEnv()
    const o = options({ bar: fakeBar().rt })
    const rt = createPetRuntime(o, f.env)
    let message = 'boom'
    vi.spyOn(rt.controller, 'react').mockImplementation(() => {
      throw new Error(message)
    })
    const errors = (): unknown[] => o.log.mock.calls.filter(([event]) => event === 'pet.error').map(([, d]) => d)
    f.emit(UNMASKED)
    f.emit(UNMASKED)
    message = 'other'
    f.emit(UNMASKED)
    f.emit(UNMASKED)
    expect(errors()).toEqual([
      { where: 'react', error: 'boom' },
      { where: 'react', error: 'other' }
    ])
    // 오류 글이 매번 달라도 로그가 끝없이 늘지 않는다
    for (let i = 0; i < 100; i++) {
      message = `boom ${i}`
      f.emit(UNMASKED)
    }
    expect(errors().length).toBe(ERROR_KINDS_MAX)
    rt.dispose()
  })

  it('(Task 9 #6) 렌더러가 처음 죽으면: 조종을 끝내고(포커스 복귀 없음) 클릭 통과로 되돌린 뒤 한 번 다시 불러오고 한 번 기록한다', () => {
    const f = fakeEnv()
    const o = options({ bar: fakeBar().rt })
    const rt = createPetRuntime(o, f.env)
    rt.controller.startControl()
    f.win.renderGone('crashed')
    expect(rt.controller.controlling()).toBe(false)
    expect(f.env.restoreFocus).not.toHaveBeenCalled()
    expect(f.win.w.port.setIgnoreMouse).toHaveBeenLastCalledWith(true)
    expect(f.win.w.reload).toHaveBeenCalledTimes(1)
    expect(o.log.mock.calls.filter(([e]) => e === 'pet.renderGone')).toEqual([['pet.renderGone', { reason: 'crashed', count: 1 }]])
    expect(o.notify).not.toHaveBeenCalled()
    expect(rt.controller.status().shown).toBe(true)
    rt.dispose()
  })

  it('(Task 9 #6) 다시 불러온 뒤 또 죽으면 다시 불러오지 않고 펫을 숨긴 채 두며(창을 닫는다) 한 번 알린다', () => {
    const f = fakeEnv()
    const o = options({ bar: fakeBar().rt })
    const rt = createPetRuntime(o, f.env)
    f.win.renderGone('crashed')
    f.win.renderGone('oom')
    vi.advanceTimersByTime(0)
    expect(f.win.w.reload).toHaveBeenCalledTimes(1)
    expect(o.notify.mock.calls).toEqual([[PET_CRASH_NOTICE]])
    expect(f.win.w.destroy).toHaveBeenCalledTimes(1)
    expect(rt.controller.status().shown).toBe(false)
    expect(f.win.w.port.setIgnoreMouse).toHaveBeenLastCalledWith(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(f.listeners.size).toBe(0)
    expect(o.log.mock.calls.filter(([e]) => e === 'pet.renderGone')).toHaveLength(2)
    // 그 뒤(창을 닫는 중)는 아무것도 하지 않는다
    f.win.renderGone('crashed')
    vi.advanceTimersByTime(0)
    expect(o.notify).toHaveBeenCalledTimes(1)
    expect(f.win.w.reload).toHaveBeenCalledTimes(1)
  })

  it('dispose: 구독·타이머를 모두 풀고 조종 중이면 포커스를 받지 않게 한 뒤 창을 닫는다(두 번 불러도 한 번)', () => {
    const f = fakeEnv()
    const rt = createPetRuntime(options({ bar: fakeBar({ visible: false }).rt }), f.env)
    rt.controller.startControl()
    rt.worldChanged()
    f.displaysChanged()
    rt.dispose()
    rt.dispose()
    expect(vi.getTimerCount()).toBe(0)
    expect(f.displays.size).toBe(0)
    expect(f.quits.size).toBe(0)
    expect(f.listeners.size).toBe(0)
    expect(f.win.w.port.setFocusable).toHaveBeenLastCalledWith(false)
    expect(f.env.restoreFocus).not.toHaveBeenCalled()
    expect(f.win.w.destroy).toHaveBeenCalledTimes(1)
    // 정리한 뒤의 호출은 아무것도 하지 않는다
    rt.worldChanged()
    rt.refresh()
    rt.setFullscreen(true)
    f.win.blur()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('펫 창이 닫히면(closed) 런타임도 멈춘다', () => {
    const f = fakeEnv()
    createPetRuntime(options({ bar: fakeBar().rt }), f.env)
    f.win.closed()
    expect(vi.getTimerCount()).toBe(0)
    expect(f.listeners.size).toBe(0)
    expect(f.displays.size).toBe(0)
  })

  it('시작 중 실패하면 만든 창을 닫고 던진다(index.ts가 pet.startError로 기록하고 바·팔레트는 그대로 동작)', () => {
    const f = fakeEnv()
    const env = {
      ...f.env,
      appEvents: {
        on: () => {
          throw new Error('events')
        }
      }
    }
    expect(() => createPetRuntime(options({ bar: fakeBar().rt }), env)).toThrow('events')
    expect(f.win.w.destroy).toHaveBeenCalledTimes(1)
    expect(f.displays.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('쉬어 가기 말(2026-11-13): 펫이 보이고 설정이 켜져 있는 동안 1분에 한 번 확인한다', () => {
  const MIN = 60_000
  const nudgeLogs = (o: Opts): unknown[] => o.log.mock.calls.filter(([e]) => e === 'pet.nudge').map(([, d]) => d)

  it('일한 시간이 60분(흔들기 0.5)이 되면 졸던 펫을 깨워 문구를 보인다. 확인은 1분에 한 번이고 기록은 줄 번호뿐(문구 없음)', () => {
    const f = fakeEnv()
    const o = options({ bar: fakeBar().rt })
    const rt = createPetRuntime(o, f.env)
    // 재워 두면 동작 고리 없이 오래 보낼 수 있다(깨워서 말하는지도 본다)
    rt.controller.putToSleep()
    const busy = vi.spyOn(rt.controller, 'busy')
    vi.advanceTimersByTime(10 * MIN)
    expect(busy).toHaveBeenCalledTimes(10)
    vi.advanceTimersByTime(49 * MIN)
    expect(nudgeLogs(o)).toEqual([])
    expect(rt.controller.status().mode).toBe('sleep')
    vi.advanceTimersByTime(MIN)
    expect(nudgeLogs(o)).toEqual([{ line: 3 }])
    expect(rt.controller.status().mode).toBe('idle')
    expect(rt.petView()?.bubble?.text).toBe(PET_NUDGE_LINES[3])
    const logged = JSON.stringify(o.log.mock.calls)
    for (const line of PET_NUDGE_LINES) expect(logged).not.toContain(line)
    rt.dispose()
  })

  it('전체 화면으로 숨으면 확인 타이머도 없다. 다시 보이면 이어서 확인하고, 10분 넘게 숨어 있었으면 처음부터 센다', () => {
    const f = fakeEnv()
    const o = options({ bar: fakeBar().rt })
    const rt = createPetRuntime(o, f.env)
    rt.controller.putToSleep()
    vi.advanceTimersByTime(50 * MIN)
    rt.setFullscreen(true)
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(30 * MIN)
    rt.setFullscreen(false)
    // 숨기 전 50분은 버렸다: 다시 보인 뒤 첫 확인이 쉼으로 보고, 그 뒤 60분
    vi.advanceTimersByTime(60 * MIN)
    expect(nudgeLogs(o)).toEqual([])
    vi.advanceTimersByTime(MIN)
    expect(nudgeLogs(o)).toEqual([{ line: 3 }])
    rt.dispose()
  })

  it('설정에서 끄면 확인 타이머가 없고, 다시 켜면 그때부터 처음부터 센다', () => {
    const f = fakeEnv()
    let settings: Settings = { ...SETTINGS, pet: { ...SETTINGS.pet, nudges: false } }
    const o = options({ bar: fakeBar().rt, getSettings: () => settings })
    const rt = createPetRuntime(o, f.env)
    rt.controller.putToSleep()
    expect(vi.getTimerCount()).toBe(1) // 커서 조회만
    vi.advanceTimersByTime(120 * MIN)
    expect(nudgeLogs(o)).toEqual([])
    expect(rt.petView()?.bubble).toBeNull()
    settings = SETTINGS
    rt.refresh()
    expect(vi.getTimerCount()).toBe(2) // 커서 조회·쉬어 가기 확인
    vi.advanceTimersByTime(59 * MIN)
    expect(nudgeLogs(o)).toEqual([])
    vi.advanceTimersByTime(MIN)
    expect(nudgeLogs(o)).toEqual([{ line: 3 }])
    settings = { ...SETTINGS, pet: { ...SETTINGS.pet, nudges: false } }
    rt.refresh()
    expect(rt.petView()?.bubble).toBeNull()
    rt.dispose()
  })

  it('말할 수 없으면 까닭만 기록한다: 조종 중이면 건너뛰고 3분 뒤 한 번 더, 말풍선 끔은 다시 확인하지 않는다', () => {
    const f = fakeEnv()
    const o = options({ bar: fakeBar().rt })
    const rt = createPetRuntime(o, f.env)
    rt.controller.startControl()
    vi.advanceTimersByTime(60 * MIN)
    expect(nudgeLogs(o)).toEqual([{ skip: 'control', retry: true }])
    vi.advanceTimersByTime(3 * MIN)
    expect(nudgeLogs(o)).toEqual([
      { skip: 'control', retry: true },
      { skip: 'control', retry: false }
    ])
    rt.dispose()

    const g = fakeEnv()
    const quiet = options({ bar: fakeBar().rt, getSettings: () => ({ ...SETTINGS, pet: { ...SETTINGS.pet, bubbles: false } }) })
    const rt2 = createPetRuntime(quiet, g.env)
    rt2.controller.putToSleep()
    vi.advanceTimersByTime(64 * MIN)
    expect(nudgeLogs(quiet)).toEqual([{ skip: 'bubbles-off', retry: false }])
    expect(rt2.controller.status().mode).toBe('sleep')
    rt2.dispose()
  })
})
