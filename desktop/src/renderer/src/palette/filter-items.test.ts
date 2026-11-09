import { expect, it } from 'vitest'
import type { PaletteItem } from '../../../shared/types'
import { buildPaletteIndex, filterItems, groupItems, MAX_ROWS, WIKI_ADD_ID, withWikiAdd } from './filter-items'

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

it('?만 치면 위키를 용어 순서로', () => {
  expect(ids(filterItems(items, '?'))).toEqual(['wiki:aspice', 'wiki:mcdc'])
})

it('범위 없이 한 글자(자모 하나 포함)만 치면 위키는 빼고 찾는다(용어가 목록을 덮지 않게)', () => {
  const list: PaletteItem[] = [
    { id: 'wiki:regression', group: 'wiki', title: '회귀 시험' },
    { id: 'prompt:meeting-notes', group: 'prompt', title: '회의록 정리' }
  ]
  expect(ids(filterItems(list, '회'))).toEqual(['prompt:meeting-notes'])
  expect(ids(filterItems(list, 'ㅎ'))).toEqual(['prompt:meeting-notes'])
  expect(ids(filterItems(list, ' 회 '))).toEqual(['prompt:meeting-notes'])
  // 두 글자부터, 또는 ?로 위키를 고르면 위키도 찾는다
  expect(ids(filterItems(list, '회귀'))).toEqual(['wiki:regression'])
  expect(ids(filterItems(list, '?회'))).toEqual(['wiki:regression'])
  expect(ids(filterItems(list, '?ㅎ'))).toEqual(['wiki:regression'])
})

it('목록은 50개까지만 그린다(용어 2,000개에서도 검색 갱신 50ms, 설계 문서 §16)', () => {
  const many: PaletteItem[] = [
    { id: 'prompt:p', group: 'prompt', title: '시험 계획' },
    ...Array.from({ length: 2000 }, (_, i): PaletteItem => ({ id: `wiki:t${i}`, group: 'wiki', title: `시험 용어 ${i}` }))
  ]
  expect(MAX_ROWS).toBe(50)
  expect(filterItems(many, '?')).toHaveLength(MAX_ROWS)
  expect(filterItems(many, '?ㅅ')).toHaveLength(MAX_ROWS)
  expect(filterItems(many, '?시험')).toHaveLength(MAX_ROWS)
  const unscoped = filterItems(many, '시험')
  expect(unscoped).toHaveLength(MAX_ROWS)
  // 자르기는 점수 순으로 줄 세운 뒤에 한다(맨 위 후보는 그대로)
  expect(unscoped[0].id).toBe('prompt:p')
})

it('태그는 이름처럼 치지 않고 본문과 같은 마지막 단계에서만 찾는다', () => {
  const list: PaletteItem[] = [
    { id: 'wiki:fp', group: 'wiki', title: '오탐', tags: ['정적분석'] },
    { id: 'wiki:sa', group: 'wiki', title: '정적분석 도구' }
  ]
  expect(ids(filterItems(list, '정적분석'))).toEqual(['wiki:sa', 'wiki:fp'])
  expect(ids(filterItems(list, 'ㅈㅈㅂㅅ'))).toEqual(['wiki:sa'])
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

it('위키 범위에 검색어가 있거나 아무것도 못 찾으면 맨 끝에 "직접 추가하기"를 붙인다(검색어를 용어로)', () => {
  const add = (q: string): PaletteItem | undefined => withWikiAdd(filterItems(items, q), q).find((i) => i.id === WIKI_ADD_ID)
  expect(add('?mc')?.title).toBe('‘mc’ 용어 직접 추가하기')
  expect(withWikiAdd(filterItems(items, '?mc'), '?mc').at(-1)?.id).toBe(WIKI_ADD_ID)
  expect(add('정적분석')?.group).toBe('wiki')
  expect(add('회의')).toBeUndefined()
  expect(add('/없는말')).toBeUndefined()
  expect(add('')).toBeUndefined()
  expect(add('?')).toBeUndefined()
})

it('범위 없이 한 글자만 치면 "직접 추가하기"를 붙이지 않는다(위키를 빼고 찾았을 뿐 맞는 용어가 있을 수 있다)', () => {
  const list: PaletteItem[] = [{ id: 'wiki:regression', group: 'wiki', title: '회귀 시험' }]
  const shown = (q: string): string[] => ids(withWikiAdd(filterItems(list, q), q))
  expect(shown('회')).toEqual([])
  expect(shown('ㅎ')).toEqual([])
  expect(shown(' 회 ')).toEqual([])
  // ?로 위키를 고르면 한 글자에도 붙이고, 범위 없이 두 글자 이상 쳐서 아무것도 못 찾으면 붙인다
  expect(shown('?회')).toEqual(['wiki:regression', WIKI_ADD_ID])
  expect(shown('없는말')).toEqual([WIKI_ADD_ID])
})
