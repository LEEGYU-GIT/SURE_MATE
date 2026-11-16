import { isSyllable, JONG, jongOf, withJong } from './hangul'

/**
 * 줄 끝맺음 갈래. gaejo: 개조식(~함, ~됨, ~있음, ~예정처럼 명사로 끝냄), hamnida: ~습니다·~합니다,
 * haeyo: ~요, plain: ~다(했다, 한다)
 */
export type EndingStyle = 'gaejo' | 'hamnida' | 'haeyo' | 'plain'

export const ENDING_STYLES: readonly EndingStyle[] = ['gaejo', 'hamnida', 'haeyo', 'plain']

export const ENDING_LABELS: Record<EndingStyle, string> = {
  gaejo: '개조식(~함, ~예정)',
  hamnida: '~습니다',
  haeyo: '~요',
  plain: '~다'
}

/** 개조식 줄이 흔히 끝나는 말(받침 ㅁ이 아닌 것) */
const GAEJO_ENDS = [
  '예정',
  '필요',
  '완료',
  '요청',
  '공유',
  '확인',
  '검토',
  '논의',
  '결정',
  '대응',
  '조치',
  '반영',
  '수정',
  '보고',
  '협의',
  '미정',
  '불가',
  '가능',
  '진행',
  '중',
  '건',
  '참고'
]

/** 줄 끝의 문장 부호·닫는 괄호·공백 */
const TRAILING = /[\s.!?…~"'”’)\]]+$/u
/** ~요 끝맺음(필요·중요·개요처럼 요로 끝나는 명사는 빼려고 요 앞 글자까지 본다) */
const HAEYO =
  /(어요|아요|여요|해요|돼요|세요|에요|예요|네요|군요|래요|게요|까요|데요|든요|고요|지요|죠)$/

/**
 * 줄의 끝맺음 갈래. 네 글자 미만이거나 숫자·영문·기호로 끝나 갈래를 알 수 없으면 null.
 * 개조식은 받침 ㅁ으로 끝나는 말(함·됨·음·임)이나 흔한 끝말(예정·필요·완료 등)로 끝날 때만 센다(제목·이름 줄을 덜 세려고).
 */
export function classifyEnding(line: string): EndingStyle | null {
  const t = line.replace(TRAILING, '')
  if ([...t].length < 4) return null
  if (t.endsWith('니다')) {
    if (t.endsWith('습니다') || jongOf(t.slice(-3, -2)) === JONG.b) return 'hamnida'
    return 'plain'
  }
  if (HAEYO.test(t)) return 'haeyo'
  if (t.endsWith('다')) return 'plain'
  const last = t.slice(-1)
  if (!isSyllable(last)) return null
  const word = t.split(/\s+/).at(-1) ?? ''
  if (jongOf(last) === JONG.m || GAEJO_ENDS.some((w) => word.endsWith(w))) return 'gaejo'
  return null
}

/** 바꾸지 않는 인사·사과(맺음말은 AI 티 지우기가 따로 다룬다) */
const KEEP_WORDS = /^(감사|고맙|수고하셨|죄송|반갑)/

/**
 * 끝맺음 한 낱말을 개조식으로. 바꿀 수 없으면 null.
 * 했습니다·하였습니다·했어요·해요 → 함, 되었습니다·됐습니다·됐어요·돼요 → 됨, 하겠습니다 → 할 예정,
 * 있습니다 → 있음(받침 뒤 습니다 → 음), 합니다·됩니다·드립니다·입니다 → 함·됨·드림·임(ㅂ니다 → ㅁ),
 * 있어요·없어요 → 있음·없음, 봤어요 → 봤음(ㅆ 뒤 어요·아요 → 음), 예요·이에요 → 임
 */
export function gaejoWord(word: string): string | null {
  if (KEEP_WORDS.test(word)) return null
  const cut = (n: number, tail: string): string => word.slice(0, -n) + tail
  if (word.endsWith('하였습니다')) return cut(5, '함')
  if (word.endsWith('했습니다')) return cut(4, '함')
  if (word.endsWith('되었습니다')) return cut(5, '됨')
  if (word.endsWith('됐습니다')) return cut(4, '됨')
  if (word.endsWith('하겠습니다')) return cut(5, '할 예정')
  if (word.endsWith('습니다')) return word.length > 3 ? cut(3, '음') : null
  if (word.endsWith('니다')) {
    const stem = word.slice(0, -2)
    const last = stem.slice(-1)
    if (jongOf(last) !== JONG.b) return null
    return stem.slice(0, -1) + withJong(last, JONG.m)
  }
  if (word.endsWith('했어요')) return cut(3, '함')
  if (word.endsWith('됐어요')) return cut(3, '됨')
  if (word.endsWith('해요')) return cut(2, '함')
  if (word.endsWith('돼요')) return cut(2, '됨')
  if (word.endsWith('있어요') || word.endsWith('없어요')) return cut(2, '음')
  if ((word.endsWith('어요') || word.endsWith('아요')) && jongOf(word.slice(-3, -2)) === JONG.ss)
    return cut(2, '음')
  if (word.endsWith('이에요')) return word.length > 3 ? cut(3, '임') : null
  if (word.endsWith('예요')) return word.length > 2 ? cut(2, '임') : null
  return null
}

/** 명사 뒤에 붙은 임은 뗀다(예정임 → 예정) */
const NOUN_IM =
  /(예정|완료|필요|미정|불가|가능|진행 중|검토 중|확인 중|대기 중|해당 없음)임(?=$|[\s.,)])/gu
/** 문장 끝 낱말: 한글 낱말 + 마침표·느낌표(있으면), 그 뒤는 공백·줄 끝 */
const WORD_AT_END = /([가-힣]+)([.!]?)(?=[ \t]|$)/g

/**
 * ~습니다·~요 끝맺음을 개조식으로 바꾼다(회의록처럼 내 말투가 개조식일 때). 바꾼 낱말 수를 함께 돌려준다.
 * 줄 끝에서 바꾼 문장은 마침표를 떼고, 한 줄에 문장이 이어지면 마침표를 남긴다.
 */
export function toGaejo(text: string): { text: string; count: number } {
  let count = 0
  const lines = text.split('\n').map((line) => {
    const replaced = line.replace(
      WORD_AT_END,
      (whole: string, word: string, punct: string, offset: number) => {
        const next = gaejoWord(word)
        if (next === null) return whole
        count++
        const atEnd = line.slice(offset + whole.length).trim() === ''
        return next + (atEnd ? '' : punct)
      }
    )
    return replaced.replace(NOUN_IM, '$1')
  })
  return { text: lines.join('\n'), count }
}
