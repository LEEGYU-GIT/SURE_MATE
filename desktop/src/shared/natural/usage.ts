// 사용 기록 점수(설계 §9 동점 순서 "최근·자주 쓴 항목", §6 빈 화면 "최근 실행 항목"). 기록은 항목 id·횟수·마지막 시각뿐이다.

export interface UsageRecord {
  count: number
  /** ISO 시각 */
  lastAt: string
}

/** 사용 점수가 반으로 줄어드는 날 수 */
export const USAGE_HALF_LIFE_DAYS = 14

const DAY_MS = 86_400_000

/** 시각을 읽을 수 없으면 null */
const timeOf = (u: UsageRecord): number | null => {
  const t = Date.parse(u.lastAt)
  return Number.isFinite(t) ? t : null
}

/**
 * 횟수 × 0.5^(지난 날 / 14). 기록이 없거나 시각·횟수를 읽을 수 없으면 0.
 * 마지막 시각이 지금보다 뒤면(시계를 되돌림) 지난 날을 0으로 본다(횟수보다 커지지 않게).
 */
export function usageScore(u: UsageRecord | undefined, now: number): number {
  if (!u || !Number.isFinite(u.count) || u.count <= 0) return 0
  const at = timeOf(u)
  if (at === null) return 0
  const days = Math.max(0, now - at) / DAY_MS
  return u.count * Math.pow(0.5, days / USAGE_HALF_LIFE_DAYS)
}

/** 마지막 시각이 최근인 순서로 id n개(시각을 읽을 수 없는 기록은 가장 오래된 것으로, 같으면 넣은 순서) */
export function recentIds(usage: ReadonlyMap<string, UsageRecord>, n: number): string[] {
  const list = [...usage].map(([id, u]) => ({ id, at: timeOf(u) ?? -Infinity }))
  list.sort((a, b) => (a.at === b.at ? 0 : b.at > a.at ? 1 : -1))
  return list.slice(0, Math.max(0, n)).map((x) => x.id)
}
