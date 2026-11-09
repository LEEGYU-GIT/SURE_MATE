import { describe, expect, it } from 'vitest'
import builtinGlossary from '../../../resources/glossary.json'
import { findGlossaryTerms, MAX_TERMS } from './find-terms'
import { parseGlossaryPack } from './pack'
import type { GlossaryEntry } from './types'
import { buildGlossaryIndex, lookupWiki, shortWikiQuery, toCardEntry, WIKI_LOOKUP_MAX_CHARS, WIKI_SHORT_MAX } from './wiki-lookup'

// 설치 파일에 들어가는 기본 용어 팩(resources/glossary.json)으로 잰다
const pack = parseGlossaryPack(builtinGlossary, 'builtin').entries
const index = buildGlossaryIndex(pack)
const look = (text: string): ReturnType<typeof lookupWiki> => lookupWiki(text, pack, index)
const bestOf = (text: string): { best: string; others: string[] } | null => {
  const r = look(text)
  return r.kind === 'best' ? { best: r.best.id, others: r.others.map((e) => e.id) } : null
}
const foundOf = (text: string): { ids: string[]; more: number } | null => {
  const r = look(text)
  return r.kind === 'found' ? { ids: r.entries.map((e) => e.id), more: r.more } : null
}
const codePoints = (s: string): number => Array.from(s).length

it('짧은 글 기준 20자, 긴 글은 앞 20,000자만 본다', () => {
  expect(WIKI_SHORT_MAX).toBe(20)
  expect(WIKI_LOOKUP_MAX_CHARS).toBe(20000)
})

describe('짧은 글(20자 이하): 가장 맞는 항목 1개 + 후보 2개', () => {
  it("'mcdc' → MC/DC(대소문자를 가리는 약어라 글 안 이름으로는 못 찾고 랭커가 찾는다), 후보는 2개 이하이고 본문과 겹치지 않는다", () => {
    const r = bestOf('mcdc')
    expect(r?.best).toBe('mcdc')
    expect(r?.others.length).toBeLessThanOrEqual(2)
    expect(r?.others).not.toContain('mcdc')
  })

  it("초성 'ㅈㅈㅂㅅ'·오타 '정적분삭' → 정적분석(랭커)", () => {
    expect(bestOf('ㅈㅈㅂㅅ')?.best).toBe('static-analysis')
    expect(bestOf('정적분삭')?.best).toBe('static-analysis')
  })

  it("조사가 붙은 'MC/DC가' → MC/DC(글 안의 이름을 랭커보다 먼저 본다)", () => {
    expect(bestOf('MC/DC가')?.best).toBe('mcdc')
  })

  it("같은 이름의 두 뜻 'SIL': 하나가 가장 맞는 항목이면 다른 하나는 후보에 있다(설계 §9)", () => {
    const r = bestOf('SIL')
    expect(r).not.toBeNull()
    const both = ['sil-software', 'sil-safety']
    expect(both).toContain(r?.best)
    expect(r?.others).toContain(both.find((id) => id !== r?.best))
    expect(r?.others.length).toBeLessThanOrEqual(2)
    expect(new Set(r?.others).size).toBe(r?.others.length)
  })

  it('글 안에서 찾은 나머지 이름이 먼저 후보가 되고, 남은 자리는 랭커 결과로 겹치지 않게 채운다', () => {
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
    const list = [
      e('cov', '커버리지'),
      e('mcdc', 'MC/DC', ['MCDC']),
      e('mcdc-tool', 'MCDC 도구'),
      e('mcdc-report', 'MCDC 보고서'),
      e('sil-a', 'SIL'),
      e('sil-b', 'SIL'),
      e('sils', 'SILS 시험'),
      e('asil', 'ASIL')
    ]
    const i = buildGlossaryIndex(list)
    const ids = (text: string): string[] => {
      const r = lookupWiki(text, list, i)
      return r.kind === 'best' ? [r.best.id, ...r.others.map((x) => x.id)] : []
    }
    // 같은 이름의 다른 뜻(sil-b)이 먼저, 남은 한 자리는 랭커(SILS 시험: 앞부분 일치). 랭커가 다시 낸 sil-a·sil-b는 넣지 않는다
    expect(ids('SIL')).toEqual(['sil-a', 'sil-b', 'sils'])
    // 글에 나온 두 이름: MC/DC(처음 찾은 이름) → 본문, 커버리지 → 후보. 두 낱말 글이라 랭커는 더 내지 않는다
    expect(ids('MC/DC 커버리지')).toEqual(['mcdc', 'cov'])
    // 글 안 이름이 하나뿐이면 후보 두 자리를 랭커가 채운다(본문 항목은 다시 넣지 않는다)
    expect(ids('MC/DC')).toEqual(['mcdc', 'mcdc-tool', 'mcdc-report'])
  })

  it('정확히 20자(코드 포인트)인 글은 짧은 글, 21자부터는 긴 글. 앞뒤 공백은 빼고, 이모지는 한 글자로 센다', () => {
    const twenty = 'MC/DC 커버리지 기준을 확인합니다'
    expect(codePoints(twenty)).toBe(20)
    expect(look(twenty).kind).toBe('best')
    expect(look(`  ${twenty}\n`).kind).toBe('best')
    expect(look(`${twenty}.`).kind).toBe('found')
    const emoji = '😀 MC/DC 커버리지 기준 확인해요'
    expect(emoji.length).toBe(21)
    expect(codePoints(emoji)).toBe(20)
    expect(look(emoji).kind).toBe('best')
  })

  it('맞는 것이 하나도 없으면 none, 공백뿐인 글도 none', () => {
    expect(look('zzqxw').kind).toBe('none')
    expect(look('   \n ').kind).toBe('none')
  })

  it('shortWikiQuery: 짧은 글이면 앞뒤 공백을 뺀 글, 긴 글이면 null(카드의 "‘검색어’에 맞는 용어가 없어요"에 쓴다)', () => {
    expect(shortWikiQuery('  MCDCX \n')).toBe('MCDCX')
    expect(shortWikiQuery('가'.repeat(WIKI_SHORT_MAX))).toBe('가'.repeat(WIKI_SHORT_MAX))
    expect(shortWikiQuery('가'.repeat(WIKI_SHORT_MAX + 1))).toBeNull()
  })
})

describe('긴 글(20자 초과): 글 안의 용어를 처음 나온 순서로 모두', () => {
  it('"정적분석 결과에서 MC/DC 커버리지가 부족"(24자) → 정적분석, MC/DC, 코드 커버리지', () => {
    const text = '정적분석 결과에서 MC/DC 커버리지가 부족'
    expect(codePoints(text)).toBe(24)
    expect(foundOf(text)).toEqual({ ids: ['static-analysis', 'mcdc', 'code-coverage'], more: 0 })
  })

  it('20만 자 글에서 앞 20,000자 뒤에만 있는 용어는 찾지 않는다(Review Focus 4)', () => {
    const text = `정적분석 ${'. '.repeat(100000)}MC/DC 커버리지`
    expect(text.length).toBeGreaterThan(200000)
    expect(foundOf(text)).toEqual({ ids: ['static-analysis'], more: 0 })
  })

  it('20,000자 경계에서 잘린 낱말 조각은 용어로 찾지 않는다(뒤가 잘린 SILVER의 SIL)', () => {
    const text = `${'. '.repeat(9998)}.SILVER 등급`
    expect(text.indexOf('SILVER')).toBe(WIKI_LOOKUP_MAX_CHARS - 3)
    expect(look(text).kind).toBe('none')
  })

  it(`용어가 ${MAX_TERMS}개를 넘으면 처음 ${MAX_TERMS}개만 목록에, 나머지는 수(more)로`, () => {
    const names = pack.slice(0, 30).map((e) => e.term)
    const text = names.join(', ')
    const all = findGlossaryTerms(text, pack)
    expect(all.length).toBeGreaterThan(MAX_TERMS)
    const r = foundOf(text)
    expect(r?.ids).toEqual(all.slice(0, MAX_TERMS).map((e) => e.id))
    expect(r?.more).toBe(all.length - MAX_TERMS)
  })

  it('용어가 없는 긴 글 → none', () => {
    expect(look('오늘 오후에 다음 주 일정과 담당자를 정했습니다').kind).toBe('none')
  })
})

describe('색인과 카드 항목', () => {
  const user: GlossaryEntry = {
    id: 'u-1',
    term: 'XY방산 HIL 랙',
    aliases: ['시험 랙'],
    definition: '가상자동차 제어기를 실제 신호로 시험하는 장비',
    example: '랙 예약은 시험 하루 전까지',
    links: [{ title: '예약 안내', url: 'https://example.com/rack' }],
    tags: ['시험 장비'],
    author: '시험팀',
    source: 'user',
    updatedAt: '2026-11-09T00:00:00.000Z',
    version: 3
  }

  it('buildGlossaryIndex: 제목은 용어, 별칭은 별칭, 본문은 설명으로 찾는다', () => {
    const i = buildGlossaryIndex([user])
    expect(lookupWiki('XY방산 HIL 랙', [user], i).kind).toBe('best')
    expect(lookupWiki('시험 랙', [user], i).kind).toBe('best')
    // 이름이 아닌 설명 본문에만 있는 말(마지막 단계)
    expect(lookupWiki('신호로', [user], i).kind).toBe('best')
  })

  it('toCardEntry: 링크·태그·작성자·시각·판을 빼고, 사용 예는 있을 때만 넣는다', () => {
    expect(toCardEntry(user)).toEqual({
      id: 'u-1',
      term: 'XY방산 HIL 랙',
      aliases: ['시험 랙'],
      definition: '가상자동차 제어기를 실제 신호로 시험하는 장비',
      example: '랙 예약은 시험 하루 전까지',
      source: 'user'
    })
    const { example: _example, ...noExample } = user
    void _example
    const card = toCardEntry(noExample)
    expect('example' in card).toBe(false)
    expect(toCardEntry({ ...user, example: '' })).not.toHaveProperty('example')
  })
})
