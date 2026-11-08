import { expect, it } from 'vitest'
import { findGlossaryTerms, termsFor } from './find-terms'
import type { GlossaryEntry } from './types'

const e = (id: string, term: string, aliases: string[] = []): GlossaryEntry => ({
  id,
  term,
  aliases,
  definition: `${term} 설명`,
  links: [],
  tags: [],
  source: 'builtin',
  updatedAt: '2026-11-09T00:00:00.000Z',
  version: 1
})

const glossary = [
  e('mcdc', 'MC/DC', ['MCDC']),
  e('sil-safety', 'SIL', ['Safety Integrity Level']),
  e('sil-software', 'SIL', ['SILS']),
  e('sa', '정적분석', ['Static Analysis']),
  e('iso', 'ISO 26262', ['ISO26262'])
]
const ids = (text: string): string[] => findGlossaryTerms(text, glossary).map((x) => x.id)

it('설계 §7 완료 기준: "MC/DC가"에서 MC/DC를 찾고 SILVER에는 SIL이 걸리지 않는다', () => {
  expect(ids('MC/DC가 뭐야')).toEqual(['mcdc'])
  expect(ids('SILVER 등급')).toEqual([])
})

it('같은 이름의 뜻이 여럿이면 모두 붙인다(SIL: 안전 무결성 수준 / Software-in-the-Loop)', () => {
  expect(ids('SIL 2 요구사항')).toEqual(['sil-safety', 'sil-software'])
})

it('조사가 붙은 한글 용어, 별칭, 여러 번 나온 용어는 처음 나온 순서로 한 번씩', () => {
  expect(ids('정적분석은 ISO26262의 요구이고 정적분석 결과와 MCDC, MC/DC를 본다')).toEqual(['sa', 'iso', 'mcdc'])
})

it('{{terms}}에 넣을 "용어: 설명"은 처음 나온 순서로 20개까지(프롬프트가 지나치게 길어지지 않게)', () => {
  const many = Array.from({ length: 25 }, (_, i) => e(`t${i}`, `용어${String.fromCharCode(0xac00 + i)}`))
  const text = many.map((x) => x.term).join(' ')
  const defs = termsFor(text, many)
  expect(defs).toHaveLength(20)
  expect(defs[0]).toEqual({ term: many[0].term, definition: many[0].definition })
})
