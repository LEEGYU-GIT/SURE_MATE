import { expect, it } from 'vitest'
import type { GlossaryEntry } from '../../../shared/glossary/types'
import { entryToForm } from './wiki-form'
import { NO_WIKI_VIEW, sourceLabel, wikiKeyToAction, wikiViewReducer, type WikiView } from './wiki-state'

const entry = (links: number): Pick<GlossaryEntry, 'links'> => ({ links: Array.from({ length: links }, (_, i) => ({ title: `문서 ${i}`, url: `https://example.com/${i}` })) })
const key = (code: string, o: Partial<{ ctrlKey: boolean; isComposing: boolean; repeat: boolean; key: string }> = {}) => ({
  code,
  key: code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
  repeat: false,
  ...o
})

it('상세 화면: Enter 설명 복사, Esc 목록으로, E 수정', () => {
  expect(wikiKeyToAction(key('Enter'), entry(0))).toEqual({ type: 'copy' })
  expect(wikiKeyToAction(key('NumpadEnter'), entry(0))).toEqual({ type: 'copy' })
  expect(wikiKeyToAction(key('Escape'), entry(0))).toEqual({ type: 'back' })
  expect(wikiKeyToAction(key('KeyE'), entry(0))).toEqual({ type: 'edit' })
})

it('숫자 1~5는 그 번호의 링크가 있을 때만', () => {
  expect(wikiKeyToAction(key('Digit1'), entry(2))).toEqual({ type: 'link', index: 0 })
  expect(wikiKeyToAction(key('Numpad2'), entry(2))).toEqual({ type: 'link', index: 1 })
  expect(wikiKeyToAction(key('Digit3'), entry(2))).toBeNull()
})

it('한글 조합 중이거나 자동 반복된 Enter는 무시한다', () => {
  expect(wikiKeyToAction(key('Enter', { isComposing: true }), entry(0))).toBeNull()
  expect(wikiKeyToAction(key('Enter', { repeat: true }), entry(0))).toBeNull()
  expect(wikiKeyToAction(key('KeyE', { isComposing: true }), entry(0))).toBeNull()
})

const term: GlossaryEntry = {
  id: 'mcdc',
  term: 'MC/DC',
  aliases: ['MCDC'],
  definition: '조건마다 결정을 독립적으로 바꾸는지 보는 커버리지',
  links: [],
  tags: [],
  source: 'builtin',
  updatedAt: '2026-11-09T00:00:00.000Z',
  version: 1
}

it('용어 고치기: 고치던 글은 팔레트가 숨었다 다시 보여도 아래 상세와 함께 남고, Esc로 취소해야 사라진다', () => {
  let v: WikiView = wikiViewReducer(NO_WIKI_VIEW, { type: 'open', entry: term })
  v = wikiViewReducer(v, { type: 'edit' })
  expect(v).toEqual({ detail: term, edit: { entry: term, form: entryToForm(term) } })
  const typed = { ...entryToForm(term), links: '설명 문서 | https://example.com/mcdc' }
  v = wikiViewReducer(v, { type: 'form', form: typed })
  // 브라우저에서 링크를 복사하고 돌아온다(팔레트는 바깥을 누르면 숨고, 단축키로 다시 보인다)
  v = wikiViewReducer(v, { type: 'shown' })
  expect(v).toEqual({ detail: term, edit: { entry: term, form: typed } })
  // Esc: 고치던 글을 버리고 상세로 돌아간다
  v = wikiViewReducer(v, { type: 'cancel-edit' })
  expect(v).toEqual({ detail: term, edit: null })
  // 고치는 중이 아니면 다시 보일 때 목록으로(설계 문서 §6: 닫으면 검색어·결과 초기화)
  expect(wikiViewReducer(v, { type: 'shown' })).toEqual(NO_WIKI_VIEW)
})

it('새 용어: 검색어를 용어로 미리 채우고, 다시 보여도 적던 글이 남으며, 저장하면 저장한 용어의 상세로', () => {
  let v = wikiViewReducer(NO_WIKI_VIEW, { type: 'add', term: '정적분석' })
  expect(v).toEqual({ detail: null, edit: { form: entryToForm(undefined, '정적분석') } })
  const typed = { ...entryToForm(undefined, '정적분석'), definition: '실행하지 않고 코드를 분석' }
  v = wikiViewReducer(wikiViewReducer(v, { type: 'form', form: typed }), { type: 'shown' })
  expect(v).toEqual({ detail: null, edit: { form: typed } })
  const saved: GlossaryEntry = { ...term, id: 'u1', term: '정적분석', definition: '실행하지 않고 코드를 분석', source: 'user' }
  expect(wikiViewReducer(v, { type: 'saved', entry: saved })).toEqual({ detail: saved, edit: null })
})

it('상세에서 Esc는 목록으로, 상세 없이 고치기와 편집 화면 없이 온 글 변경은 무시한다', () => {
  expect(wikiViewReducer({ detail: term, edit: null }, { type: 'back' })).toEqual(NO_WIKI_VIEW)
  expect(wikiViewReducer(NO_WIKI_VIEW, { type: 'edit' })).toBe(NO_WIKI_VIEW)
  expect(wikiViewReducer(NO_WIKI_VIEW, { type: 'form', form: entryToForm(term) })).toBe(NO_WIKI_VIEW)
})

it('출처 이름', () => {
  expect(sourceLabel('builtin')).toBe('기본 용어')
  expect(sourceLabel('user')).toBe('내 용어')
  expect(sourceLabel('imported')).toBe('가져온 용어')
})
