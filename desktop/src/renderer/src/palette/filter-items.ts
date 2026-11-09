import { parseQuery } from '../../../shared/palette-query'
import { buildSearchIndex, rank, type SearchIndex } from '../../../shared/search/ranker'
import type { PaletteGroup, PaletteItem } from '../../../shared/types'

/** 팔레트 항목 색인. 제목, 별칭은 키워드, 본문은 부제와 본문(위키 설명)과 태그 */
export function buildPaletteIndex(items: PaletteItem[]): SearchIndex {
  return buildSearchIndex(
    items.map((item) => ({
      id: item.id,
      title: item.title,
      aliases: item.keywords ?? [],
      body: [item.subtitle, item.body, ...(item.tags ?? [])].filter(Boolean).join('\n')
    }))
  )
}

/** 한 번에 그리는 목록 줄 수 상한. 용어가 2,000개여도 한 번 칠 때마다 수천 줄을 다시 그리지 않게(설계 문서 §16 검색 갱신 50ms) */
export const MAX_ROWS = 50

const byTitle = (a: PaletteItem, b: PaletteItem): number => a.title.localeCompare(b.title, 'ko')

/** 한 글자(자모 하나 포함)만 친 검색어. 범위 없이 이렇게 치면 거의 모든 용어가 걸려 목록을 덮는다 */
const isOneChar = (text: string): boolean => [...text].length <= 1

/**
 * 검색어로 항목을 거르고 점수 높은 순으로 MAX_ROWS개까지 돌려준다(설계 문서 §9 랭커, 모든 구역 공통).
 * 접두어가 있으면 그 구역만. 위키는 `?`로 골랐거나 범위 없이 두 글자 이상 쳤을 때만 보인다(검색어가 비었으면 용어 순).
 */
export function filterItems(items: PaletteItem[], query: string, index: SearchIndex = buildPaletteIndex(items)): PaletteItem[] {
  const { scope, text } = parseQuery(query)
  const inScope = (item: PaletteItem): boolean => (scope ? item.group === scope : item.group !== 'wiki' || !isOneChar(text))
  if (!text) {
    const list = items.filter(inScope)
    return (scope === 'wiki' ? list.sort(byTitle) : list).slice(0, MAX_ROWS)
  }
  const byId = new Map(items.map((item) => [item.id, item]))
  const out: PaletteItem[] = []
  for (const r of rank(index, text)) {
    const item = byId.get(r.id)
    if (item && inScope(item)) out.push(item)
    if (out.length >= MAX_ROWS) break
  }
  return out
}

/** 구역별로 묶되, 구역 순서는 그 구역 항목이 처음 나온 순서(맨 위 후보가 맨 위 구역에 오게) */
export function groupItems(items: PaletteItem[]): { group: PaletteGroup; items: PaletteItem[] }[] {
  const groups = new Map<PaletteGroup, PaletteItem[]>()
  for (const item of items) {
    const list = groups.get(item.group)
    if (list) list.push(item)
    else groups.set(item.group, [item])
  }
  return [...groups].map(([group, list]) => ({ group, items: list }))
}

/** 목록 맨 끝의 '직접 추가하기' 항목 id(설계 문서 §9: 이 용어를 아시나요?) */
export const WIKI_ADD_ID = 'wiki-add'

/**
 * 위키 범위(?)에 검색어가 있거나, 범위 없이 쳤는데 아무것도 못 찾았으면 맨 끝에 '직접 추가하기'를 붙인다.
 * 다른 범위(/ > ! @)에서는 붙이지 않는다.
 */
export function withWikiAdd(items: PaletteItem[], query: string): PaletteItem[] {
  const { scope, text } = parseQuery(query)
  if (!text) return items
  if (scope !== 'wiki' && (scope !== null || items.length > 0)) return items
  return [...items, { id: WIKI_ADD_ID, group: 'wiki', title: `‘${text}’ 용어 직접 추가하기`, subtitle: '이 용어를 아시나요? 설명을 적어 팔레트 위키에 넣어요' }]
}
