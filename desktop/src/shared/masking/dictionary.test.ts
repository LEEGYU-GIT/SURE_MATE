import { expect, it } from 'vitest'
import { findTerms, parseMaskDictionary, type MaskTerm } from './dictionary'

const terms: MaskTerm[] = [
  { id: 'gasang', category: 'client', canonical: '가상자동차', aliases: ['가상차', 'GVM'] },
  { id: 'xy', category: 'client', canonical: 'XY방산', aliases: [] },
  { id: 'gp', category: 'system', canonical: 'GP', aliases: [] }
]
const found = (text: string, t: MaskTerm[] = terms): [string, string][] => findTerms(text, t).map((d) => [d.original, d.key])

it('한글 이름은 뒤에 조사가 붙어도 찾는다', () => {
  expect(found('가상자동차에서 받은')).toEqual([['가상자동차', 'client:gasang']])
  expect(found('XY방산는 확인')).toEqual([['XY방산', 'client:xy']])
})

it('별칭도 같은 키로 찾는다', () => {
  expect(found('가상차를 만나')).toEqual([['가상차', 'client:gasang']])
  expect(found('GVM 담당')).toEqual([['GVM', 'client:gasang']])
})

it('한글 구간 중간에서는 찾지 않는다', () => {
  expect(found('주가상자동차')).toEqual([])
})

it('영문은 앞뒤가 영문·숫자가 아닐 때만, 대소문자와 전각은 무시한다', () => {
  expect(found('GPL 라이선스')).toEqual([])
  expect(found('XGP')).toEqual([])
  expect(found('gp 서버')).toEqual([['gp', 'system:gp']])
  expect(found('ＧＰ 서버')).toEqual([['ＧＰ', 'system:gp']])
})

it('가장 긴 이름을 먼저 찾는다', () => {
  const t: MaskTerm[] = [{ id: 'short', category: 'client', canonical: '가상', aliases: [] }, ...terms]
  expect(found('가상자동차에서', t)).toEqual([['가상자동차', 'client:gasang']])
})

it('exactOnly면 뒤에 글자가 붙지 않을 때만', () => {
  const t: MaskTerm[] = [{ id: 'hong', category: 'person', canonical: '홍길동', aliases: [], exactOnly: true }]
  expect(found('홍길동에서', t)).toEqual([])
  expect(found('홍길동 님', t)).toEqual([['홍길동', 'person:hong']])
})

it('위치는 원문 기준', () => {
  const text = '오늘 가상자동차와 XY방산'
  expect(findTerms(text, terms).map((d) => text.slice(d.start, d.end))).toEqual(['가상자동차', 'XY방산'])
})

it('사전 파일 검사: 틀린 항목은 건너뛰고 이유를 남긴다', () => {
  const r = parseMaskDictionary({
    format: 'sure-mate-masking',
    version: 1,
    terms: [
      terms[0],
      { id: 'bad', category: 'nope', canonical: 'x', aliases: [] },
      { id: 'empty', category: 'client', canonical: '', aliases: [] },
      { ...terms[0] },
      'x'
    ]
  })
  expect(r.terms.map((t) => t.id)).toEqual(['gasang'])
  expect(r.errors).toHaveLength(4)
  expect(parseMaskDictionary({ format: 'other' }).errors[0]).toContain('형식')
})
