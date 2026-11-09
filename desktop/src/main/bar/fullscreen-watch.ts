import type { Timers } from '../timers'

export const FULLSCREEN_POLL_MS = 1000
const MAX_CONSECUTIVE_FAILURES = 3

/** SHQueryUserNotificationState: 2 QUNS_BUSY, 3 QUNS_RUNNING_D3D_FULL_SCREEN, 4 QUNS_PRESENTATION_MODE */
export const isFullscreenState = (state: number): boolean => state === 2 || state === 3 || state === 4

type Deps = {
  query(): number | null
  onChange(fullscreen: boolean): void
  timers: Timers
  log(event: string, data: Record<string, unknown>): void
}

export function createFullscreenWatch(d: Deps) {
  let handle: unknown = null
  let fullscreen = false
  let failures = 0

  function stop(): void {
    if (handle !== null) d.timers.clearInterval(handle)
    handle = null
  }

  function read(): void {
    let state: number | null = null
    try {
      state = d.query()
    } catch {
      state = null
    }
    let next: boolean
    if (state === null) {
      failures += 1
      // 한두 번 읽지 못하면 앞 상태를 유지한다(슬라이드쇼 중에 바가 1초 동안 나타나지 않게)
      if (failures < MAX_CONSECUTIVE_FAILURES) return
      d.log('bar.fullscreen.unavailable', {})
      stop()
      // 멈춘 뒤에는 전체 화면이 아닌 것으로 간주한다(바가 영영 숨겨지는 쪽이 더 나쁘다)
      next = false
    } else {
      failures = 0
      next = isFullscreenState(state)
    }
    if (next !== fullscreen) {
      fullscreen = next
      d.onChange(next)
    }
  }

  return {
    start(): void {
      if (handle !== null) return
      failures = 0
      handle = d.timers.setInterval(read, FULLSCREEN_POLL_MS)
      read() // 세 번째 실패로 stop()이 불려도 위에서 handle이 이미 잡혀 있어 정리된다
    },
    stop,
    current: (): boolean => fullscreen
  }
}
