import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { parseGlossaryPack } from './pack'
import type { GlossaryEntry } from './types'
import { buildGlossaryIndex, lookupWiki, toCardEntry, WIKI_LOOKUP_MAX_CHARS, WIKI_SHORT_MAX } from './wiki-lookup'

const pack = JSON.parse(readFileSync(fileURLToPath(new URL('../../../resources/glossary.json', import.meta.url)), 'utf8'))
const entries = parseGlossaryPack(pack, 'builtin').entries
const index = buildGlossaryIndex(entries)
const look = (text: string): ReturnType<typeof lookupWiki> => lookupWiki(text, entries, index)
const bestId = (text: string): string | null => {
  const r = look(text)
  return r.kind === 'best' ? r.best.id : null
}

it('짧은 글: 약어·초성·오타·조사 붙은 이름으로 가장 맞는 용어 하나와 후보 2개 이하(설계 §9)', () => {
  const r = look('mcdc')
  expect(r.kind === 'best' && r.best.id).toBe('mcdc')
  expect(r.kind === 'best' && r.others.length).toBeLessThanOrEqual(2)
  expect(bestId('ㅈㅈㅂㅅ')).toBe('static-analysis')
  expect(bestId('정적분삭')).toBe('static-analysis')
  expect(bestId('MC/DC가')).toBe('mcdc')
})

it('같은 이름의 두 뜻(SIL)은 하나가 가장 맞는 용어, 다른 하나가 후보', () => {
  const r = look('SIL')
  expect(r.kind).toBe('best')
  if (r.kind !== 'best') return
  const ids = [r.best.id, ...r.others.map((e) => e.id)]
  expect(ids).toEqual(expect.arrayContaining(['sil-software', 'sil-safety']))
  expect(['sil-software', 'sil-safety']).toContain(r.best.id)
})

it('20자까지는 짧은 글, 넘으면 글 안의 용어를 처음 나온 순서로 모두', () => {
  expect(WIKI_SHORT_MAX).toBe(20)
  expect(look(`MC/DC${'가'.repeat(15)}`).kind).toBe('best')
  const long = look('정적분석 결과에서 MC/DC 커버리지가 부족')
  expect(long.kind).toBe('found')
  expect(long.kind === 'found' && long.entries.map((e) => e.id)).toEqual(['static-analysis', 'mcdc', 'code-coverage'])
})

it('(Review Focus 4) 20만 자를 골라도 앞 2만 자에서만 찾고, 용어가 없는 긴 글·공백만 있는 글은 없음', () => {
  expect(WIKI_LOOKUP_MAX_CHARS).toBe(20000)
  const started = performance.now()
  expect(look(`${'가'.repeat(20000)} MC/DC ${'나'.repeat(180000)}`).kind).toBe('none')
  expect(performance.now() - started).toBeLessThan(1000)
  expect(look('오늘 회의에서 다음 주 일정과 담당자를 정했고 자료는 공유 폴더에 올렸다').kind).toBe('none')
  expect(look('  \n  ').kind).toBe('none')
})

it('카드에는 링크·태그·작성자를 빼고, 사용 예는 있을 때만 싣는다', () => {
  const e: GlossaryEntry = {
    id: 'x',
    term: '용어',
    aliases: ['별칭'],
    definition: '설명',
    links: [{ title: '문서', url: 'https://example.com' }],
    tags: ['태그'],
    author: '가상 작성자',
    source: 'user',
    updatedAt: '2026-11-09T00:00:00.000Z',
    version: 1
  }
  expect(toCardEntry(e)).toEqual({ id: 'x', term: '용어', aliases: ['별칭'], definition: '설명', source: 'user' })
  expect(toCardEntry({ ...e, example: '사용 예' }).example).toBe('사용 예')
})
