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

it('shownView: 팔레트를 보일 때 시작 검색어(바의 용어 사전 단추는 ?), 다른 화면이면 빈 검색어', () => {
  expect(shownView({ mode: 'search', query: '?' })).toEqual({ query: '?', wikiId: null })
  expect(shownView({ mode: 'search' })).toEqual({ query: '', wikiId: null })
  expect(
    shownView({
      mode: 'confirm',
      draft: {
        templateId: 'meeting-notes',
        name: '회의록 정리',
        selection: { length: 0, skipped: 'nothing-selected' },
        clipboardLength: 0,
        defaultSource: 'input',
        targets: [],
        target: 'copy',
        masking: 'restore',
        maskingTip: false
      }
    })
  ).toEqual({ query: '', wikiId: null })
  expect(shownView({ mode: 'dev-output', title: '창 목록', text: '' })).toEqual({ query: '', wikiId: null })
})

it("shownView: 위키 카드의 '팔레트에서 열기'는 빈 검색어로 그 용어 상세를 연다", () => {
  expect(shownView({ mode: 'wiki', id: 'mcdc' })).toEqual({ query: '', wikiId: 'mcdc' })
})
