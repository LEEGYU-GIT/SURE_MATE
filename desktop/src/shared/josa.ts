/**
 * 마지막 글자의 소리에 받침이 있는지(조사 고르기용).
 * 한글은 종성으로, 영문·숫자는 읽는 소리 표로 판단한다(설계 문서 §8: L·M·N·R, 0·1·3·6·7·8은 받침 있음). 모르면 null
 */
export function hasFinalConsonant(word: string): boolean | null {
  const ch = word.trim().slice(-1)
  if (!ch) return null
  const code = ch.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0
  if (/[0-9]/.test(ch)) return '013678'.includes(ch)
  if (/[a-z]/i.test(ch)) return 'lmnr'.includes(ch.toLowerCase())
  return null
}

/** 을/를을 붙인다. 판단할 수 없으면 를 */
export const withObjectParticle = (word: string): string => `${word}${hasFinalConsonant(word) ? '을' : '를'}`
