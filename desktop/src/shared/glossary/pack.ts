import { compactOf } from '../search/ranker'
import { GLOSSARY_LIMITS as L, type GlossaryEntry } from './types'

/** 용어 팩·사용자 용어 파일 형식(설계 문서 §9) */
export const GLOSSARY_FORMAT = 'sure-mate-glossary'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const EPOCH = '1970-01-01T00:00:00.000Z'

/** 링크로 열어도 되는 주소(http/https만) */
export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** 중복 판단 키: 검색과 같은 compact(대소문자·기호·공백 무시) */
export const normalizedKey = (term: string): string => compactOf(term)

/** 문자열 목록: 빈 것과 너무 긴 것은 빼고 max개까지 */
function strings(v: unknown, max: number, maxLength: number): { list: string[]; dropped: number } {
  const all = Array.isArray(v) ? v.map(str).filter((s) => s !== '') : []
  const ok = all.filter((s) => s.length <= maxLength)
  return { list: ok.slice(0, max), dropped: all.length - Math.min(ok.length, max) }
}

export interface ParsedGlossaryPack {
  entries: GlossaryEntry[]
  /** 건너뛰거나 줄인 까닭(화면·알림용, 나온 순서대로) */
  errors: string[]
  /** 통째로 건너뛴 항목 수(파일 형식이 틀리면 0) */
  skipped: number
  /** 읽었지만 링크·태그·별칭 일부를 뺀 항목 수(entries에 들어 있다) */
  trimmed: number
}

/**
 * 용어 팩을 검사해 올바른 항목만 돌려주고, 건너뛰거나 줄인 까닭을 errors에 남긴다.
 * 통째로 건너뛴 항목(skipped)과 일부 값만 뺀 항목(trimmed)은 따로 센다(가져오기 미리 보기 숫자가 실제 반영과 같게).
 * source: builtin·imported면 모든 항목을 그 출처로, user면 파일에 imported라고 적힌 것만 지키고 나머지는 user.
 */
export function parseGlossaryPack(raw: unknown, source: GlossaryEntry['source']): ParsedGlossaryPack {
  if (!isObj(raw) || raw.format !== GLOSSARY_FORMAT || !Array.isArray(raw.entries)) {
    return { entries: [], errors: [`용어 팩 형식이 아니에요(format "${GLOSSARY_FORMAT}"와 entries 목록이 필요)`], skipped: 0, trimmed: 0 }
  }
  const entries: GlossaryEntry[] = []
  const errors: string[] = []
  let skipped = 0
  let trimmed = 0
  const skip = (message: string): void => {
    skipped++
    errors.push(message)
  }
  const ids = new Set<string>()
  raw.entries.forEach((v, i) => {
    const where = `${i + 1}번째 항목`
    if (!isObj(v)) return skip(`${where}: 객체가 아님`)
    const id = str(v.id)
    if (!id || id.length > 64) return skip(`${where}: id가 없거나 너무 김`)
    if (ids.has(id)) return skip(`${where}: id가 겹침(${id})`)
    const term = str(v.term)
    if (!term || term.length > L.term) return skip(`${where}: 용어는 1~${L.term}자(${id})`)
    const definition = typeof v.definition === 'string' ? v.definition.trim() : ''
    if (!definition || definition.length > L.definition) return skip(`${where}: 설명은 1~${L.definition.toLocaleString('ko-KR')}자(${id})`)
    const example = typeof v.example === 'string' ? v.example.trim() : ''
    if (example.length > L.example) return skip(`${where}: 사용 예는 ${L.example}자 이하(${id})`)

    const aliases = strings(v.aliases, L.aliases, L.alias)
    const tags = strings(v.tags, L.tags, L.tag)
    const rawLinks = Array.isArray(v.links) ? v.links : []
    const goodLinks = rawLinks
      .filter(isObj)
      .map((l) => ({ title: str(l.title), url: str(l.url) }))
      .filter((l) => l.url.length <= L.url && isHttpUrl(l.url))
      .map((l) => ({ title: (l.title || l.url).slice(0, L.linkTitle), url: l.url }))
    const links = goodLinks.slice(0, L.links)
    const droppedLinks = rawLinks.length - links.length
    if (aliases.dropped || tags.dropped || droppedLinks) {
      trimmed++
      errors.push(`${where}: 별칭 ${aliases.dropped}·태그 ${tags.dropped}·링크 ${droppedLinks}개를 뺐어요(http/https 링크 ${L.links}개, 태그 ${L.tags}개까지)(${id})`)
    }

    const updatedAt = typeof v.updatedAt === 'string' && !Number.isNaN(Date.parse(v.updatedAt)) ? v.updatedAt : EPOCH
    const version = typeof v.version === 'number' && Number.isInteger(v.version) && v.version > 0 ? v.version : 1
    const author = str(v.author).slice(0, L.author)
    const entrySource: GlossaryEntry['source'] = source === 'user' ? (v.source === 'imported' ? 'imported' : 'user') : source

    ids.add(id)
    entries.push({
      id,
      term,
      aliases: aliases.list,
      definition,
      ...(example ? { example } : {}),
      links,
      tags: tags.list,
      ...(author ? { author } : {}),
      source: entrySource,
      updatedAt,
      version
    })
    return undefined
  })
  return { entries, errors, skipped, trimmed }
}
