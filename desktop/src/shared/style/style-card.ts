import { phrasesUsedIn } from './ai-tells'
import { classifyEnding, ENDING_LABELS, ENDING_STYLES, type EndingStyle } from './endings'

/**
 * 내 말투 카드(설계 §7-1). 내가 쓴 견본 글에서 이 PC가 직접 센 값이다(AI를 부르지 않는다).
 * 프롬프트에는 견본 글 대신 이 카드만 들어가므로 견본은 PC 밖으로 나가지 않는다.
 */
export interface StyleCard {
  samples: number
  /** 끝맺음을 센 줄 수 */
  lines: number
  endings: Record<EndingStyle, number>
  /** 절반 넘게 쓰는 끝맺음(센 줄이 3줄 미만이면 null) */
  dominant: EndingStyle | null
  /** 줄 길이 중앙값(글자, 4글자 이상인 줄) */
  lineLength: number | null
  /** 목록 기호(목록 줄의 절반 넘게 쓰는 것, '- ' 꼴) */
  bullet: string | null
  /** 날짜 쓰는 모양 */
  dateStyle: DateStyle | null
  /** 화살표(→)를 자주 쓰는지 */
  arrow: boolean
  /** 자주 쓰는 끝말(줄의 마지막 낱말, 두 번 넘게 나온 것) */
  closers: string[]
  /** 견본에 나온 AI 티 표현: 내가 실제로 쓰는 말이라 지우지 않는다 */
  uses: string[]
}

export type DateStyle = 'M/D(요일)' | 'M/D' | 'M월 D일' | 'YYYY-MM-DD' | 'YYYY.MM.DD'

/** 견본 개수·길이 한도(store가 지킨다) */
export const STYLE_LIMITS = { samples: 30, minChars: 20, maxChars: 8000 } as const

const BULLETS = ['- ', '· ', '• ', '* ', '○ ', '□ ', '■ ', '▶ ', '> '] as const
const DATE_PATTERNS: readonly [DateStyle, RegExp][] = [
  ['M/D(요일)', /(?<!\d)\d{1,2}\/\d{1,2}\s?\([월화수목금토일]\)/g],
  ['YYYY-MM-DD', /(?<!\d)\d{4}-\d{1,2}-\d{1,2}(?!\d)/g],
  ['YYYY.MM.DD', /(?<!\d)\d{4}\.\d{1,2}\.\d{1,2}(?!\d)/g],
  ['M월 D일', /(?<!\d)\d{1,2}월\s?\d{1,2}일/g],
  ['M/D', /(?<![\d/])\d{1,2}\/\d{1,2}(?![\d/(]|\s?\()/g]
]
const MIN_CLASSIFIED = 3

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** 줄 앞 목록 기호를 뗀 내용 */
const stripBullet = (line: string): string =>
  line.replace(/^\s*(?:[-·•*○□■▶>]\s+|\d+[.)]\s+)/, '').trim()

export function analyzeStyle(samples: readonly string[]): StyleCard {
  const endings: Record<EndingStyle, number> = { gaejo: 0, hamnida: 0, haeyo: 0, plain: 0 }
  const lengths: number[] = []
  const bulletCount = new Map<string, number>()
  let listLines = 0
  let arrows = 0
  const lastWords = new Map<string, number>()
  const dateCount = new Map<DateStyle, number>()

  for (const sample of samples) {
    for (const raw of sample.replace(/\r\n?/g, '\n').split('\n')) {
      const line = raw.trimEnd()
      if (!line.trim()) continue
      const bullet = BULLETS.find((b) => line.trimStart().startsWith(b))
      if (bullet || /^\s*\d+[.)]\s/.test(line)) listLines++
      if (bullet) bulletCount.set(bullet, (bulletCount.get(bullet) ?? 0) + 1)
      arrows += (line.match(/→/g) ?? []).length
      const content = stripBullet(line)
      if ([...content].length >= 4) lengths.push([...content].length)
      const ending = classifyEnding(content)
      if (ending) {
        endings[ending]++
        const word =
          content
            .replace(/[\s.!?…~"'”’)\]]+$/u, '')
            .split(/\s+/)
            .at(-1) ?? ''
        if (word && [...word].length <= 6) lastWords.set(word, (lastWords.get(word) ?? 0) + 1)
      }
    }
    let rest = sample
    for (const [style, re] of DATE_PATTERNS) {
      const n = (rest.match(re) ?? []).length
      if (n) dateCount.set(style, (dateCount.get(style) ?? 0) + n)
      rest = rest.replace(re, ' ')
    }
  }

  const lines = ENDING_STYLES.reduce((n, s) => n + endings[s], 0)
  const top = ENDING_STYLES.reduce((a, b) => (endings[b] > endings[a] ? b : a))
  const dominant = lines >= MIN_CLASSIFIED && endings[top] * 2 > lines ? top : null
  const [bestBullet, bulletN] = [...bulletCount.entries()].sort((a, b) => b[1] - a[1])[0] ?? [
    null,
    0
  ]
  const bullet = bestBullet && listLines > 0 && bulletN * 2 > listLines ? bestBullet : null
  const dateStyle = [...dateCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const closers = [...lastWords.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .slice(0, 6)
    .map(([w]) => w)

  return {
    samples: samples.length,
    lines,
    endings,
    dominant,
    lineLength: median(lengths),
    bullet,
    dateStyle,
    arrow: arrows >= 2,
    closers,
    uses: phrasesUsedIn(samples)
  }
}

const percent = (n: number, total: number): number => (total ? Math.round((n / total) * 100) : 0)

/** 설정 창·알림에 보이는 말투 카드 줄(사람이 읽는 말) */
export function describeStyle(card: StyleCard): string[] {
  if (card.samples === 0) return []
  const out: string[] = []
  if (card.dominant)
    out.push(
      `끝맺음: ${ENDING_LABELS[card.dominant]} ${percent(card.endings[card.dominant], card.lines)}%`
    )
  else if (card.lines > 0) out.push('끝맺음: 섞어 씀')
  if (card.lineLength !== null) out.push(`한 줄: ${card.lineLength}자 안팎`)
  if (card.bullet) out.push(`목록 기호: '${card.bullet.trim()}'`)
  if (card.dateStyle) out.push(`날짜: ${card.dateStyle}`)
  if (card.arrow) out.push('화살표(→)로 이어 씀')
  if (card.closers.length) out.push(`자주 쓰는 끝말: ${card.closers.join(', ')}`)
  return out
}
