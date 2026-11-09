import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutoHide } from './auto-hide'
import { globalTimers } from './test-timers'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function make() {
  const calls: string[] = []
  const setCollapsedBounds = vi.fn((c: boolean) => calls.push(`bounds:${c}`))
  const setCollapsedView = vi.fn((c: boolean) => calls.push(`view:${c}`))
  const ah = createAutoHide({ timers: globalTimers(), setCollapsedBounds, setCollapsedView })
  return { ah, calls, setCollapsedBounds, setCollapsedView }
}

describe('createAutoHide', () => {
  it('켜면 1초 뒤 화면이 들어가고 300ms 뒤 창이 줄어든다', () => {
    const { ah, setCollapsedBounds, setCollapsedView } = make()
    ah.setEnabled(true)
    vi.advanceTimersByTime(999)
    expect(setCollapsedView).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(setCollapsedView).toHaveBeenCalledWith(true)
    expect(ah.state()).toBe('collapsing')
    expect(setCollapsedBounds).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(setCollapsedBounds).toHaveBeenCalledWith(true)
    expect(ah.state()).toBe('collapsed')
  })

  it('손잡이에 300ms 올리면 창을 먼저 키운 뒤 화면이 나온다', () => {
    const { ah, calls } = make()
    ah.setEnabled(true)
    vi.advanceTimersByTime(1300)
    calls.length = 0
    ah.pointer(true)
    vi.advanceTimersByTime(299)
    expect(calls).toEqual([])
    vi.advanceTimersByTime(1)
    expect(calls).toEqual(['bounds:false', 'view:false'])
    expect(ah.state()).toBe('expanding')
    vi.advanceTimersByTime(300)
    expect(ah.state()).toBe('expanded')
  })

  it('200ms만 올렸다 떠나면 변화 없음', () => {
    const { ah, calls } = make()
    ah.setEnabled(true)
    vi.advanceTimersByTime(1300)
    calls.length = 0
    ah.pointer(true)
    vi.advanceTimersByTime(200)
    ah.pointer(false)
    vi.advanceTimersByTime(2000)
    expect(calls).toEqual([])
    expect(ah.state()).toBe('collapsed')
  })

  it('펼침 창이 열린 동안은 들어가지 않고, 닫히고 1초 뒤 들어간다', () => {
    const { ah, setCollapsedView } = make()
    ah.holdOpen(true)
    ah.setEnabled(true)
    vi.advanceTimersByTime(10000)
    expect(setCollapsedView).not.toHaveBeenCalled()
    ah.holdOpen(false)
    vi.advanceTimersByTime(1000)
    expect(setCollapsedView).toHaveBeenCalledWith(true)
  })

  it('들어가는 중 다시 올리면 즉시 화면을 되돌리고 창은 줄지 않는다', () => {
    const { ah, setCollapsedBounds, setCollapsedView } = make()
    ah.setEnabled(true)
    vi.advanceTimersByTime(1100)
    ah.pointer(true)
    expect(setCollapsedView).toHaveBeenLastCalledWith(false)
    vi.advanceTimersByTime(5000)
    expect(setCollapsedBounds).not.toHaveBeenCalled()
    expect(ah.state()).toBe('expanded')
  })

  it('바 위에 커서가 있는 동안은 들어가지 않고, 떠나면 1초 뒤 들어간다', () => {
    const { ah, setCollapsedView } = make()
    ah.pointer(true)
    ah.setEnabled(true)
    vi.advanceTimersByTime(5000)
    expect(setCollapsedView).not.toHaveBeenCalled()
    ah.pointer(false)
    vi.advanceTimersByTime(1000)
    expect(setCollapsedView).toHaveBeenCalledWith(true)
  })

  it('끄면 어느 상태에서나 즉시 펼치고 타이머를 지운다', () => {
    const a = make()
    a.ah.setEnabled(true)
    vi.advanceTimersByTime(1300)
    a.calls.length = 0
    a.ah.setEnabled(false)
    expect(a.calls).toEqual(['bounds:false', 'view:false'])
    expect(a.ah.state()).toBe('expanded')

    const b = make()
    b.ah.setEnabled(true)
    vi.advanceTimersByTime(1100)
    b.calls.length = 0
    b.ah.setEnabled(false)
    vi.advanceTimersByTime(5000)
    expect(b.calls).toEqual(['view:false'])
    expect(b.ah.state()).toBe('expanded')

    const c = make()
    c.ah.setEnabled(true)
    c.ah.setEnabled(false)
    vi.advanceTimersByTime(5000)
    expect(c.calls).toEqual([])
  })

  it('dispose 뒤에는 타이머가 남지 않는다', () => {
    const { ah, calls } = make()
    ah.setEnabled(true)
    ah.dispose()
    vi.advanceTimersByTime(5000)
    expect(calls).toEqual([])
  })
})
