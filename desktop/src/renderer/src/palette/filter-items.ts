import { parseQuery } from '../../../shared/palette-query'
import type { PaletteItem } from '../../../shared/types'

/**
 * 임시 검색: 접두어로 구역을 거른 뒤 제목·부제·키워드에 검색어가 들어 있는지(대소문자 무시).
 * M4에서 초성·자모·오타를 다루는 랭커로 바꾼다.
 */
export function filterItems(items: PaletteItem[], query: string): PaletteItem[] {
  const { scope, text } = parseQuery(query)
  const inScope = scope ? items.filter((item) => item.group === scope) : items
  const q = text.toLowerCase()
  if (!q) return inScope
  return inScope.filter((item) => [item.title, item.subtitle ?? '', ...(item.keywords ?? [])].some((s) => s.toLowerCase().includes(q)))
}
