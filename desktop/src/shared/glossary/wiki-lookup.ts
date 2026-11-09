import type { WikiCardEntry } from '../flyout/flyout-content'
import { buildSearchIndex, rank, type SearchIndex } from '../search/ranker'
import { findGlossaryTerms, MAX_TERMS } from './find-terms'
import type { GlossaryEntry } from './types'

/** 이 길이(코드 포인트)까지는 짧은 글: 가장 맞는 용어 하나와 후보 2개(설계 문서 §9) */
export const WIKI_SHORT_MAX = 20
/** 긴 글은 앞부분 이만큼에서만 용어를 찾는다(20만 자를 골라도 멈추지 않게) */
export const WIKI_LOOKUP_MAX_CHARS = 20000

export type WikiLookup =
  | { kind: 'best'; best: GlossaryEntry; others: GlossaryEntry[] }
  | { kind: 'found'; entries: GlossaryEntry[]; more: number }
  | { kind: 'none' }

/** 위키 카드 검색 색인: 제목은 용어, 별칭은 별칭, 본문은 설명 */
export function buildGlossaryIndex(entries: GlossaryEntry[]): SearchIndex {
  return buildSearchIndex(entries.map((e) => ({ id: e.id, title: e.term, aliases: e.aliases, body: e.definition })))
}

/**
 * 선택한 글 → 위키 카드 결과(설계 문서 §9 선택 텍스트 위키 카드).
 * 짧은 글은 글 안에 용어 이름·별칭이 그대로 있으면(조사 허용: "MC/DC가") 그것이 가장 맞는 용어이고, 후보는 나머지 찾은 용어와
 * 랭커 결과에서 겹치지 않게 2개. 그대로 있는 이름이 없으면 랭커 상위 3개(초성·오타·한영 오입력).
 * 랭커를 먼저 쓰지 않는 까닭: 조사 '가' 같은 짧은 토큰이 다른 용어와 맞아 엉뚱한 용어가 맨 위에 올 수 있다.
 * 긴 글은 앞 2만 자에서 글 안의 용어를 처음 나온 순서로 모두(MAX_TERMS까지, 나머지는 more).
 */
export function lookupWiki(text: string, entries: GlossaryEntry[], index: SearchIndex): WikiLookup {
  const trimmed = text.trim()
  if (!trimmed) return { kind: 'none' }
  const chars = Array.from(trimmed)
  if (chars.length <= WIKI_SHORT_MAX) {
    const byId = new Map(entries.map((e) => [e.id, e]))
    const ranked = rank(index, trimmed)
      .map((r) => byId.get(r.id))
      .filter((e): e is GlossaryEntry => e !== undefined)
    const named = findGlossaryTerms(trimmed, entries)
    const [best, ...rest] = named.length ? named : ranked
    if (!best) return { kind: 'none' }
    const others: GlossaryEntry[] = []
    for (const e of [...rest, ...ranked]) {
      if (others.length === 2) break
      if (e.id !== best.id && !others.some((o) => o.id === e.id)) others.push(e)
    }
    return { kind: 'best', best, others }
  }
  const head = chars.length > WIKI_LOOKUP_MAX_CHARS ? chars.slice(0, WIKI_LOOKUP_MAX_CHARS).join('') : trimmed
  const all = findGlossaryTerms(head, entries)
  if (all.length === 0) return { kind: 'none' }
  return { kind: 'found', entries: all.slice(0, MAX_TERMS), more: Math.max(0, all.length - MAX_TERMS) }
}

/** 카드에 그릴 값만(링크·태그·작성자 빼고, 사용 예는 있을 때만) */
export function toCardEntry(e: GlossaryEntry): WikiCardEntry {
  return { id: e.id, term: e.term, aliases: e.aliases, definition: e.definition, ...(e.example ? { example: e.example } : {}), source: e.source }
}
