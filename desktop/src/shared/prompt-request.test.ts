import { expect, it } from 'vitest'
import { MAX_INPUT_CHARS, parsePromptRequest } from './prompt-request'

it('올바른 요청은 그대로', () => {
  expect(parsePromptRequest({ source: 'selection', target: 'claude' })).toEqual({ source: 'selection', target: 'claude' })
  expect(parsePromptRequest({ source: 'input', input: '글', target: 'copy' })).toEqual({ source: 'input', input: '글', target: 'copy' })
})

it('출처·대상이 틀리거나 입력이 너무 길면 null', () => {
  expect(parsePromptRequest(null)).toBeNull()
  expect(parsePromptRequest({ source: 'file', target: 'claude' })).toBeNull()
  expect(parsePromptRequest({ source: 'selection', target: 3 })).toBeNull()
  expect(parsePromptRequest({ source: 'input', input: 'x'.repeat(MAX_INPUT_CHARS + 1), target: 'claude' })).toBeNull()
})

it('input 출처가 아니면 입력 글은 버린다', () => {
  expect(parsePromptRequest({ source: 'clipboard', input: '무시', target: 'claude' })).toEqual({ source: 'clipboard', target: 'claude' })
})
