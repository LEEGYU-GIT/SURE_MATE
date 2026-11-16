/**
 * AI가 쓴 티가 나는 표현(설계 §7-1 내 말투). AI 답을 복사해 'AI 티 지우기'를 하면 이 PC에서 규칙으로 고친다(AI를 부르지 않는다).
 * - 지우는 것: 첫 줄 인사("다음은 ~입니다:"), 마지막 맺음말("궁금한 점이 있으면…"), 마크다운 굵게·제목 기호·구분선·이모지,
 *   문장 앞 접속어(또한, 결론적으로), 뜻이 거의 안 바뀌는 꾸밈말(다양한, 효과적으로)
 * - 바꾸는 것: "~에 대해 논의" → "~ 논의", 목록 기호 * • → 내 말투의 기호
 * - 알려만 주는 것: "~을 통해", "~하는 것이 중요" 같이 고치면 뜻이 바뀔 수 있는 표현
 * 내 말투 견본에 나온 표현은 지우지 않는다(keep).
 */

/** 문장 앞에서 지우는 접속어 */
export const AI_OPENERS = [
  '또한',
  '결론적으로',
  '종합하면',
  '종합적으로',
  '요약하자면',
  '요약하면',
  '전반적으로',
  '궁극적으로'
] as const
/** 지우는 꾸밈말(뒤의 띄어쓰기와 함께) */
export const AI_FILLERS = [
  '다양한',
  '효과적으로',
  '효율적으로',
  '성공적으로',
  '원활하게',
  '원활한',
  '적극적으로',
  '본격적으로'
] as const
/** 고치지 않고 알려만 주는 표현 */
export const AI_FLAGS: readonly { label: string; pattern: RegExp }[] = [
  { label: '~을 통해', pattern: /[을를] 통해/g },
  { label: '~하는 것이 중요', pattern: /는 것이 (중요|필요)/g },
  { label: '~라고 할 수 있다', pattern: /(라고|다고) 할 수 있/g },
  { label: '~에 있어', pattern: /에 있어서?(?=\s)/g }
]

/** 첫 줄 인사·안내: 이런 말로 시작해 문장(: 다 요 !)으로 끝나는 짧은 줄. 제목 줄은 빼지 않는다 */
const PREAMBLE =
  /^(물론|네[,!.\s]|좋습니다|알겠습니다|다음은|아래는|아래와 같이|요청하신|말씀하신|정리해 ?드리|정리했|정리한 내용|회의록을 정리)/
const PREAMBLE_END = /([:：]|다\.?|요\.?|!)\s*$/
/** 마지막 맺음말: 읽는 사람에게 건네는 말(궁금하면, 필요하시면…)이 들고, 권유·인사로 끝나는 짧은 줄 */
const CLOSING = /(궁금|추가로|추가적인|필요하시면|필요하면|도움이 되|언제든|수정이 필요|더 필요)/
const CLOSING_END =
  /(주세요|바랍니다|드리겠습니다|드릴게요|좋겠습니다|기쁩니다|하세요|해요|!)[.!~]*\s*$/
const MAX_PREAMBLE = 80
const MAX_CLOSING = 120

const BOLD = /\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g
const HEADING = /^(\s*)#{1,6}\s+/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const STAR_BULLET = /^(\s*)[*+•●▪◦]\s+/
/** 그림 문자(✅ 📌 🔹 등)와 뒤따르는 변형 선택자·공백 */
const EMOJI = /\p{Extended_Pictographic}️?\s?/gu
const ABOUT = /(\S)에 대해(?:서)? (논의|검토|공유|설명|협의|보고)/g

export interface AiTellCounts {
  /** 첫 줄 인사를 뺐는지 */
  preamble: boolean
  /** 마지막 맺음말을 뺀 줄 수 */
  closing: number
  /** 굵게·제목·구분선·이모지·목록 기호 */
  markdown: number
  /** 접속어·꾸밈말을 지우거나 바꾼 곳 */
  phrases: number
}

export interface AiTellResult {
  text: string
  counts: AiTellCounts
  /** 알려만 주는 표현과 개수 */
  flags: { label: string; count: number }[]
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * AI 티를 지운다. bullet은 * • 목록을 바꿀 기호(내 말투, 없으면 '- '), keep은 지우지 않을 표현(내 견본에 나온 것).
 */
export function cleanAiTells(
  text: string,
  o: { bullet?: string | null; keep?: ReadonlySet<string> } = {}
): AiTellResult {
  const keep = o.keep ?? new Set<string>()
  const bullet = o.bullet ?? '- '
  const counts: AiTellCounts = { preamble: false, closing: 0, markdown: 0, phrases: 0 }
  let lines = text.replace(/\r\n?/g, '\n').split('\n')

  // 첫 줄 인사·마지막 맺음말
  const first = lines.findIndex((l) => l.trim() !== '')
  const head = first >= 0 ? lines[first].trim() : ''
  if (head && head.length <= MAX_PREAMBLE && PREAMBLE.test(head) && PREAMBLE_END.test(head)) {
    lines.splice(first, 1)
    counts.preamble = true
  }
  for (let n = 0; n < 2; n++) {
    let last = lines.length - 1
    while (last >= 0 && lines[last].trim() === '') last--
    const tail = last >= 0 ? lines[last].trim() : ''
    if (!tail || tail.length > MAX_CLOSING || !CLOSING.test(tail) || !CLOSING_END.test(tail)) break
    lines.splice(last, 1)
    counts.closing++
  }

  // 마크다운·이모지
  lines = lines.flatMap((line) => {
    if (RULE.test(line)) {
      counts.markdown++
      return []
    }
    let l = line
    if (HEADING.test(l)) {
      l = l.replace(HEADING, '$1')
      counts.markdown++
    }
    if (STAR_BULLET.test(l)) {
      const next = l.replace(STAR_BULLET, `$1${bullet}`)
      if (next !== l) counts.markdown++
      l = next
    }
    l = l.replace(BOLD, (_w: string, a?: string, b?: string) => {
      counts.markdown++
      return a ?? b ?? ''
    })
    l = l.replace(EMOJI, () => {
      counts.markdown++
      return ''
    })
    return [l]
  })

  // 접속어·꾸밈말
  let body = lines.join('\n')
  for (const word of AI_OPENERS) {
    if (keep.has(word)) continue
    // 줄 앞(목록 기호 뒤 포함)이나 문장 앞에 오는 접속어와 뒤의 쉼표
    const re = new RegExp(
      `(^|\\n|[.!?]\\s+)([ \\t]*(?:[-·•*]\\s+|\\d+[.)]\\s+)?)${escape(word)},?\\s+`,
      'g'
    )
    body = body.replace(re, (_w: string, before: string, lead: string) => {
      counts.phrases++
      return before + lead
    })
  }
  for (const word of AI_FILLERS) {
    if (keep.has(word)) continue
    const re = new RegExp(`${escape(word)}\\s+`, 'g')
    body = body.replace(re, () => {
      counts.phrases++
      return ''
    })
  }
  if (!keep.has('에 대해')) {
    body = body.replace(ABOUT, (_w: string, before: string, verb: string) => {
      counts.phrases++
      return `${before} ${verb}`
    })
  }

  // 빈 줄은 두 줄 넘게 겹치지 않게, 줄 끝 공백은 지운다
  body = body
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')

  const flags = AI_FLAGS.map((f) => ({
    label: f.label,
    count: [...body.matchAll(f.pattern)].length
  })).filter((f) => f.count > 0 && !keep.has(f.label))
  return { text: body, counts, flags }
}

/** 견본 글에 나온 AI 티 표현(내가 실제로 쓰는 말이라 지우지 않는다) */
export function phrasesUsedIn(samples: readonly string[]): string[] {
  const all = samples.join('\n')
  const used: string[] = []
  for (const w of [...AI_OPENERS, ...AI_FILLERS]) if (all.includes(w)) used.push(w)
  if (/\S에 대해(서)? (논의|검토|공유|설명|협의|보고)/.test(all)) used.push('에 대해')
  for (const f of AI_FLAGS) if (new RegExp(f.pattern.source).test(all)) used.push(f.label)
  return used
}
