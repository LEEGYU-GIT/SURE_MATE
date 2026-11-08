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

/** 마지막 소리의 받침이 ㄹ인지('으로/로'용). 한글 종성 ㄹ, 영문 L(엘), 숫자 1·7·8(일·칠·팔) */
function endsWithRieul(word: string): boolean {
  const ch = word.trim().slice(-1)
  const code = ch.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 8
  return /[l178]/i.test(ch)
}

/** [받침 있을 때, 없을 때]. 두 글자 조사를 먼저 본다 */
export const PARTICLES: readonly [string, string][] = [
  ['으로', '로'],
  ['이나', '나'],
  ['이랑', '랑'],
  ['이며', '며'],
  ['이라', '라'],
  ['은', '는'],
  ['이', '가'],
  ['을', '를'],
  ['과', '와']
]

const isSyllable = (ch: string): boolean => {
  const code = ch.charCodeAt(0)
  return code >= 0xac00 && code <= 0xd7a3
}

/** 낱말 첫 글자로도 흔한 한 글자 조사(이다·가장·은행·과정·로그…). 뒤에 한글이 붙으면 조사로 보지 않는다 */
const AMBIGUOUS_SINGLE = new Set(['은', '는', '이', '가', '을', '를', '과', '와', '로'])

/**
 * 이름 바로 뒤(following의 앞머리)가 조사 짝 중 하나면, 이름의 받침에 맞는 조사와 바꿀 길이를 돌려준다(설계 문서 §8 되돌리기).
 * '라고·라는'처럼 뒤에 한글이 이어지는 게 정상인 조사도 있어서, 낱말 첫 글자로 흔한 조사만 한글이 이어지면 건드리지 않는다.
 */
export function repickParticle(word: string, following: string): { particle: string; length: number } | null {
  const final = hasFinalConsonant(word)
  if (final === null) return null
  for (const [withFinal, withoutFinal] of PARTICLES) {
    for (const p of [withFinal, withoutFinal]) {
      if (!following.startsWith(p)) continue
      if (AMBIGUOUS_SINGLE.has(p) && isSyllable(following.charAt(1))) continue
      if (withFinal === '으로') return { particle: final && !endsWithRieul(word) ? '으로' : '로', length: p.length }
      return { particle: final ? withFinal : withoutFinal, length: p.length }
    }
  }
  return null
}
