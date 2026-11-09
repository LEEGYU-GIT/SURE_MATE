import type { WikiCardEntry, WikiCardView } from '../flyout/flyout-content'
import { buildSearchIndex, rankStages, TYPO_LONG_JAMO, type RankStage, type SearchIndex } from '../search/ranker'
import { findGlossaryTerms, MAX_TERMS } from './find-terms'
import type { GlossaryEntry } from './types'

/** 앞뒤 공백을 뺀 글이 이 글자 수(코드 포인트) 이하면 짧은 글: 가장 맞는 항목 1개 + 후보 2개(설계 §9) */
export const WIKI_SHORT_MAX = 20
/** 긴 글은 앞의 이 글자 수(코드 포인트)에서만 용어를 찾는다(아주 긴 선택에서도 카드가 늦게 뜨지 않게) */
export const WIKI_LOOKUP_MAX_CHARS = 20000
/** 짧은 글 카드의 후보 수 */
const OTHER_COUNT = 2

export type WikiLookup =
  | { kind: 'best'; best: GlossaryEntry; others: GlossaryEntry[] }
  | { kind: 'found'; entries: GlossaryEntry[]; more: number }
  | { kind: 'none' }

/** 위키 카드 검색 색인: 제목은 용어, 별칭은 별칭, 본문은 설명 */
export function buildGlossaryIndex(entries: GlossaryEntry[]): SearchIndex {
  return buildSearchIndex(entries.map((e) => ({ id: e.id, title: e.term, aliases: e.aliases, body: e.definition })))
}

const clean = (text: string): string => text.normalize('NFC').trim()

/** 코드 포인트 수가 WIKI_SHORT_MAX 이하인지(긴 글 전체를 배열로 만들지 않는다) */
function isShort(t: string): boolean {
  if (t.length <= WIKI_SHORT_MAX) return true
  // 코드 포인트 하나는 UTF-16 단위로 많아야 2개
  if (t.length > WIKI_SHORT_MAX * 2) return false
  return Array.from(t).length <= WIKI_SHORT_MAX
}

/** 앞에서 max개 코드 포인트(이모지 반쪽이 남지 않게) */
function headCodePoints(s: string, max: number): string {
  if (s.length <= max) return s
  let count = 0
  let end = 0
  for (const ch of s) {
    if (count === max) break
    end += ch.length
    count++
  }
  return s.slice(0, end)
}

const WORD_HEAD = /^[\p{L}\p{N}]/u
const WORD_TAIL = /[\p{L}\p{N}]+$/u

/** 긴 글에서 찾을 앞부분. 자른 자리가 낱말 가운데면 그 낱말 조각은 뺀다(뒤가 잘린 'SILVER'의 'SIL'을 용어로 찾지 않게) */
function scanPart(t: string): string {
  const part = headCodePoints(t, WIKI_LOOKUP_MAX_CHARS)
  return WORD_HEAD.test(t.slice(part.length)) ? part.replace(WORD_TAIL, '') : part
}

/** 짧은 글이면 앞뒤 공백을 뺀 그 글(카드의 "‘검색어’에 맞는 용어가 없어요"와 팔레트 검색어), 긴 글이면 null */
export function shortWikiQuery(text: string): string | null {
  const t = clean(text)
  return isShort(t) ? t : null
}

/**
 * 랭커 결과가 가장 맞는 항목(맨 위)이 될 수 있는지: 이름·별칭 단계는 늘, 자모 오타 단계는 랭커가 오타를 2개까지
 * 봐주는 긴 검색어(자모 TYPO_LONG_JAMO개 이상)일 때만. 설명 본문에만 있는 말은 후보 자리만 채운다
 * ('배포'·'문서'처럼 설명에 흔한 말이 엉뚱한 용어를 맨 위에 올리지 않게, '서버' 같은 두 글자 오타도 마찬가지)
 */
const canLead = (stage: RankStage, jamoLength: number): boolean => stage === 'name' || (stage === 'typo' && jamoLength >= TYPO_LONG_JAMO)

/**
 * 짧은 글: 글 안에 용어 이름·별칭이 그대로 있으면(조사 허용) 처음 찾은 항목이 가장 맞는 항목이고, 후보는 나머지 찾은 항목
 * (같은 이름의 다른 뜻 포함)과 랭커 결과에서 겹치지 않게 채운다. 그대로 있는 이름이 없을 때만 랭커 결과에서
 * 맨 위가 될 수 있는 첫 항목(canLead)을 고르고, 없으면 none이다(팔레트 검색은 그대로 모든 단계를 보여 준다).
 * 랭커를 먼저 쓰지 않는 이유: 조사 '가' 같은 짧은 토큰이 다른 항목과 맞아 엉뚱한 항목이 맨 위에 올 수 있다.
 */
function lookupShort(t: string, entries: GlossaryEntry[], index: SearchIndex): WikiLookup {
  const direct = findGlossaryTerms(t, entries)
  const ranked: { entry: GlossaryEntry; lead: boolean }[] = []
  if (direct.length <= OTHER_COUNT) {
    const byId = new Map<string, GlossaryEntry>()
    for (const e of entries) if (!byId.has(e.id)) byId.set(e.id, e)
    const { jamoLength, hits } = rankStages(index, t)
    for (const h of hits) {
      const e = byId.get(h.id)
      if (e) ranked.push({ entry: e, lead: canLead(h.stage, jamoLength) })
    }
  }
  const best = direct[0] ?? ranked.find((r) => r.lead)?.entry
  if (!best) return { kind: 'none' }
  const seen = new Set<string>([best.id])
  const others: GlossaryEntry[] = []
  for (const e of [...direct, ...ranked.map((r) => r.entry)]) {
    if (others.length === OTHER_COUNT) break
    if (seen.has(e.id)) continue
    seen.add(e.id)
    others.push(e)
  }
  return { kind: 'best', best, others }
}

/**
 * 선택한 글(또는 클립보드 글)로 위키 카드에 보일 용어를 찾는다(설계 §9 선택 텍스트 위키 카드).
 * 앞뒤 공백을 뺀 글이 20자(코드 포인트) 이하면 가장 맞는 항목 1개 + 후보 2개, 넘으면 앞 20,000자에 나온 용어를
 * 처음 나온 순서로 모두(최대 MAX_TERMS개, 나머지는 수). index는 entries로 만든 색인이어야 한다(buildGlossaryIndex).
 */
export function lookupWiki(text: string, entries: GlossaryEntry[], index: SearchIndex): WikiLookup {
  const t = clean(text)
  if (!t) return { kind: 'none' }
  if (isShort(t)) return lookupShort(t, entries, index)
  const found = findGlossaryTerms(scanPart(t), entries)
  if (found.length === 0) return { kind: 'none' }
  return { kind: 'found', entries: found.slice(0, MAX_TERMS), more: Math.max(0, found.length - MAX_TERMS) }
}

/** 카드에 보낼 항목: 링크·태그·작성자·시각·판은 빼고, 사용 예는 있을 때만 */
export function toCardEntry(e: GlossaryEntry): WikiCardEntry {
  return {
    id: e.id,
    term: e.term,
    aliases: [...e.aliases],
    definition: e.definition,
    ...(e.example ? { example: e.example } : {}),
    source: e.source
  }
}

/**
 * 찾은 결과를 카드 내용으로 바꾼다(lookupWiki + toCardEntry). 맞는 용어가 없으면 짧은 글은 그 글을 검색어로,
 * 긴 글은 검색어로 쓸 수 없어 빈 검색어(카드가 "이 글에 나온 용어가 없어요", 팔레트는 '?')
 */
export function wikiCardView(text: string, source: 'selection' | 'clipboard', entries: GlossaryEntry[], index: SearchIndex): WikiCardView {
  const found = lookupWiki(text, entries, index)
  switch (found.kind) {
    case 'best':
      return { kind: 'best', source, best: toCardEntry(found.best), others: found.others.map(toCardEntry) }
    case 'found':
      return { kind: 'found', source, entries: found.entries.map(toCardEntry), more: found.more }
    case 'none':
      return { kind: 'none', source, query: shortWikiQuery(text) ?? '' }
  }
}
