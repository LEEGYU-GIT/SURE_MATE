import { parseQuery } from '../../../shared/palette-query'
import { buildSearchIndex, rank, type SearchIndex } from '../../../shared/search/ranker'
import type { PaletteGroup, PaletteItem } from '../../../shared/types'

/** 팔레트 항목 색인. 제목, 별칭은 키워드, 본문은 부제와 본문(위키 설명) */
export function buildPaletteIndex(items: PaletteItem[]): SearchIndex {
  return buildSearchIndex(
    items.map((item) => ({
      id: item.id,
      title: item.title,
      aliases: item.keywords ?? [],
      body: [item.subtitle, item.body].filter(Boolean).join('\n')
    }))
  )
}

const byTitle = (a: PaletteItem, b: PaletteItem): number => a.title.localeCompare(b.title, 'ko')

/**
 * 검색어로 항목을 거르고 점수 높은 순으로 돌려준다(설계 문서 §9 랭커, 모든 구역 공통).
 * 접두어가 있으면 그 구역만. 검색어가 비었으면 넣은 순서인데, 위키는 범위를 `?`로 골랐을 때만(용어 순).
 */
export function filterItems(items: PaletteItem[], query: string, index: SearchIndex = buildPaletteIndex(items)): PaletteItem[] {
  const { scope, text } = parseQuery(query)
  const inScope = (item: PaletteItem): boolean => (scope ? item.group === scope : true)
  if (!text) {
    if (scope === 'wiki') return items.filter(inScope).sort(byTitle)
    return items.filter((item) => (scope ? inScope(item) : item.group !== 'wiki'))
  }
  const byId = new Map(items.map((item) => [item.id, item]))
  return rank(index, text)
    .map((r) => byId.get(r.id))
    .filter((item): item is PaletteItem => item !== undefined && inScope(item))
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
