import { expect, it } from 'vitest'
import builtinGlossary from '../../../resources/glossary.json'
import { findGlossaryTerms, termsFor } from './find-terms'
import { parseGlossaryPack } from './pack'
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

it('영문 대문자·숫자로만 된 이름은 대소문자를 구분하고, 다른 이름은 구분하지 않는다', () => {
  const list = [e('can', 'CAN'), e('iso', 'ISO 26262'), e('cov', 'Code Coverage'), e('ast', '정적분석', ['SA'])]
  const found = (text: string): string[] => findGlossaryTerms(text, list).map((x) => x.id)
  expect(found('CAN 메시지, ＣＡＮ 버스, ISO 26262')).toEqual(['can', 'iso'])
  expect(found('we can see iso 26262 and Sa')).toEqual([])
  expect(found('code coverage, CODE COVERAGE')).toEqual(['cov'])
})

// ── 기본 용어 팩(설치 파일에 들어가는 resources/glossary.json)으로 잰 경우들 ──────────────

const pack = parseGlossaryPack(builtinGlossary, 'builtin').entries
const attached = (text: string): string[] => findGlossaryTerms(text, pack).map((x) => x.id)

it('기본 팩: 소문자로 쓴 can·std::·str(에는 CAN·STD·STR을 붙이지 않는다', () => {
  expect(attached('We can run it tonight')).toEqual([])
  expect(attached('std::vector<int> v; auto s = std::to_string(v.size());')).toEqual([])
  expect(attached('print(str(user_id))')).toEqual([])
})

it('기본 팩: MIL-STD-498 산출물에는 MIL-STD-498만 붙는다(MIL·STD를 따로 붙이지 않는다)', () => {
  expect(attached('MIL-STD-498 산출물')).toEqual(['mil-std-498'])
  expect(attached('MIL STD 498 산출물')).toEqual(['mil-std-498'])
})

it('기본 팩: 흔한 말인 기대 결과·Error·확인에는 용어를 붙이지 않는다', () => {
  expect(attached('기대 결과와 다르면')).toEqual([])
  expect(attached('Error: null pointer')).toEqual([])
  expect(attached('확인해 주세요')).toEqual([])
  // 결함·검증은 팀 용어라 그대로 붙는다
  expect(attached('회의 결과를 확인해 주세요. 결함 수정 여부를 검증할 계획입니다')).toEqual(['defect', 'verification'])
})

it('기본 팩: 대문자로 쓴 약어는 그대로 찾는다(MC/DC가 → MC/DC), SILVER에는 SIL이 붙지 않는다', () => {
  expect(attached('MC/DC가 뭐야')).toEqual(['mcdc'])
  expect(attached('SILVER 등급')).toEqual([])
})

it('받아들인 한계(결정 기록): 대문자로 쓴 다른 뜻의 약어에는 팩의 뜻이 붙는다 — # PIL(파이썬 이미지 라이브러리)에도 PIL', () => {
  expect(attached('str(user_id) # PIL')).toEqual(['pil'])
})

it('{{terms}}에 넣을 "용어: 설명"은 처음 나온 순서로 20개까지(프롬프트가 지나치게 길어지지 않게)', () => {
  const many = Array.from({ length: 25 }, (_, i) => e(`t${i}`, `용어${String.fromCharCode(0xac00 + i)}`))
  const text = many.map((x) => x.term).join(' ')
  const defs = termsFor(text, many)
  expect(defs).toHaveLength(20)
  expect(defs[0]).toEqual({ term: many[0].term, definition: many[0].definition })
})
