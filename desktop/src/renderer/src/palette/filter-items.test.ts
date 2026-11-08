import { expect, it } from 'vitest'
import type { PaletteItem } from '../../../shared/types'
import { buildPaletteIndex, filterItems, groupItems } from './filter-items'

const items: PaletteItem[] = [
  { id: 'prompt:meeting-notes', group: 'prompt', title: '회의록 정리', subtitle: '결정 사항·담당자', keywords: ['회의', 'meeting'] },
  { id: 'dev.listWindows', group: 'command', title: '개발: 창 목록', keywords: ['window'] },
  { id: 'wiki:mcdc', group: 'wiki', title: 'MC/DC', keywords: ['커버리지'], body: '조건과 결정의 커버리지' },
  { id: 'wiki:aspice', group: 'wiki', title: 'ASPICE', keywords: [], body: '자동차 소프트웨어 프로세스 평가 모델' }
]
const ids = (list: PaletteItem[]): string[] => list.map((i) => i.id)

it('검색어가 비었고 범위가 없으면 위키를 뺀 나머지를 넣은 순서대로', () => {
  expect(ids(filterItems(items, ''))).toEqual(['prompt:meeting-notes', 'dev.listWindows'])
})

it('?만 치면 위키 전부를 용어 순서로', () => {
  expect(ids(filterItems(items, '?'))).toEqual(['wiki:aspice', 'wiki:mcdc'])
})

it('제목·키워드·부제·본문에서 찾고, 점수 높은 순으로', () => {
  expect(ids(filterItems(items, 'mc/dc'))).toEqual(['wiki:mcdc'])
  expect(ids(filterItems(items, '커버'))).toEqual(['wiki:mcdc'])
  expect(ids(filterItems(items, '담당자'))).toEqual(['prompt:meeting-notes'])
  expect(ids(filterItems(items, 'MEETING'))).toEqual(['prompt:meeting-notes'])
  expect(ids(filterItems(items, 'ㅎㅇㄹ'))).toEqual(['prompt:meeting-notes'])
  expect(filterItems(items, '없는말')).toHaveLength(0)
})

it('접두어는 그 구역만 남긴다', () => {
  expect(ids(filterItems(items, '/'))).toEqual(['prompt:meeting-notes'])
  expect(ids(filterItems(items, '>창'))).toEqual(['dev.listWindows'])
  expect(filterItems(items, '/창')).toHaveLength(0)
})

it('미리 만든 색인을 넘겨도 결과가 같다', () => {
  const index = buildPaletteIndex(items)
  expect(ids(filterItems(items, '커버', index))).toEqual(ids(filterItems(items, '커버')))
})

it('구역은 가장 먼저 나온 항목 순서대로 묶는다(맨 위 후보가 맨 위 구역에)', () => {
  const ranked: PaletteItem[] = [items[2], items[0], items[3], items[1]]
  expect(groupItems(ranked).map((g) => [g.group, ids(g.items)])).toEqual([
    ['wiki', ['wiki:mcdc', 'wiki:aspice']],
    ['prompt', ['prompt:meeting-notes']],
    ['command', ['dev.listWindows']]
  ])
})
