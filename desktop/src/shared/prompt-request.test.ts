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

it('가명 처리 모드와 이번 실행에서 끈 항목을 검사한다', () => {
  expect(parsePromptRequest({ source: 'selection', target: 'claude', masking: 'remove', disabledKeys: ['client:g'] })).toEqual({
    source: 'selection',
    target: 'claude',
    masking: 'remove',
    disabledKeys: ['client:g']
  })
  expect(parsePromptRequest({ source: 'selection', target: 'claude', masking: 'maybe' })).toBeNull()
  expect(parsePromptRequest({ source: 'selection', target: 'claude', disabledKeys: [1] })).toBeNull()
  expect(parsePromptRequest({ source: 'selection', target: 'claude', disabledKeys: Array(201).fill('k') })).toBeNull()
})

it('input 출처가 아니면 입력 글은 버린다', () => {
  expect(parsePromptRequest({ source: 'clipboard', input: '무시', target: 'claude' })).toEqual({ source: 'clipboard', target: 'claude' })
})
