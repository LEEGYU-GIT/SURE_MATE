import { expect, it } from 'vitest'
import type { PaletteItem } from '../../../shared/types'
import { filterItems } from './filter-items'

const items: PaletteItem[] = [
  { id: 'prompt:meeting-notes', group: 'prompt', title: '회의록 정리', subtitle: '결정 사항·담당자', keywords: ['회의', 'meeting'] },
  { id: 'dev.listWindows', group: 'command', title: '개발: 창 목록', keywords: ['window'] },
  { id: 'w', group: 'wiki', title: 'MC/DC', keywords: ['커버리지'] }
]

it('빈 검색어면 전체', () => {
  expect(filterItems(items, '')).toHaveLength(3)
})

it('제목·부제·키워드에서 대소문자 무시로 찾는다', () => {
  expect(filterItems(items, 'mc/dc').map((i) => i.id)).toEqual(['w'])
  expect(filterItems(items, '커버')).toHaveLength(1)
  expect(filterItems(items, '담당자').map((i) => i.id)).toEqual(['prompt:meeting-notes'])
  expect(filterItems(items, 'MEETING').map((i) => i.id)).toEqual(['prompt:meeting-notes'])
  expect(filterItems(items, '없는말')).toHaveLength(0)
})

it('접두어는 그 구역만 남긴다', () => {
  expect(filterItems(items, '/').map((i) => i.id)).toEqual(['prompt:meeting-notes'])
  expect(filterItems(items, '>창').map((i) => i.id)).toEqual(['dev.listWindows'])
  expect(filterItems(items, '/창')).toHaveLength(0)
})
