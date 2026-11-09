import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BarSettings } from '../../shared/bar/bar-settings'
import { DEFAULT_BAR_SETTINGS } from '../../shared/bar/bar-settings'
import { ratioFromTop } from '../../shared/bar/bar-layout'
import type { BarViewState } from '../../shared/bar/bar-items'
import type { MonitorInfo, Rect } from '../../shared/types'
import { createBarController, type BarInputs } from './bar-controller'
import { globalTimers } from './test-timers'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const WA: Rect = { x: 0, y: 0, width: 1920, height: 1040 }
const primary: MonitorInfo = { id: '1', isPrimary: true, isInternal: false, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: WA, scaleFactor: 1 }

function make(over: Partial<BarSettings> = {}, monitors: MonitorInfo[] = [primary]) {
  let bar: BarSettings = { ...DEFAULT_BAR_SETTINGS, ...over }
  let mons = monitors
  let last: Rect = { x: 0, y: 0, width: 0, height: 0 }
  let grow: ((r: Rect) => Rect) | null = null
  const sets: Rect[] = []
  const sent: BarViewState[] = []
  const window = {
    setBounds: vi.fn((r: Rect) => {
      sets.push(r)
      last = grow ? grow(r) : r
    }),
    getBounds: vi.fn(() => last),
    showInactive: vi.fn(),
    hide: vi.fn(),
    send: vi.fn((s: BarViewState) => void sent.push(s))
  }
  const inputs = (): BarInputs => ({
    bar,
    maskingMode: 'restore',
    petVisible: true,
    paletteHotkey: null,
    templates: [
      { id: 'meeting-notes', name: '회의록', kind: 'prompt' },
      { id: 'req-to-testcase', name: '요구사항 시험', kind: 'prompt' },
      { id: 'static-analysis', name: '정적 분석', kind: 'prompt' }
    ]
  })
  const raise = vi.fn()
  const onVisibleChange = vi.fn()
  const log = vi.fn()
  const savePosition = vi.fn(async () => {})
  const c = createBarController({ window, displays: () => mons, inputs, savePosition, raise, onVisibleChange, timers: globalTimers(), log })
  return {
    c, window, sets, sent, raise, onVisibleChange, log, savePosition,
    setBar: (b: Partial<BarSettings>) => void (bar = { ...bar, ...b }),
    setMonitors: (m: MonitorInfo[]) => void (mons = m),
    setGrow: (g: ((r: Rect) => Rect) | null) => void (grow = g),
    lastSet: () => sets[sets.length - 1]
  }
}

describe('createBarController', () => {
  it('start: 놓고 보여 주고 맨 앞 유지를 시작한다', () => {
    const t = make()
    t.c.start()
    expect(t.lastSet()).toEqual({ x: 1864, y: 292, width: 56, height: 456 })
    expect(t.window.showInactive).toHaveBeenCalledTimes(1)
    const s = t.sent[t.sent.length - 1]
    expect(s.items).toHaveLength(12)
    expect(s.collapsed).toBe(false)
    expect(s.busyItem).toBeNull()
    expect(t.log).toHaveBeenCalledWith('bar.place', expect.objectContaining({ display: '1', shape: 'edge', edge: 'right' }))
    expect(t.raise).toHaveBeenCalledTimes(1)
    expect(t.c.visible()).toBe(true)
  })

  it('모양 off면 표시하지 않고 capsule로 바꾸면 표시한다. 같은 입력은 다시 놓지 않는다', () => {
    const t = make({ shape: 'off' })
    t.c.start()
    expect(t.window.showInactive).not.toHaveBeenCalled()
    expect(t.c.visible()).toBe(false)
    t.setBar({ shape: 'capsule' })
    t.c.refresh()
    expect(t.lastSet()).toEqual({ x: 1864, y: 306, width: 44, height: 428 })
    expect(t.c.visible()).toBe(true)
    const n = t.window.setBounds.mock.calls.length
    const m = t.window.send.mock.calls.length
    t.c.refresh()
    expect(t.window.setBounds.mock.calls.length).toBe(n)
    expect(t.window.send.mock.calls.length).toBe(m)
  })

  it('전체 화면이면 숨기고 raise를 멈춘다', () => {
    const t = make()
    t.c.start()
    t.c.setFullscreen(true)
    expect(t.window.hide).toHaveBeenCalledTimes(1)
    expect(t.onVisibleChange).toHaveBeenLastCalledWith(false)
    expect(t.log).toHaveBeenCalledWith('bar.visibility', { visible: false, reason: 'fullscreen' })
    t.raise.mockClear()
    vi.advanceTimersByTime(6000)
    expect(t.raise).not.toHaveBeenCalled()
    t.c.setFullscreen(false)
    expect(t.window.showInactive).toHaveBeenCalledTimes(2)
  })

  it('snooze는 30분 뒤 돌아오고 unsnooze는 즉시 돌아온다', () => {
    const t = make()
    t.c.start()
    t.c.snooze()
    expect(t.window.hide).toHaveBeenCalledTimes(1)
    expect(t.c.snoozed()).toBe(true)
    vi.advanceTimersByTime(30 * 60 * 1000 - 1)
    expect(t.c.visible()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(t.c.visible()).toBe(true)
    expect(t.c.snoozed()).toBe(false)
    expect(t.window.showInactive).toHaveBeenCalledTimes(2)

    t.c.snooze()
    t.c.unsnooze()
    expect(t.window.showInactive).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(31 * 60 * 1000)
    expect(t.window.showInactive).toHaveBeenCalledTimes(3)
    expect(t.savePosition).not.toHaveBeenCalled()
  })

  it('displaysChanged는 200ms 합쳐 한 번만 놓는다', () => {
    const t = make()
    t.c.start()
    const n = t.window.setBounds.mock.calls.length
    t.c.displaysChanged()
    vi.advanceTimersByTime(50)
    t.c.displaysChanged()
    vi.advanceTimersByTime(50)
    t.c.displaysChanged()
    vi.advanceTimersByTime(199)
    expect(t.window.setBounds.mock.calls.length).toBe(n)
    vi.advanceTimersByTime(1)
    expect(t.window.setBounds.mock.calls.length).toBe(n + 1)
  })

  it('고른 모니터가 사라지면 주 모니터에 놓는다', () => {
    const second: MonitorInfo = { ...primary, id: '2', isPrimary: false, workArea: { x: 1920, y: 0, width: 1280, height: 1000 }, bounds: { x: 1920, y: 0, width: 1280, height: 1000 } }
    const t = make({ monitor: '2' }, [primary, second])
    t.c.start()
    expect(t.lastSet().x).toBe(1920 + 1280 - 56)
    t.setMonitors([primary])
    t.c.displaysChanged()
    vi.advanceTimersByTime(200)
    expect(t.lastSet()).toEqual({ x: 1864, y: 292, width: 56, height: 456 })
  })

  it('배율 때문에 창이 커지면 같은 사각형으로 한 번 더 놓는다', () => {
    const t = make()
    let first = true
    t.setGrow((r) => {
      if (!first) return r
      first = false
      return { x: 1864, y: 292, width: 84, height: 684 }
    })
    t.c.start()
    expect(t.sets).toEqual([
      { x: 1864, y: 292, width: 56, height: 456 },
      { x: 1864, y: 292, width: 56, height: 456 }
    ])
    expect(t.log).not.toHaveBeenCalledWith('bar.place.mismatch', expect.anything())
  })

  it('끝내 다르면 mismatch를 기록한다', () => {
    const t = make()
    t.setGrow(() => ({ x: 1864, y: 292, width: 84, height: 684 }))
    t.c.start()
    expect(t.sets).toHaveLength(2)
    expect(t.log).toHaveBeenCalledWith('bar.place.mismatch', expect.any(Object))
  })

  it('끌기: 4 DIP를 넘어야 움직이고 놓을 때 한 번 저장하며 옛 입력보다 메모리를 우선한다', () => {
    const t = make({ positions: [{ display: '1', ratio: 0.5 }] })
    t.c.start()
    t.c.drag('start', 500)
    t.c.drag('move', 503)
    expect(t.lastSet().y).toBe(292)
    const n = t.sets.length
    t.c.drag('move', 600)
    expect(t.sets.length).toBe(n + 1)
    expect(t.lastSet()).toEqual({ x: 1864, y: 392, width: 56, height: 456 })
    expect(t.savePosition).not.toHaveBeenCalled()
    t.c.drag('end', 600)
    expect(t.savePosition).toHaveBeenCalledTimes(1)
    expect(t.savePosition).toHaveBeenCalledWith('1', ratioFromTop(392, 456, WA))
    t.c.refresh()
    expect(t.lastSet().y).toBe(392)
  })

  it('저장이 입력에 반영되면 입력 위치를 따른다', () => {
    const t = make()
    t.c.start()
    t.c.drag('start', 0)
    t.c.drag('move', 100)
    t.c.drag('end', 100)
    t.setBar({ positions: [{ display: '1', ratio: ratioFromTop(392, 456, WA) }] })
    t.c.refresh()
    expect(t.lastSet().y).toBe(392)
    t.setBar({ positions: [{ display: '1', ratio: 0.1 }] })
    t.c.refresh()
    expect(t.lastSet().y).toBe(68)
  })

  it('손잡이 상태에서는 끌기를 무시한다', () => {
    const t = make({ autoHide: true })
    t.c.start()
    vi.advanceTimersByTime(1300)
    const n = t.sets.length
    t.c.drag('start', 500)
    t.c.drag('move', 700)
    t.c.drag('end', 700)
    expect(t.sets.length).toBe(n)
    expect(t.savePosition).not.toHaveBeenCalled()
  })

  it('autoHide: 1초 뒤 화면이, 1.3초 뒤 창이 손잡이로 줄어든다', () => {
    const t = make({ autoHide: true })
    t.c.start()
    vi.advanceTimersByTime(999)
    expect(t.sent[t.sent.length - 1].collapsed).toBe(false)
    vi.advanceTimersByTime(1)
    expect(t.sent[t.sent.length - 1].collapsed).toBe(true)
    expect(t.lastSet()).toEqual({ x: 1864, y: 292, width: 56, height: 456 })
    vi.advanceTimersByTime(300)
    expect(t.lastSet()).toEqual({ x: 1914, y: 292, width: 6, height: 456 })
    expect(t.window.getBounds()).toEqual({ x: 1914, y: 292, width: 6, height: 456 })
    // 접히고 펴진 자리도 기록한다(스모크 시험이 손잡이 너비·위치를 확인한다)
    expect(t.log).toHaveBeenLastCalledWith('bar.place', expect.objectContaining({ bounds: { x: 1914, y: 292, width: 6, height: 456 } }))
  })

  it('pointer는 안팎이 바뀔 때만 넘겨 300ms 타이머가 다시 시작되지 않는다', () => {
    const t = make({ autoHide: true })
    t.c.start()
    vi.advanceTimersByTime(1300)
    t.c.pointer(true)
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(100)
      t.c.pointer(true) // 움직임마다 들어오는 같은 값
    }
    // 500ms 지났으므로 300ms 지점에서 이미 나와 있어야 한다
    expect(t.lastSet()).toEqual({ x: 1864, y: 292, width: 56, height: 456 })
    expect(t.sent[t.sent.length - 1].collapsed).toBe(false)
  })

  it('setBusy와 anchor와 hasItem', () => {
    const t = make()
    t.c.start()
    t.c.setBusy('prompt:meeting-notes')
    expect(t.sent[t.sent.length - 1].busyItem).toBe('prompt:meeting-notes')
    const a = t.c.anchor('masking')
    expect(a?.item).toEqual({ x: 1864, y: 344, width: 56, height: 40 })
    expect(a?.bar).toEqual({ x: 1864, y: 292, width: 56, height: 456 })
    expect(a?.edge).toBe('right')
    expect(a?.workArea).toEqual(WA)
    expect(t.c.anchor(null)?.item).toBeNull()
    expect(t.c.hasItem('sep:1')).toBe(false)
    expect(t.c.hasItem('masking')).toBe(true)
    t.c.snooze()
    expect(t.c.anchor('masking')).toBeNull()
  })

  it('자동 숨김으로 들어가 있어도 anchor는 펼친 사각형 기준이다', () => {
    const t = make({ autoHide: true })
    t.c.start()
    vi.advanceTimersByTime(1300)
    expect(t.c.anchor('masking')?.item).toEqual({ x: 1864, y: 344, width: 56, height: 40 })
  })

  it('작업 영역보다 큰 바는 반복 없이 위 여백에 붙는다', () => {
    const small: MonitorInfo = { ...primary, workArea: { x: 0, y: 0, width: 800, height: 300 } }
    const t = make({ pinnedPrompts: [] }, [small])
    t.c.start()
    expect(t.sets.length).toBeLessThanOrEqual(2)
    expect(t.lastSet().y).toBe(12)
  })

  it('커서가 바 위에 있을 때 숨겼다 다시 나와도 1.3초 뒤 접힌다', () => {
    const t = make({ autoHide: true })
    t.c.start()
    t.c.pointer(true)
    t.c.holdOpen(true)
    t.c.snooze()
    t.c.unsnooze()
    expect(t.lastSet()).toEqual({ x: 1864, y: 292, width: 56, height: 456 })
    vi.advanceTimersByTime(1300)
    expect(t.lastSet()).toEqual({ x: 1914, y: 292, width: 6, height: 456 })
  })

  it('끌던 중 숨기면 저장되지 않은 위치는 버린다', () => {
    const t = make()
    t.c.start()
    t.c.drag('start', 500)
    t.c.drag('move', 600)
    expect(t.lastSet().y).toBe(392)
    t.c.snooze()
    t.c.unsnooze()
    expect(t.lastSet().y).toBe(292)
    expect(t.savePosition).not.toHaveBeenCalled()
  })
})
