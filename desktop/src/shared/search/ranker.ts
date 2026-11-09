import { disassemble, getChoseong, isChoseongOnly, toQwerty } from '../text/hangul'
import { foldForMatch } from '../text/normalize'

/** 검색할 문서 하나. 제목·별칭으로 찾고, 본문은 맨 마지막 단계에서만 본다 */
export interface SearchDoc {
  id: string
  title: string
  aliases: string[]
  body?: string
}

/** 이름(제목·별칭)마다 미리 계산한 검색 키 */
interface NameKeys {
  tokens: string[]
  compact: string
  jamo: string
  cho: string
  qwerty: string
}

interface IndexedDoc {
  id: string
  order: number
  titleLength: number
  title: NameKeys
  aliases: NameKeys[]
  body: string
}

export interface SearchIndex {
  docs: IndexedDoc[]
}

/** 점수(설계 문서 §9). 제목과 별칭은 앞의 두 단계에서만 다르게 치고, 그 아래 단계에서 점수가 같으면 rank가 제목을 앞에 둔다 */
const SCORE = {
  exact: 1000,
  aliasExact: 950,
  prefix: 900,
  aliasPrefix: 850,
  token: 800,
  choseong: 750,
  choseongPrefix: 700,
  jamoPrefix: 650,
  choseongContains: 600,
  qwertyPrefix: 600,
  contains: 500,
  jamoContains: 450,
  typo: 300,
  body: 100
} as const
/** 이보다 높은 점수가 5개 미만일 때만 오타를 본다 */
const TYPO_GATE = 5

const normalize = (s: string): string => foldForMatch(s.normalize('NFC'))

const HANGUL = /[ㄱ-ㆎ가-힣]/
/** 영문·숫자 덩어리와 한글 덩어리. 그 밖의 글자(공백, -_/.,:()· 와 다른 기호)는 나누는 자리 */
const TOKEN = /[a-z0-9]+|[ㄱ-ㆎ가-힣]+/g

/** 토큰(영문·숫자 덩어리와 한글 덩어리)을 붙인 것. 'C++'·'C#'처럼 기호를 빼면 한 글자 이하가 되면 공백만 뺀 원형 */
function compactOfNorm(norm: string, tokens: string[]): string {
  const joined = tokens.join('')
  const spaceless = norm.replace(/\s+/g, '')
  return joined.length <= 1 && spaceless.length > joined.length ? spaceless : joined
}

/** 검색과 같은 compact 키(용어 중복 판단에도 쓴다) */
export function compactOf(name: string): string {
  const norm = normalize(name).trim()
  return compactOfNorm(norm, norm.match(TOKEN) ?? [])
}

function keysOf(name: string): NameKeys {
  const norm = normalize(name).trim()
  const tokens = norm.match(TOKEN) ?? []
  const compact = compactOfNorm(norm, tokens)
  const jamo = disassemble(compact)
  return { tokens, compact, jamo, cho: getChoseong(norm), qwerty: toQwerty(jamo).toLowerCase() }
}

export function buildSearchIndex(docs: SearchDoc[]): SearchIndex {
  return {
    docs: docs.map((d, order) => ({
      id: d.id,
      order,
      titleLength: d.title.length,
      title: keysOf(d.title),
      aliases: d.aliases.map(keysOf),
      body: d.body ? normalize(d.body) : ''
    }))
  }
}

interface Query {
  text: string
  keys: NameKeys
  /** 초성만 친 검색어면 공백을 뺀 초성, 아니면 null */
  cho: string | null
  /** 영문 소문자만이면 한영 오입력으로도 본다 */
  latin: boolean
  /** 오타를 봐줄 자모 거리(0이면 보지 않음) */
  maxTypo: number
}

function parseQuery(query: string): Query | null {
  const text = normalize(query).trim()
  if (!text) return null
  const keys = keysOf(text)
  if (!keys.compact) return null
  const jamoLength = [...keys.jamo].length
  const hangul = HANGUL.test(keys.compact)
  return {
    text,
    keys,
    // Windows IME는 모음 없이 친 ㄱ+ㅅ·ㅂ+ㅅ을 'ㄳ'·'ㅄ' 한 글자로 합쳐 보내므로 기본 자음으로 나눈다
    cho: isChoseongOnly(text) ? disassemble(text.replace(/\s+/g, '')) : null,
    latin: /^[a-z]+$/.test(keys.compact),
    maxTypo: !hangul || jamoLength < 4 ? 0 : jamoLength >= 8 ? 2 : 1
  }
}

/** 오타를 보지 않는 단계들의 점수 */
function scoreName(n: NameKeys, q: Query, alias: boolean): number {
  const c = q.keys.compact
  if (n.compact === c) return alias ? SCORE.aliasExact : SCORE.exact
  if (n.compact.startsWith(c)) return alias ? SCORE.aliasPrefix : SCORE.prefix
  if (q.keys.tokens.length > 0 && q.keys.tokens.every((qt) => n.tokens.some((t) => t.startsWith(qt)))) return SCORE.token
  if (q.cho !== null) {
    if (n.cho === q.cho) return SCORE.choseong
    if (n.cho.startsWith(q.cho)) return SCORE.choseongPrefix
  }
  if (n.jamo.startsWith(q.keys.jamo)) return SCORE.jamoPrefix
  if (q.cho !== null && n.cho.includes(q.cho)) return SCORE.choseongContains
  if (q.latin && n.qwerty.startsWith(c)) return SCORE.qwertyPrefix
  if (n.compact.includes(c)) return SCORE.contains
  if (n.jamo.includes(q.keys.jamo)) return SCORE.jamoContains
  return 0
}

/** 자모 단위 레벤슈타인 거리. limit을 넘으면 limit+1을 돌려주고 일찍 멈춘다 */
function distance(a: string[], b: string[], limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      best = Math.min(best, row[j])
    }
    if (best > limit) return limit + 1
    prev = row
  }
  return prev[b.length]
}

/** 이름 전체, 또는 이름의 앞부분(검색어와 같은 길이)과의 오타 거리 중 작은 것 */
function typoScore(n: NameKeys, q: Query): number {
  const qj = [...q.keys.jamo]
  const nj = [...n.jamo]
  const d = Math.min(distance(qj, nj, q.maxTypo), distance(qj, nj.slice(0, qj.length), q.maxTypo))
  return d >= 1 && d <= q.maxTypo ? SCORE.typo - 100 * d : 0
}

/** 문서에서 가장 높은 점수와, 그 점수가 제목에서 나왔는지(제목과 별칭이 같은 점수면 제목) */
function best(doc: IndexedDoc, f: (n: NameKeys, alias: boolean) => number): { score: number; title: boolean } {
  const title = f(doc.title, false)
  let alias = 0
  for (const a of doc.aliases) alias = Math.max(alias, f(a, true))
  return title >= alias ? { score: title, title: title > 0 } : { score: alias, title: false }
}

/**
 * 검색어로 문서를 점수 매겨 높은 순으로 돌려준다(0점은 뺀다, 설계 문서 §9).
 * 같은 점수면 제목에서 맞은 것이 별칭에서 맞은 것보다 먼저, 그다음 제목이 짧은 것, 그다음 넣은 순서.
 */
export function rank(index: SearchIndex, query: string): { id: string; score: number }[] {
  const q = parseQuery(query)
  if (!q) return []
  const scored = index.docs.map((doc) => ({ doc, ...best(doc, (n, alias) => scoreName(n, q, alias)) }))
  if (q.maxTypo > 0 && scored.filter((s) => s.score > SCORE.typo).length < TYPO_GATE) {
    for (const s of scored) {
      if (s.score > SCORE.typo) continue
      const typo = best(s.doc, (n) => typoScore(n, q))
      if (typo.score > s.score) Object.assign(s, typo)
    }
  }
  for (const s of scored) if (s.score === 0 && s.doc.body.includes(q.text)) s.score = SCORE.body
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.title) - Number(a.title) || a.doc.titleLength - b.doc.titleLength || a.doc.order - b.doc.order)
    .map((s) => ({ id: s.doc.id, score: s.score }))
}
