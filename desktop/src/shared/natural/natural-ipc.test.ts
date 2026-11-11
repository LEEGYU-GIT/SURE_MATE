import { expect, it } from 'vitest'
import { parsePick } from './natural-ipc'

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
