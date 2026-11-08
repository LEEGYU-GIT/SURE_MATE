import { expect, it } from 'vitest'
import { fillTemplate } from './fill'
import type { FillContext } from './types'

const ctx = (over: Partial<FillContext> = {}): FillContext => ({
  input: '본문',
  clipboard: '클립',
  now: new Date(2026, 10, 8, 14, 5),
  terms: () => [],
  reference: () => null,
  ...over
})

it('선택 글·날짜·시간을 채운다', () => {
  expect(fillTemplate('날짜 {{date}} {{time}}\n{{selection}}', ctx()).text).toBe('날짜 2026-11-08 14:05\n본문')
})

it('넣은 글 안의 자리표시자는 다시 채우지 않는다', () => {
  expect(fillTemplate('{{selection}}', ctx({ input: '{{clipboard}}' })).text).toBe('{{clipboard}}')
})

it('모르는 자리표시자는 두고 경고한다', () => {
  const r = fillTemplate('{{selection}} {{foo}}', ctx())
  expect(r.text).toBe('본문 {{foo}}')
  expect(r.warnings).toContain('알 수 없는 자리표시자: {{foo}}')
})

it('{{terms}}에 넣을 용어가 없으면 그 줄을 뺀다', () => {
  expect(fillTemplate('가\n{{terms}}\n나 {{selection}}', ctx()).text).toBe('가\n나 본문')
})

it('용어가 있으면 머리말과 목록으로 채운다', () => {
  const r = fillTemplate('{{terms}}', ctx({ terms: () => [{ term: 'MC/DC', definition: '변경 조건/결정 커버리지' }] }))
  expect(r.text).toBe('다음은 우리 회사에서 쓰는 용어 뜻입니다.\n- MC/DC: 변경 조건/결정 커버리지')
})

it('기준 예시가 없으면 그 줄을 빼고 경고한다', () => {
  const r = fillTemplate('{{reference:회의록}}\n{{selection}}', ctx())
  expect(r.text).toBe('본문')
  expect(r.warnings[0]).toContain('회의록')
})

it('기준 예시가 있으면 넣는다', () => {
  const r = fillTemplate('{{reference:회의록}}\n{{selection}}', ctx({ reference: (kind) => (kind === '회의록' ? '예시 회의록' : null) }))
  expect(r.text).toBe('예시 회의록\n본문')
  expect(r.warnings).toEqual([])
})

it('중괄호 안 공백을 허용하고, {{selection}}이 없으면 경고한다', () => {
  expect(fillTemplate('{{ selection }}', ctx()).text).toBe('본문')
  expect(fillTemplate('고정 문장', ctx()).warnings).toContain('이 템플릿에는 {{selection}} 자리가 없어 입력한 글이 들어가지 않아요')
})

it('템플릿 줄바꿈 CRLF를 LF로 맞춘다', () => {
  expect(fillTemplate('a\r\n{{selection}}', ctx()).text).toBe('a\nb'.replace('b', '본문'))
})

it('클립보드 자리를 채운다', () => {
  expect(fillTemplate('{{selection}} / {{clipboard}}', ctx()).text).toBe('본문 / 클립')
})
