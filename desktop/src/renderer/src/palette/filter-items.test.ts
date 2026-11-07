import { expect, it } from 'vitest'
import type { PaletteItem } from '../../../shared/types'
import { filterItems } from './filter-items'
import { MOCK_ITEMS } from './mock-items'

it('빈 검색어면 전체', () => {
  expect(filterItems(MOCK_ITEMS, '')).toHaveLength(MOCK_ITEMS.length)
})

it('제목과 키워드에서 대소문자 무시로 찾는다', () => {
  const items = [{ id: 'w', group: 'wiki', title: 'MC/DC', keywords: ['커버리지'] }] as PaletteItem[]
  expect(filterItems(items, 'mc/dc').map((i) => i.id)).toEqual(['w'])
  expect(filterItems(items, '커버')).toHaveLength(1)
  expect(filterItems(items, '없는말')).toHaveLength(0)
})
