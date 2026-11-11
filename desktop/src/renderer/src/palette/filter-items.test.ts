import { expect, it } from 'vitest'
import builtinIntents from '../../../../resources/intents.json'
import { parseIntentPack } from '../../../shared/natural/intent-pack'
import type { UsageRecord } from '../../../shared/natural/usage'
import type { PaletteItem } from '../../../shared/types'
import {
  buildPaletteIndex,
  EMPTY_SEARCH_CONTEXT,
  filterItems,
  groupItems,
  MAX_ROWS,
  RECENT_MAX,
  searchPalette,
  WIKI_ADD_ID,
  withWikiAdd,
  type SearchContext
} from './filter-items'

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

// ── 말하듯 입력과 최근·자주 쓴 항목(설계 §6·§9·§13) ──────────────────────────────────────────────

const pack = parseIntentPack(builtinIntents).pack!
const NOW = Date.parse('2026-11-11T09:00:00.000Z')
const minutesAgo = (m: number): string => new Date(NOW - m * 60_000).toISOString()
const natItems: PaletteItem[] = [
  { id: 'prompt:meeting-notes', group: 'prompt', title: '회의록 정리', keywords: ['회의 정리', '회의록'] },
  { id: 'prompt:weekly-report', group: 'prompt', title: '주간보고 초안', keywords: ['보고서'] },
  { id: 'prompt:static-analysis', group: 'prompt', title: '정적분석 소명 초안', keywords: ['MISRA C'] },
  { id: 'cmd.unmask', group: 'command', title: '가명 되돌리기', keywords: ['원래 이름', '가명'] },
  { id: 'cmd.open-dictionary', group: 'command', title: '가명 사전 열기', keywords: ['사전', '가명'] },
  { id: 'snippet:mail-signature', group: 'snippet', title: '메일 서명', keywords: ['서명'] },
  { id: 'wiki:mcdc', group: 'wiki', title: 'MC/DC', keywords: ['MCDC'] },
  { id: 'wiki:regression', group: 'wiki', title: '회귀 시험' }
]
const natIndex = buildPaletteIndex(natItems)
const ctxOf = (o: Partial<SearchContext> = {}): SearchContext => ({ pack, learned: new Map(), usage: new Map(), now: NOW, ...o })
const search = (q: string, ctx: SearchContext = ctxOf()): ReturnType<typeof searchPalette> => searchPalette(natItems, q, natIndex, ctx)

it('EMPTY_SEARCH_CONTEXT(단어 목록·기록 없음)면 M4 검색 그대로이고, filterItems는 searchPalette의 목록', () => {
  expect(EMPTY_SEARCH_CONTEXT.pack).toBeNull()
  for (const q of ['', '?', '/', '회', '회의', '가명', '>가명', 'mcdc', '없는말', '가명 되돌려줘']) {
    const s = searchPalette(natItems, q, natIndex, EMPTY_SEARCH_CONTEXT)
    expect(s.natural, q).toBe(false)
    expect(s.key, q).toBeNull()
    expect(s.recent, q).toEqual([])
    expect(ids(s.items), q).toEqual(ids(filterItems(natItems, q, natIndex)))
    expect(ids(filterItems(natItems, q, natIndex, ctxOf())), q).toEqual(ids(search(q).items))
  }
})

it('말하듯 입력: 접두어 없이 친 문장은 의도·변형 검색어로 찾고 맨 위 후보에 의도를 표시한다(natural·key)', () => {
  const s = search('가명 되돌려줘')
  expect(s.items[0].id).toBe('cmd.unmask')
  expect(s.top).toEqual({ id: 'cmd.unmask', label: '가명 되돌리기' })
  expect(s.natural).toBe(true)
  expect(s.key).toBe('가명되돌려줘')
  expect(s.recent).toEqual([])
  // 검색어에 맞지 않아도 id로 지목한 명령이 후보
  expect(search('원래 이름으로 돌려줘').items[0].id).toBe('cmd.unmask')
  // 의도를 찾지 못한 낱말은 구역 기본 이름, 그냥 낱말이면 natural false
  expect(search('회의록').top).toEqual({ id: 'prompt:meeting-notes', label: '프롬프트' })
  expect(search('mcdc').top).toEqual({ id: 'wiki:mcdc', label: '용어 뜻' })
  expect(search('mcdc').natural).toBe(false)
  expect(search('없는말').top).toBeNull()
})

it('접두어 검색은 M4와 같은 한 검색어 검색이고 같은 점수면 자주·최근 쓴 항목이 먼저(natural false·key null)', () => {
  expect(ids(search('>가명').items)).toEqual(['cmd.unmask', 'cmd.open-dictionary'])
  // id로 가리키는 규칙 중 가장 좁은 규칙의 이름
  expect(search('>가명').top).toEqual({ id: 'cmd.unmask', label: '가명 되돌리기' })
  const usage = new Map<string, UsageRecord>([['cmd.open-dictionary', { count: 2, lastAt: minutesAgo(10) }]])
  const s = search('>가명', ctxOf({ usage }))
  expect(ids(s.items)).toEqual(['cmd.open-dictionary', 'cmd.unmask'])
  expect(s.top).toEqual({ id: 'cmd.open-dictionary', label: '가명 처리' })
  expect(s.natural).toBe(false)
  expect(s.key).toBeNull()
  // 규칙이 id로 가리키지 않는 항목은 구역 기본 이름
  expect(search('/회의').top).toEqual({ id: 'prompt:meeting-notes', label: '프롬프트' })
  expect(search('!서명').top).toEqual({ id: 'snippet:mail-signature', label: '상용구' })
  expect(search('/없는말').top).toBeNull()
})

it('단어 목록이 없으면(pack null) 접두어가 없어도 M4 검색에 동점 순서만 더한다', () => {
  const usage = new Map<string, UsageRecord>([['cmd.open-dictionary', { count: 1, lastAt: minutesAgo(1) }]])
  const s = search('가명', ctxOf({ pack: null, usage }))
  expect(ids(s.items)).toEqual(['cmd.open-dictionary', 'cmd.unmask'])
  expect(s.natural).toBe(false)
  expect(s.top).toEqual({ id: 'cmd.open-dictionary', label: '명령' })
  expect(search('가명 되돌려줘', ctxOf({ pack: null })).natural).toBe(false)
})

it('군말·끝 기호만 남는 글(예: "그룹"을 치는 중인 "그")은 친 글 그대로 찾는다(목록이 잠깐 비지 않게)', () => {
  const list: PaletteItem[] = [
    { id: 'prompt:group', group: 'prompt', title: '그룹 정리' },
    { id: 'prompt:other', group: 'prompt', title: '회의록 정리' }
  ]
  const idx = buildPaletteIndex(list)
  expect(ids(searchPalette(list, '그', idx, ctxOf()).items)).toEqual(['prompt:group'])
  for (const q of ['그', '좀', '저기', '~~']) {
    expect(ids(searchPalette(list, q, idx, ctxOf()).items), q).toEqual(ids(filterItems(list, q, idx)))
  }
})

it('위키는 접두어 없이 친 원문이 한 글자면 뺀다(변형 검색어가 아닌 원문 기준)', () => {
  for (const q of ['회', 'ㅎ', ' 회 ']) expect(search(q).items.some((i) => i.group === 'wiki'), q).toBe(false)
  // 군말을 빼면 한 글자가 남지만 원문은 세 글자라 위키도 찾는다
  expect(ids(search('회 좀').items)).toContain('wiki:regression')
})

it('빈 검색어: 최근 실행 항목(최근 순, 지금 없는 id·범위 밖은 건너뜀, 5개까지)을 맨 앞에, 그 뒤에 원래 목록을 중복 없이', () => {
  expect(RECENT_MAX).toBe(5)
  const usage = new Map<string, UsageRecord>([
    ['cmd.unmask', { count: 1, lastAt: minutesAgo(6) }],
    ['wiki:mcdc', { count: 3, lastAt: minutesAgo(1) }],
    ['cmd.gone', { count: 9, lastAt: minutesAgo(2) }],
    ['snippet:mail-signature', { count: 1, lastAt: minutesAgo(3) }],
    ['prompt:weekly-report', { count: 1, lastAt: minutesAgo(4) }],
    ['prompt:static-analysis', { count: 1, lastAt: minutesAgo(5) }]
  ])
  const s = search('', ctxOf({ usage }))
  // 6개 중 없는 id 하나를 건너뛰고 최근 순 5개(빈 검색어에서도 최근 위키 항목은 포함)
  expect(s.recent).toEqual(['wiki:mcdc', 'snippet:mail-signature', 'prompt:weekly-report', 'prompt:static-analysis', 'cmd.unmask'])
  expect(ids(s.items)).toEqual([...s.recent, 'prompt:meeting-notes', 'cmd.open-dictionary'])
  expect(s.top).toBeNull()
  expect(s.natural).toBe(false)
  expect(s.key).toBeNull()
  // 5개를 넘으면 오래된 것은 최근 구역에서 빠지고 원래 목록 자리에 남는다
  const more = new Map(usage).set('prompt:meeting-notes', { count: 1, lastAt: minutesAgo(0) })
  const m = search('', ctxOf({ usage: more }))
  expect(m.recent).toEqual(['prompt:meeting-notes', 'wiki:mcdc', 'snippet:mail-signature', 'prompt:weekly-report', 'prompt:static-analysis'])
  expect(ids(m.items)).toEqual([...m.recent, 'cmd.unmask', 'cmd.open-dictionary'])
  // 접두어 범위: 그 구역의 최근 항목만
  expect(search('/', ctxOf({ usage })).recent).toEqual(['prompt:weekly-report', 'prompt:static-analysis'])
  expect(ids(search('/', ctxOf({ usage })).items)).toEqual(['prompt:weekly-report', 'prompt:static-analysis', 'prompt:meeting-notes'])
  expect(ids(search('?', ctxOf({ usage })).items)).toEqual(['wiki:mcdc', 'wiki:regression'])
})

it('빈 검색어 목록도 50줄까지(최근 항목 포함)', () => {
  const many: PaletteItem[] = Array.from({ length: 60 }, (_, i): PaletteItem => ({ id: `prompt:p${i}`, group: 'prompt', title: `프롬프트 ${i}` }))
  const usage = new Map<string, UsageRecord>([['prompt:p59', { count: 1, lastAt: minutesAgo(1) }]])
  const list = searchPalette(many, '', buildPaletteIndex(many), ctxOf({ usage })).items
  expect(list).toHaveLength(MAX_ROWS)
  expect(list[0].id).toBe('prompt:p59')
  expect(new Set(ids(list)).size).toBe(MAX_ROWS)
})

it('학습 키는 공백만 뺀 문장(기호 유지): MISRA C와 MISRA C++는 검색 결과가 같아도 학습이 섞이지 않는다', () => {
  const learned = new Map([['misrac++', 'snippet:mail-signature']])
  const plus = search('MISRA C++', ctxOf({ learned }))
  expect(plus.key).toBe('misrac++')
  expect(plus.top).toEqual({ id: 'snippet:mail-signature', label: '기억한 문장' })
  const plain = search('MISRA C', ctxOf({ learned }))
  expect(plain.key).toBe('misrac')
  expect(plain.items[0].id).toBe('prompt:static-analysis')
  // 랭커 compact는 그대로라 학습이 없으면 두 검색어의 결과가 같다(M4)
  expect(ids(search('MISRA C++').items)).toEqual(ids(search('MISRA C').items))
})
