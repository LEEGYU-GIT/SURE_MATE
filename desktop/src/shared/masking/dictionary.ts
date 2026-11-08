import { foldForMatch, isAsciiAlnum, isHangulSyllable } from '../text/normalize'
import { ENTITY_CATEGORIES, type Detection, type EntityCategory } from './types'

/** 가명 사전 항목(설계 문서 §8). 사전 파일은 로컬 전용 */
export interface MaskTerm {
  id: string
  category: EntityCategory
  canonical: string
  aliases: string[]
  /** 뒤에 글자가 붙으면 찾지 않는다(짧고 흔한 이름용) */
  exactOnly?: boolean
}

export const MASK_DICTIONARY_FORMAT = 'sure-mate-masking'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 사전 파일을 검사해 올바른 항목만 돌려주고, 건너뛴 이유를 errors에 남긴다 */
export function parseMaskDictionary(raw: unknown): { terms: MaskTerm[]; errors: string[] } {
  if (!isObj(raw) || raw.format !== MASK_DICTIONARY_FORMAT || !Array.isArray(raw.terms)) {
    return { terms: [], errors: [`가명 사전 형식이 아니에요(format "${MASK_DICTIONARY_FORMAT}"와 terms 목록이 필요)`] }
  }
  const terms: MaskTerm[] = []
  const errors: string[] = []
  const ids = new Set<string>()
  raw.terms.forEach((v, i) => {
    const where = `${i + 1}번째 항목`
    if (!isObj(v)) return errors.push(`${where}: 객체가 아님`)
    const id = typeof v.id === 'string' ? v.id.trim() : ''
    if (!id || id.length > 64) return errors.push(`${where}: id가 없거나 너무 김`)
    if (ids.has(id)) return errors.push(`${where}: id가 겹침(${id})`)
    if (!ENTITY_CATEGORIES.includes(v.category as EntityCategory)) return errors.push(`${where}: 분류는 client·project·person·system 중 하나(${id})`)
    const canonical = typeof v.canonical === 'string' ? v.canonical.trim() : ''
    if (!canonical || canonical.length > 100) return errors.push(`${where}: 이름이 없거나 100자를 넘음(${id})`)
    const aliases = Array.isArray(v.aliases) ? v.aliases.filter((a): a is string => typeof a === 'string' && a.trim() !== '').map((a) => a.trim()) : []
    ids.add(id)
    terms.push({ id, category: v.category as EntityCategory, canonical, aliases, ...(v.exactOnly === true ? { exactOnly: true } : {}) })
    return undefined
  })
  return { terms, errors }
}

interface Candidate {
  folded: string
  term: MaskTerm
}

/**
 * 사전 이름(정식 이름과 별칭)을 글에서 찾는다(설계 문서 §8 찾기 규칙). 글은 NFC로 맞춰 둔 상태여야 한다.
 * 왼쪽부터 가장 긴 것, 겹치지 않게. 한글로 시작하면 한글 구간의 맨 앞에서만, 영문·숫자로 시작하거나 끝나면 그쪽 이웃이 영문·숫자가 아닐 때만.
 * 한글로 끝나는 이름 뒤에는 조사가 붙어도 된다. exactOnly면 뒤에 글자·숫자·한글이 오면 안 된다.
 */
export function findTerms(text: string, terms: MaskTerm[]): Detection[] {
  const byFirst = new Map<string, Candidate[]>()
  for (const term of terms) {
    for (const name of new Set([term.canonical, ...term.aliases])) {
      const folded = foldForMatch(name.normalize('NFC'))
      if (!folded) continue
      const list = byFirst.get(folded[0]) ?? []
      list.push({ folded, term })
      byFirst.set(folded[0], list)
    }
  }
  for (const list of byFirst.values()) list.sort((a, b) => b.folded.length - a.folded.length)

  const folded = foldForMatch(text)
  const out: Detection[] = []
  let i = 0
  while (i < folded.length) {
    const hit = (byFirst.get(folded[i]) ?? []).find((c) => matchesAt(folded, i, c))
    if (!hit) {
      i++
      continue
    }
    const end = i + hit.folded.length
    out.push({ start: i, end, category: hit.term.category, original: text.slice(i, end), key: `${hit.term.category}:${hit.term.id}` })
    i = end
  }
  return out
}

function matchesAt(folded: string, i: number, c: Candidate): boolean {
  if (!folded.startsWith(c.folded, i)) return false
  const first = c.folded[0]
  const last = c.folded[c.folded.length - 1]
  const prev = folded[i - 1] ?? ''
  const next = folded[i + c.folded.length] ?? ''
  if (isHangulSyllable(first) && isHangulSyllable(prev)) return false
  if (isAsciiAlnum(first) && isAsciiAlnum(prev)) return false
  if (isAsciiAlnum(last) && isAsciiAlnum(next)) return false
  if (c.term.exactOnly && (isAsciiAlnum(next) || isHangulSyllable(next))) return false
  return true
}
