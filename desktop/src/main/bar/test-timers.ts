import type { Timers } from '../timers'

/** vi.useFakeTimers() 아래에서 전역 타이머 함수로 만든 Timers */
export const globalTimers = (): Timers => ({
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>)
})
