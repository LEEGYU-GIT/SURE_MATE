import { expect, it } from 'vitest'
import { PALETTE_GROUPS, parseQuery, shownView } from './palette-query'

it('접두어로 구역을 고른다', () => {
  expect(parseQuery('/회의')).toEqual({ scope: 'prompt', text: '회의' })
  expect(parseQuery('>창')).toEqual({ scope: 'command', text: '창' })
  expect(parseQuery('?mcdc')).toEqual({ scope: 'wiki', text: 'mcdc' })
  expect(parseQuery('!이슈')).toEqual({ scope: 'snippet', text: '이슈' })
  expect(parseQuery('@qa')).toEqual({ scope: 'workspace', text: 'qa' })
})

it('전각 기호도 같은 접두어다', () => {
  expect(parseQuery('？mcdc')).toEqual({ scope: 'wiki', text: 'mcdc' })
  expect(parseQuery('／회의')).toEqual({ scope: 'prompt', text: '회의' })
  expect(parseQuery('！이슈')).toEqual({ scope: 'snippet', text: '이슈' })
})

it('접두어가 없으면 전체, 앞뒤 공백은 뗀다', () => {
  expect(parseQuery('  회의 ')).toEqual({ scope: null, text: '회의' })
  expect(parseQuery('/ 회의')).toEqual({ scope: 'prompt', text: '회의' })
  expect(parseQuery('')).toEqual({ scope: null, text: '' })
})

it('구역 순서는 프롬프트·명령·워크스페이스·상용구·위키', () => {
  expect(PALETTE_GROUPS.map((g) => g.id)).toEqual(['prompt', 'command', 'workspace', 'snippet', 'wiki'])
})

it('팔레트를 보일 때 검색어를 미리 채울 수 있다(바의 용어 사전 단추는 "?")', () => {
  expect(shownView({ mode: 'search', query: '?' })).toEqual({ query: '?', wikiId: null })
  expect(shownView({ mode: 'search' })).toEqual({ query: '', wikiId: null })
  expect(shownView({ mode: 'dev-output', title: '제목', text: '내용' })).toEqual({ query: '', wikiId: null })
})

it('위키 카드의 "팔레트에서 열기"는 그 용어 상세를 바로 연다', () => {
  expect(shownView({ mode: 'wiki', id: 'mcdc' })).toEqual({ query: '', wikiId: 'mcdc' })
})
