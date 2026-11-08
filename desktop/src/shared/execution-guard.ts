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
 * 단축키를 누르고 있는 동안의 자동 반복을 거른다.
 * Windows는 첫 자동 반복을 키보드 반복 지연(기본 약 0.5초) 뒤에 보내므로 시간만으로는 못 거른다.
 * 한 번 통과하면 키가 떼어질 때까지 다시 통과시키지 않는다. 떼어졌는지는 pollMs마다 isHeld()로 보고,
 * 키 상태를 잘못 읽어 영영 막히지 않도록 maxHoldMs가 지나면 다시 받는다.
 */
export function createHoldGate(
  isHeld: () => boolean,
  opts: { pollMs: number; maxHoldMs: number },
  now: () => number = Date.now
): () => boolean {
  let armed = true
  let passedAt = 0
  const held = (): boolean => {
    try {
      return isHeld()
    } catch {
      return false
    }
  }
  const watch = (): void => {
    if (!held() || now() - passedAt >= opts.maxHoldMs) {
      armed = true
      return
    }
    setTimeout(watch, opts.pollMs)
  }
  return () => {
    if (!armed) return false
    armed = false
    passedAt = now()
    setTimeout(watch, opts.pollMs)
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
