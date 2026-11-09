import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFullscreenWatch, isFullscreenState } from './fullscreen-watch'
import { globalTimers } from './test-timers'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('isFullscreenState', () => {
  it('2·3·4만 전체 화면', () => {
    for (const s of [2, 3, 4]) expect(isFullscreenState(s)).toBe(true)
    for (const s of [0, 1, 5, 6, 7]) expect(isFullscreenState(s)).toBe(false)
  })
})

function make(values: Array<number | null | 'throw'>) {
  let i = 0
  const query = vi.fn(() => {
    const v = values[Math.min(i++, values.length - 1)]
    if (v === 'throw') throw new Error('x')
    return v
  })
  const onChange = vi.fn()
  const log = vi.fn()
  const watch = createFullscreenWatch({ query, onChange, timers: globalTimers(), log })
  return { query, onChange, log, watch }
}

describe('createFullscreenWatch', () => {
  it('시작 즉시 한 번 읽고 1초마다 읽으며 바뀔 때만 알린다', () => {
    const { query, onChange, watch } = make([5, 2, 2, 5])
    watch.start()
    expect(query).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(3000)
    expect(query).toHaveBeenCalledTimes(4)
    expect(onChange.mock.calls).toEqual([[true], [false]])
    expect(watch.current()).toBe(false)
  })

  it('읽기 실패(null·예외) 세 번 연속이면 한 번 기록하고 멈춘다', () => {
    for (const bad of [null, 'throw'] as const) {
      const { query, log, watch } = make([bad])
      watch.start()
      vi.advanceTimersByTime(2000)
      expect(log).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith('bar.fullscreen.unavailable', {})
      const n = query.mock.calls.length
      expect(n).toBe(3)
      vi.advanceTimersByTime(4000)
      expect(query).toHaveBeenCalledTimes(n)
      expect(watch.current()).toBe(false)
    }
  })

  it('성공이 끼면 실패 횟수가 다시 센다', () => {
    const { log, watch, query } = make([null, null, 5, null, null, 5])
    watch.start()
    vi.advanceTimersByTime(5000)
    expect(log).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledTimes(6)
    watch.stop()
  })

  it('전체 화면 중 읽기 실패는 전체 화면 아님으로 간주한다', () => {
    const { onChange, watch } = make([2, null])
    watch.start()
    vi.advanceTimersByTime(1000)
    expect(onChange.mock.calls).toEqual([[true], [false]])
    watch.stop()
  })

  it('stop() 뒤에는 읽지 않는다', () => {
    const { query, watch } = make([5])
    watch.start()
    watch.stop()
    vi.advanceTimersByTime(5000)
    expect(query).toHaveBeenCalledTimes(1)
  })
})
