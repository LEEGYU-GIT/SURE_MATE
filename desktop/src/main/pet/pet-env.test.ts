import { afterEach, describe, expect, it, vi } from 'vitest'

// Electron·Win32는 vitest에서 쓸 수 없어 흉내 낸다
const m = vi.hoisted(() => ({
  app: { on: vi.fn(), removeListener: vi.fn() },
  powerMonitor: { getSystemIdleTime: vi.fn(() => 42) },
  screen: { getCursorScreenPoint: vi.fn(() => ({ x: 5, y: 6 })), on: vi.fn(), removeListener: vi.fn() },
  systemPreferences: {
    getAnimationSettings: vi.fn((): unknown => ({ shouldRenderRichAnimation: true, scrollAnimationsEnabledBySystem: true, prefersReducedMotion: true }))
  },
  getForegroundWindow: vi.fn((): string | null => '1001'),
  setForeground: vi.fn<(hwnd: string) => boolean>(() => true),
  // Sure-Mate 창: 팔레트 500, 설정 창 700
  isOwnWindow: vi.fn((hwnd: string) => hwnd === '500' || hwnd === '700'),
  isWindowVisible: vi.fn<(hwnd: string) => boolean>(() => true),
  paletteHwnd: vi.fn((): string | null => '500'),
  getPreviousHwnd: vi.fn((): string | null => '1001'),
  // 설정 창(첫 실행 안내·따라 해 보기 포함): 열려 있으면 그 핸들
  settingsHwnd: vi.fn((): string | null => '700'),
  mouseButtonDown: vi.fn((): boolean | null => false),
  getMonitors: vi.fn(() => []),
  createPetWindow: vi.fn()
}))
vi.mock('electron', () => ({ app: m.app, powerMonitor: m.powerMonitor, screen: m.screen, systemPreferences: m.systemPreferences }))
vi.mock('../native/windows', () => ({
  getForegroundWindow: m.getForegroundWindow,
  setForeground: m.setForeground,
  isOwnWindow: m.isOwnWindow,
  isWindowVisible: m.isWindowVisible
}))
vi.mock('../windows/palette-window', () => ({
  paletteHwnd: m.paletteHwnd,
  getPreviousHwnd: m.getPreviousHwnd
}))
vi.mock('../windows/settings-window', () => ({ settingsHwnd: m.settingsHwnd }))
vi.mock('../native/input', () => ({ mouseButtonDown: m.mouseButtonDown }))
vi.mock('../native/coords', () => ({ getMonitors: m.getMonitors }))
vi.mock('../windows/pet-window', () => ({ createPetWindow: m.createPetWindow }))
vi.mock('../log', () => ({ log: () => {} }))

import { appEvents } from '../app-events'
import { realTimers } from '../timers'
import { electronPetEnv } from './pet-env'

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('electronPetEnv: 펫 런타임의 바깥 세계(Electron·Win32·시계)', () => {
  it('now는 단조 시계(performance.now)다. 시스템 시각(Date.now)을 바꿔도 뒤로 가지 않는다(Task 5 이월)', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1234.5)
    const date = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
    expect(electronPetEnv().now()).toBe(1234.5)
    expect(date).not.toHaveBeenCalled()
  })

  it('systemReducedMotion은 OS 애니메이션 설정(Windows 애니메이션 효과 끔 = prefersReducedMotion)', () => {
    const env = electronPetEnv()
    expect(env.systemReducedMotion()).toBe(true)
    m.systemPreferences.getAnimationSettings.mockReturnValueOnce({ shouldRenderRichAnimation: true, scrollAnimationsEnabledBySystem: true, prefersReducedMotion: false })
    expect(env.systemReducedMotion()).toBe(false)
  })

  it('systemReducedMotion: 읽지 못하면(던짐·값 없음) false', () => {
    const env = electronPetEnv()
    m.systemPreferences.getAnimationSettings.mockImplementationOnce(() => {
      throw new Error('unsupported')
    })
    expect(env.systemReducedMotion()).toBe(false)
    m.systemPreferences.getAnimationSettings.mockReturnValueOnce({})
    expect(env.systemReducedMotion()).toBe(false)
    m.systemPreferences.getAnimationSettings.mockReturnValueOnce(undefined)
    expect(env.systemReducedMotion()).toBe(false)
  })

  it('foreground·restoreFocus: Win32 값을 그대로 쓰고(못 쓰면 null·false), 던지면 null·false', () => {
    const env = electronPetEnv()
    expect(env.foreground()).toBe('1001')
    expect(env.restoreFocus('1001')).toBe(true)
    expect(m.setForeground).toHaveBeenCalledWith('1001')
    // Win32를 못 쓰면 native 함수가 null·false를 돌려준다
    m.getForegroundWindow.mockReturnValueOnce(null)
    m.setForeground.mockReturnValueOnce(false)
    expect(env.foreground()).toBeNull()
    expect(env.restoreFocus('1001')).toBe(false)
    m.getForegroundWindow.mockImplementationOnce(() => {
      throw new Error('koffi')
    })
    m.setForeground.mockImplementationOnce(() => {
      throw new Error('koffi')
    })
    expect(env.foreground()).toBeNull()
    expect(env.restoreFocus('1001')).toBe(false)
  })

  it('(I1) foreground: 설정 창이 아닌 Sure-Mate 창은 돌아갈 창으로 주지 않는다(팔레트면 팔레트가 돌아갈 창, 그 밖이면 null)', () => {
    const env = electronPetEnv()
    m.getForegroundWindow.mockReturnValueOnce('500')
    expect(env.foreground()).toBe('1001')
    m.getForegroundWindow.mockReturnValueOnce('500')
    m.getPreviousHwnd.mockReturnValueOnce(null)
    expect(env.foreground()).toBeNull()
    // 설정 창(첫 실행 안내·따라 해 보기 포함)은 보이고 포커스를 받는 보통 창이라 돌아갈 창으로 준다
    m.getForegroundWindow.mockReturnValueOnce('700')
    expect(env.foreground()).toBe('700')
    // 설정 창이 닫혀 있으면 그 핸들도 Sure-Mate 창으로 본다
    m.getForegroundWindow.mockReturnValueOnce('700')
    m.settingsHwnd.mockReturnValueOnce(null)
    expect(env.foreground()).toBeNull()
    m.getForegroundWindow.mockReturnValueOnce('4242')
    expect(env.foreground()).toBe('4242')
    m.isOwnWindow.mockImplementationOnce(() => {
      throw new Error('koffi')
    })
    expect(env.foreground()).toBeNull()
  })

  it('(I1) restoreFocus: 보이지 않는 창(숨긴 팔레트 등)에는 포커스를 주지 않는다', () => {
    const env = electronPetEnv()
    m.isWindowVisible.mockReturnValueOnce(false)
    expect(env.restoreFocus('4242')).toBe(false)
    expect(m.setForeground).not.toHaveBeenCalled()
    expect(env.restoreFocus('4242')).toBe(true)
    expect(m.setForeground).toHaveBeenCalledWith('4242')
    m.isWindowVisible.mockImplementationOnce(() => {
      throw new Error('koffi')
    })
    expect(env.restoreFocus('4242')).toBe(false)
  })

  it('mouseButtonDown: Win32 값, 던지면 null(놓침은 렌더러 뗌과 1.5초 규칙으로)', () => {
    const env = electronPetEnv()
    expect(env.mouseButtonDown()).toBe(false)
    m.mouseButtonDown.mockReturnValueOnce(null)
    expect(env.mouseButtonDown()).toBeNull()
    m.mouseButtonDown.mockImplementationOnce(() => {
      throw new Error('koffi')
    })
    expect(env.mouseButtonDown()).toBeNull()
  })

  it('idleSeconds: 입력 없는 시간을 읽지 못하면 0(졸기 확인이 멈추지 않고 다시 잡힌다)', () => {
    const env = electronPetEnv()
    m.powerMonitor.getSystemIdleTime.mockImplementationOnce(() => {
      throw new Error('power')
    })
    expect(env.idleSeconds()).toBe(0)
    expect(env.idleSeconds()).toBe(42)
  })

  it('커서·입력 없는 시간·모니터·창·타이머·앱 일 통로는 Electron·앱의 것', () => {
    const env = electronPetEnv()
    expect(env.cursor()).toEqual({ x: 5, y: 6 })
    expect(env.idleSeconds()).toBe(42)
    expect(env.monitors()).toEqual([])
    expect(m.getMonitors).toHaveBeenCalled()
    env.createWindow()
    expect(m.createPetWindow).toHaveBeenCalledTimes(1)
    expect(env.timers).toBe(realTimers)
    expect(env.appEvents).toBe(appEvents)
    const r = env.random()
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeLessThan(1)
  })

  it('onDisplays: 모니터 연결·해제·배율(작업 영역) 변화를 같은 함수로 구독하고 해제한다', () => {
    const cb = vi.fn()
    const off = electronPetEnv().onDisplays(cb)
    expect(m.screen.on.mock.calls).toEqual([
      ['display-added', cb],
      ['display-removed', cb],
      ['display-metrics-changed', cb]
    ])
    off()
    expect(m.screen.removeListener.mock.calls).toEqual([
      ['display-added', cb],
      ['display-removed', cb],
      ['display-metrics-changed', cb]
    ])
  })

  it('onBeforeQuit: 앱을 끝내기 시작할 때(before-quit) 구독하고 해제한다', () => {
    const cb = vi.fn()
    const off = electronPetEnv().onBeforeQuit(cb)
    expect(m.app.on).toHaveBeenCalledWith('before-quit', cb)
    off()
    expect(m.app.removeListener).toHaveBeenCalledWith('before-quit', cb)
  })
})
