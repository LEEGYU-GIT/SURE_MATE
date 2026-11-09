import { expect, it } from 'vitest'
import builtinGlossary from '../../../resources/glossary.json'
import builtinPrompts from '../../../resources/prompts.json'
import { buildPaletteIndex, filterItems } from '../../renderer/src/palette/filter-items'
import { parseGlossaryPack } from '../../shared/glossary/pack'
import { parseTemplatePack } from '../../shared/template/pack'
import { buildPaletteItems } from './palette-items'

// 설치 파일에 들어가는 실제 기본 자료(프롬프트·상용구 팩, 용어 팩)로 팔레트 검색 전체를 돌린다(설계 문서 §9 완료 기준)
const templates = parseTemplatePack(builtinPrompts, 'builtin').templates
const glossary = parseGlossaryPack(builtinGlossary, 'builtin').entries
const items = buildPaletteItems(templates, [], { maskingMode: 'restore', glossary })
const index = buildPaletteIndex(items)
const top = (query: string): string | undefined => filterItems(items, query, index)[0]?.id

it('기본 자료가 모두 읽힌다(시험 전제)', () => {
  expect(templates.length).toBeGreaterThan(0)
  expect(glossary.length).toBeGreaterThan(100)
})

it('설계 §9 완료 기준: ㅈㅈㅂㅅ·정적분삭·wjdwjrqnstjr는 정적분석, mcdc는 MC/DC가 맨 위', () => {
  for (const q of ['ㅈㅈㅂㅅ', '정적분삭', 'wjdwjrqnstjr']) expect(top(q), q).toBe('wiki:static-analysis')
  expect(top('mcdc')).toBe('wiki:mcdc')
})

it('정적분석을 치는 중간 상태에서도 정적분석이 맨 위(태그가 같은 짧은 용어가 앞서지 않는다)', () => {
  for (const q of ['정ㅈ', '정저', '정적ㅂ', '정적부', '정적분ㅅ', '정적분서']) expect(top(q), q).toBe('wiki:static-analysis')
})

it('Windows IME가 받침 없이 친 ㅂ+ㅅ을 ㅄ 한 글자로 합쳐 보내도 초성으로 찾는다', () => {
  expect(top('ㅈㅈㅄ')).toBe('wiki:static-analysis')
})

it('위키 범위: ?커버리지는 코드 커버리지, ?ㄱㄴ ㅇㅈ는 기능 안전이 맨 위', () => {
  expect(top('?커버리지')).toBe('wiki:code-coverage')
  expect(top('?ㄱㄴ ㅇㅈ')).toBe('wiki:functional-safety')
})

it('범위 없이 한 글자만 치면 위키 용어가 목록을 덮지 않고, 회의록 정리를 치는 중인 "회"는 회의록 정리가 맨 위', () => {
  for (const q of ['ㅈ', 'ㅅ', 's', 'ㅎ', '회']) {
    const list = filterItems(items, q, index)
    expect(list.some((i) => i.group === 'wiki'), q).toBe(false)
  }
  expect(top('회')).toBe('prompt:meeting-notes')
  // ?로 위키를 고르면 한 글자도 위키를 보여 주되 50개까지
  const wiki = filterItems(items, '?ㅈ', index)
  expect(wiki.length).toBeGreaterThan(0)
  expect(wiki.length).toBeLessThanOrEqual(50)
  expect(wiki.every((i) => i.group === 'wiki')).toBe(true)
})
