import { expect, it } from 'vitest'
import { findNames } from './find-names'

const hits = (text: string, entries: { key: string; names: string[]; exactOnly?: boolean }[]): [string, string][] =>
  findNames(text, entries).map((h) => [h.key, h.original])

it('왼쪽부터 가장 긴 이름, 겹치지 않게', () => {
  const entries = [
    { key: 'short', names: ['커버리지'] },
    { key: 'long', names: ['구문 커버리지'] }
  ]
  expect(hits('구문 커버리지와 커버리지', entries)).toEqual([
    ['long', '구문 커버리지'],
    ['short', '커버리지']
  ])
})

it('한글 이름은 한글 구간의 맨 앞에서만(뒤에 조사는 괜찮음), 영문은 앞뒤가 영문·숫자가 아닐 때만', () => {
  const entries = [
    { key: 'sa', names: ['정적분석'] },
    { key: 'sil', names: ['SIL'] }
  ]
  expect(hits('정적분석은 중요', entries)).toEqual([['sa', '정적분석']])
  expect(hits('비정적분석', entries)).toEqual([])
  expect(hits('SILVER 등급과 SIL 2', entries)).toEqual([['sil', 'SIL']])
  expect(hits('MC/DC가', [{ key: 'm', names: ['MC/DC'] }])).toEqual([['m', 'MC/DC']])
})

it('대소문자·전각은 무시하고 원문 표기를 돌려준다, exactOnly는 뒤에 글자가 붙으면 안 찾는다', () => {
  expect(hits('ｍｃｄｃ와 mcdc', [{ key: 'm', names: ['MCDC'] }])).toEqual([
    ['m', 'ｍｃｄｃ'],
    ['m', 'mcdc']
  ])
  expect(hits('가상차는 가상', [{ key: 'g', names: ['가상'], exactOnly: true }])).toEqual([['g', '가상']])
})

it('caseSensitive면 대소문자는 구분하고 전각·반각은 여전히 무시한다', () => {
  const can = [{ key: 'can', names: ['CAN'], caseSensitive: true }]
  expect(hits('CAN 통신은 we can 하고 Can도', can)).toEqual([['can', 'CAN']])
  expect(hits('ＣＡＮ 버스', can)).toEqual([['can', 'ＣＡＮ']])
  // 구분하는 이름과 구분하지 않는 이름이 섞여도 가장 긴 것부터
  const mixed = [
    { key: 'mil', names: ['MIL'], caseSensitive: true },
    { key: 'std', names: ['STD'], caseSensitive: true },
    { key: 'doc', names: ['MIL-STD-498'], caseSensitive: true },
    { key: 'loop', names: ['Model-in-the-Loop'] }
  ]
  expect(hits('MIL-STD-498 산출물, model-in-the-loop, mil-std', mixed)).toEqual([
    ['doc', 'MIL-STD-498'],
    ['loop', 'model-in-the-loop']
  ])
})
