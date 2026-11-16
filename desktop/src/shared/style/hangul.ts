/** 한글 음절(가~힣) 받침 계산. 받침 번호는 유니코드 조합 순서(0: 없음, 16: ㅁ, 17: ㅂ, 20: ㅆ) */
const BASE = 0xac00
const LAST = 0xd7a3

export const JONG = { none: 0, m: 16, b: 17, ss: 20 } as const

export const isSyllable = (ch: string): boolean => {
  const c = ch.charCodeAt(0)
  return ch.length === 1 && c >= BASE && c <= LAST
}

/** 받침 번호. 한글 음절이 아니면 -1 */
export const jongOf = (ch: string): number => (isSyllable(ch) ? (ch.charCodeAt(0) - BASE) % 28 : -1)

/** 받침만 바꾼 음절(합 → 함). 한글 음절이 아니면 그대로 */
export const withJong = (ch: string, jong: number): string =>
  isSyllable(ch) ? String.fromCharCode(ch.charCodeAt(0) - jongOf(ch) + jong) : ch
