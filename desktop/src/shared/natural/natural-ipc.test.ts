import { expect, it } from 'vitest'
import { parsePhraseKey, parsePick, PHRASE_KEY_MAX } from './natural-ipc'

it('정상 값은 그대로 통과한다', () => {
  expect(parsePick({ id: 'cmd.unmask', remember: true, query: '가명 되돌려줘' })).toEqual({ id: 'cmd.unmask', remember: true, query: '가명 되돌려줘' })
})

it('query가 없거나 문자열이 아니면 빈 문자열(학습하지 않는다), 길면 200자로 자른다', () => {
  expect(parsePick({ id: 'a', remember: true })).toEqual({ id: 'a', remember: true, query: '' })
  expect(parsePick({ id: 'a', remember: false, query: 5 })).toEqual({ id: 'a', remember: false, query: '' })
  expect(parsePick({ id: 'a', remember: false, query: 'x'.repeat(300) })?.query).toHaveLength(200)
})

it('id가 비었거나 201자, remember가 boolean이 아니거나 객체가 아니면 null', () => {
  expect(parsePick({ id: 'a'.repeat(201), remember: false })).toBeNull()
  expect(parsePick({ id: 'a'.repeat(200), remember: false })).not.toBeNull()
  expect(parsePick({ id: '', remember: false })).toBeNull()
  expect(parsePick({ id: 'a', remember: 'yes' })).toBeNull()
  expect(parsePick(null)).toBeNull()
  expect(parsePick('a')).toBeNull()
  expect(parsePick([])).toBeNull()
})

it('설정 창이 지울 기억한 문장 키: 1~200자 문자열만(키는 팔레트가 보낸 200자 안의 문장에서 만든다)', () => {
  expect(PHRASE_KEY_MAX).toBe(200)
  expect(parsePhraseKey('출근세팅해줘')).toBe('출근세팅해줘')
  expect(parsePhraseKey('가'.repeat(200))).toBe('가'.repeat(200))
  for (const bad of ['', '가'.repeat(201), 7, null, undefined, {}, ['출근세팅해줘']]) expect(parsePhraseKey(bad), String(bad)).toBeNull()
})
