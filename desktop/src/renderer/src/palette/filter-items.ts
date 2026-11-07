import type { PaletteItem } from '../../../shared/types'

/**
 * M1 임시 검색: 제목·키워드에 검색어가 들어 있는지(대소문자 무시).
 * M3·M6에서 초성·자모·오타를 다루는 랭커로 바꾼다.
 */
export function filterItems(items: PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => [item.title, ...(item.keywords ?? [])].some((text) => text.toLowerCase().includes(q)))
}
