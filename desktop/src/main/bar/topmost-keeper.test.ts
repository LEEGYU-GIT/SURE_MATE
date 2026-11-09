import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTopmostKeeper } from './topmost-keeper'
import { globalTimers } from './test-timers'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createTopmostKeeper', () => {
  it('보일 때 즉시 1회, 이후 2초마다', () => {
    const raise = vi.fn()
    const k = createTopmostKeeper({ raise, timers: globalTimers() })
    k.setVisible(true)
    expect(raise).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(raise).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(4000)
    expect(raise).toHaveBeenCalledTimes(4)
  })

  it('숨기면 더 늘지 않는다', () => {
    const raise = vi.fn()
    const k = createTopmostKeeper({ raise, timers: globalTimers() })
    k.setVisible(true)
    k.setVisible(false)
    vi.advanceTimersByTime(10000)
    expect(raise).toHaveBeenCalledTimes(1)
  })

  it('setVisible(true)를 두 번 불러도 주기는 하나', () => {
    const raise = vi.fn()
    const k = createTopmostKeeper({ raise, timers: globalTimers() })
    k.setVisible(true)
    k.setVisible(true)
    expect(raise).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(raise).toHaveBeenCalledTimes(2)
  })

  it('raise가 예외를 내도 다음 주기가 계속된다', () => {
    const raise = vi.fn(() => {
      throw new Error('x')
    })
    const k = createTopmostKeeper({ raise, timers: globalTimers() })
    k.setVisible(true)
    vi.advanceTimersByTime(4000)
    expect(raise).toHaveBeenCalledTimes(3)
  })

  it('stop() 뒤에는 올리지 않는다', () => {
    const raise = vi.fn()
    const k = createTopmostKeeper({ raise, timers: globalTimers() })
    k.setVisible(true)
    k.stop()
    vi.advanceTimersByTime(6000)
    expect(raise).toHaveBeenCalledTimes(1)
  })
})
