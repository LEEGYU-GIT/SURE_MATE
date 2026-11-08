import { expect, it } from 'vitest'
import type { GlossaryEntry } from '../../../shared/glossary/types'
import { sourceLabel, wikiKeyToAction } from './wiki-state'

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

it('출처 이름', () => {
  expect(sourceLabel('builtin')).toBe('기본 용어')
  expect(sourceLabel('user')).toBe('내 용어')
  expect(sourceLabel('imported')).toBe('가져온 용어')
})
