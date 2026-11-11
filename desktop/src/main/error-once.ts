/** 기억하는 오류 종류(곳 + 오류 글) 수. 넘으면 새 종류도 기록하지 않는다(오류 글이 매번 달라도 로그가 끝없이 늘지 않게) */
export const ERROR_KINDS_MAX = 20

/**
 * 같은 곳의 같은 오류는 처음 한 번만 기록하게 거른다(34ms 고리·잦은 IPC에서 같은 오류가 로그를 채우지 않게).
 * 종류는 곳(처리기 이름·채널)과 오류 글(errorText)로 정한다: 같은 곳의 다른 오류는 따로 한 번 남는다.
 * 처음 보는 종류면 true(기록한다)
 */
export function createErrorOnce(max = ERROR_KINDS_MAX): (where: string, error: string) => boolean {
  const seen = new Set<string>()
  return (where, error) => {
    const key = JSON.stringify([where, error])
    if (seen.has(key) || seen.size >= max) return false
    seen.add(key)
    return true
  }
}
