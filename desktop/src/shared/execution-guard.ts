/**
 * 같은 키의 동작을 windowMs 안에 두 번 실행하지 않는다.
 * 기준은 마지막으로 "실행된" 시각이다(한글 조합 Enter 중복 같은 경우).
 */
export function createExecutionGuard(windowMs: number, now: () => number = Date.now): (key: string) => boolean {
  const lastRun = new Map<string, number>()
  return (key) => {
    const t = now()
    const prev = lastRun.get(key)
    if (prev !== undefined && t - prev < windowMs) return false
    lastRun.set(key, t)
    return true
  }
}

/**
 * 키를 누르고 있을 때 들어오는 자동 반복을 거른다.
 * 기준은 마지막으로 "수신된" 시각이라, 계속 누르고 있으면 다시 통과하지 않는다.
 */
export function createRepeatFilter(windowMs: number, now: () => number = Date.now): () => boolean {
  let lastReceived: number | undefined
  return () => {
    const t = now()
    const prev = lastReceived
    lastReceived = t
    return prev === undefined || t - prev >= windowMs
  }
}
