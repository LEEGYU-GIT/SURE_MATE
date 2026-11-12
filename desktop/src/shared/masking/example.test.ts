import { expect, it } from 'vitest'
import { MASKING_EXAMPLE_TEXT, maskingExample, splitHighlights } from './example'

it('바꾸고 되돌리기: 가상자동차·IP를 CLIENT_A·IP_1로 보내고, AI가 쓴 글을 되돌리면 원래 이름이 돌아온다', () => {
  const v = maskingExample('restore')
  expect(v.original).toBe(MASKING_EXAMPLE_TEXT)
  expect(v.sent).toBe('CLIENT_A 브레이크 시험 결과를 IP_1 서버에 올렸어요')
  expect(v.answer).toBe('CLIENT_A 브레이크 시험은 모두 통과했고, 결과 파일은 IP_1 서버에 있어요')
  expect(v.restored).toBe('가상자동차 브레이크 시험은 모두 통과했고, 결과 파일은 10.0.3.15 서버에 있어요')
  expect(v.swaps).toEqual([
    { from: '가상자동차', to: 'CLIENT_A' },
    { from: '10.0.3.15', to: 'IP_1' }
  ])
})

it('바꾸기만: 읽기 쉬운 표기로 보내고 되돌린 글은 없다', () => {
  const v = maskingExample('remove')
  expect(v.sent).toBe('고객사A 브레이크 시험 결과를 [IP 주소] 서버에 올렸어요')
  expect(v.answer).toBe('고객사A 브레이크 시험은 모두 통과했고, 결과 파일은 [IP 주소] 서버에 있어요')
  expect(v.restored).toBeNull()
})

it('끔: 원문 그대로 가고 바꾼 것이 없다', () => {
  const v = maskingExample('off')
  expect(v.sent).toBe(v.original)
  expect(v.swaps).toEqual([])
  expect(v.restored).toBeNull()
})

it('강조 나누기: 긴 낱말부터, 겹치지 않게, 나머지는 그대로 잇는다', () => {
  expect(splitHighlights('CLIENT_A와 IP_1, IP_10', ['IP_1', 'CLIENT_A', 'IP_10'])).toEqual([
    { text: 'CLIENT_A', hit: true },
    { text: '와 ', hit: false },
    { text: 'IP_1', hit: true },
    { text: ', ', hit: false },
    { text: 'IP_10', hit: true }
  ])
  expect(splitHighlights('그대로', [])).toEqual([{ text: '그대로', hit: false }])
  expect(splitHighlights('', ['a'])).toEqual([])
})
