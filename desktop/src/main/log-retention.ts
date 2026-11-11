/** 로그 파일 보관 일수. 오늘과 그 앞 7일(모두 8개 날짜)을 남긴다. */
export const LOG_KEEP_DAYS = 7

const LOG_NAME = /^(\d{4})-(\d{2})-(\d{2})\.log$/
const DAY_MS = 86_400_000

/** 'YYYY-MM-DD'가 실제 달력에 있는 날짜이면 UTC 자정의 일 번호, 아니면 null(서머타임 영향 없음). */
function dayNumber(y: number, m: number, d: number): number | null {
  const t = Date.UTC(y, m - 1, d)
  const back = new Date(t)
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null
  return Math.floor(t / DAY_MS)
}

function parseYmd(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return m ? dayNumber(Number(m[1]), Number(m[2]), Number(m[3])) : null
}

/**
 * 지울 로그 파일 이름을 돌려준다.
 * 규칙: 이름이 정확히 `YYYY-MM-DD.log`(실제 있는 날짜)이고, 오늘(로컬 날짜 `todayYmd`)과의 차이가
 * 7일보다 크면(8일 이상 전) 지운다. 오늘, 1~7일 전, 미래 날짜, 다른 이름·확장자, 없는 날짜는 남긴다.
 * 예: 오늘이 11-11이면 11-04(7일 전)는 남고 11-03(8일 전)은 지운다.
 */
export function logsToDelete(names: readonly string[], todayYmd: string): string[] {
  const today = parseYmd(todayYmd)
  if (today === null) return []
  const out: string[] = []
  for (const name of names) {
    const m = LOG_NAME.exec(name)
    if (!m) continue
    const day = dayNumber(Number(m[1]), Number(m[2]), Number(m[3]))
    if (day === null) continue
    if (today - day > LOG_KEEP_DAYS) out.push(name)
  }
  return out
}

/** 정리는 처음 한 번, 그리고 로컬 날짜가 바뀔 때마다 한 번. */
export function shouldCleanNow(lastCleanDay: string | null, todayYmd: string): boolean {
  return lastCleanDay !== todayYmd
}
