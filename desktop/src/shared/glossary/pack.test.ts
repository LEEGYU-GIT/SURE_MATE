import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { GLOSSARY_FORMAT, normalizedKey, parseGlossaryPack } from './pack'

const pack = (entries: unknown[]): unknown => ({ format: GLOSSARY_FORMAT, version: 1, entries })
const entry = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'mcdc',
  term: 'MC/DC',
  aliases: ['MCDC'],
  definition: '조건이 결정 결과를 독립적으로 바꾸는지 보는 커버리지',
  links: [],
  tags: ['커버리지'],
  updatedAt: '2026-11-09T00:00:00.000Z',
  version: 1,
  ...over
})

it('올바른 항목을 읽고 출처를 붙인다', () => {
  const r = parseGlossaryPack(pack([entry()]), 'builtin')
  expect(r.errors).toEqual([])
  expect(r.entries[0]).toMatchObject({ id: 'mcdc', term: 'MC/DC', aliases: ['MCDC'], source: 'builtin', version: 1 })
})

it('제한(용어 60자, 설명 1,000자, 사용 예 500자)을 넘거나 빈 항목은 건너뛰고 까닭을 남긴다', () => {
  const r = parseGlossaryPack(
    pack([entry({ id: 'a', term: '가'.repeat(61) }), entry({ id: 'b', definition: '나'.repeat(1001) }), entry({ id: 'c', example: '다'.repeat(501) }), entry({ id: 'd', term: ' ' }), entry({ id: 'ok' })]),
    'user'
  )
  expect(r.entries.map((e) => e.id)).toEqual(['ok'])
  expect(r.errors).toHaveLength(4)
})

it('링크는 http/https만 5개까지, 태그는 5개까지 남긴다', () => {
  const links = [
    { title: '나쁜 링크', url: 'javascript:alert(1)' },
    { title: '파일', url: 'file:///C:/x' },
    ...Array.from({ length: 6 }, (_, i) => ({ title: `문서 ${i}`, url: `https://example.com/${i}` }))
  ]
  const r = parseGlossaryPack(pack([entry({ links, tags: ['1', '2', '3', '4', '5', '6'] })]), 'imported')
  expect(r.entries[0].links.map((l) => l.url)).toEqual([0, 1, 2, 3, 4].map((i) => `https://example.com/${i}`))
  expect(r.entries[0].tags).toHaveLength(5)
  expect(r.entries[0].source).toBe('imported')
  expect(r.errors.length).toBeGreaterThan(0)
})

it('통째로 건너뛴 항목과, 읽었지만 링크·태그·별칭 일부를 뺀 항목을 따로 센다', () => {
  const r = parseGlossaryPack(
    pack([entry({ id: 'bad', definition: '' }), entry({ id: 'link', links: [{ title: '나쁜 링크', url: 'javascript:alert(1)' }] }), entry({ id: 'ok' })]),
    'imported'
  )
  expect(r.entries.map((e) => e.id)).toEqual(['link', 'ok'])
  expect(r.entries[0].links).toEqual([])
  expect(r.skipped).toBe(1)
  expect(r.trimmed).toBe(1)
  expect(r.errors).toHaveLength(2)
})

it('형식이 다르면 빈 목록과 오류, 같은 id가 두 번이면 뒤의 것을 건너뛴다', () => {
  expect(parseGlossaryPack({ format: 'other', entries: [] }, 'user')).toEqual({ entries: [], errors: [expect.stringContaining('sure-mate-glossary')], skipped: 0, trimmed: 0 })
  const r = parseGlossaryPack(pack([entry(), entry({ term: '다른 뜻' })]), 'user')
  expect(r.entries).toHaveLength(1)
  expect(r.errors).toHaveLength(1)
})

it('사용자 파일의 항목은 imported 표시를 지키고, 나머지는 user', () => {
  const r = parseGlossaryPack(pack([entry({ id: 'x', source: 'imported' }), entry({ id: 'y', source: 'builtin' })]), 'user')
  expect(r.entries.map((e) => e.source)).toEqual(['imported', 'user'])
})

it('정규화 키는 검색 compact와 같다(대소문자·기호·공백 무시, C++은 원형)', () => {
  expect(normalizedKey('MC/DC')).toBe(normalizedKey('mcdc'))
  expect(normalizedKey('ISO 26262')).toBe('iso26262')
  expect(normalizedKey('C++')).not.toBe(normalizedKey('C'))
})

it('기본 용어 팩: 오류 없이 90개 이상, id가 겹치지 않고, 이름은 공개 용어만(가상 회사 이름 없음)', () => {
  const raw = JSON.parse(readFileSync(fileURLToPath(new URL('../../../resources/glossary.json', import.meta.url)), 'utf8'))
  const r = parseGlossaryPack(raw, 'builtin')
  expect(r.errors).toEqual([])
  expect(r.entries.length).toBeGreaterThanOrEqual(90)
  expect(new Set(r.entries.map((e) => e.id)).size).toBe(r.entries.length)
  expect(r.entries.some((e) => e.term === 'MC/DC')).toBe(true)
  // 같은 용어가 여러 뜻일 수 있다(설계 §9: SIL)
  expect(r.entries.filter((e) => e.term === 'SIL')).toHaveLength(2)
})
