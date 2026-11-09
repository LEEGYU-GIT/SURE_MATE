import type { Timers } from '../timers'

export const RAISE_INTERVAL_MS = 2000

/** 바가 보일 때만 2초마다 맨 앞으로 올린다. 반복이라 기록하지 않는다. */
export function createTopmostKeeper(d: { raise(): void; timers: Timers }) {
  let handle: unknown = null

  const safeRaise = (): void => {
    try {
      d.raise()
    } catch {
      // 다음 주기에 다시 시도한다
    }
  }

  function stop(): void {
    if (handle !== null) d.timers.clearInterval(handle)
    handle = null
  }

  return {
    setVisible(visible: boolean): void {
      if (!visible) return stop()
      if (handle !== null) return
      handle = d.timers.setInterval(safeRaise, RAISE_INTERVAL_MS)
      safeRaise()
    },
    stop
  }
}
