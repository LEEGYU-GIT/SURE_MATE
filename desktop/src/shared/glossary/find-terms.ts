import { findNames } from '../text/find-names'
import { foldForMatch, foldWidth } from '../text/normalize'
import type { GlossaryEntry } from './types'

/**
 * 영문 대문자·숫자(와 이름에 든 기호·공백)로만 된 이름(CAN·STD·MC/DC·ISO 26262).
 * {{terms}}에서는 이런 이름을 대소문자를 구분해 찾는다. 소문자로 쓴 can·std::·str(은 다른 말이다.
 */
const isCapitalName = (name: string): boolean => /[A-Z]/.test(name) && !/[a-z]/.test(name) && /^[\x20-\x7e]+$/.test(name)

/**
 * 입력 글에 나온 용어(정식 이름·별칭)를 처음 나온 순서로 한 번씩 돌려준다(설계 문서 §7 {{terms}}).
 * 찾기 규칙은 가명 사전과 같다('SIL'이 'SILVER'에 걸리지 않고, '정적분석은'처럼 조사가 붙어도 찾음).
 * 다만 영문 대문자 약어는 대소문자를 구분한다(전각은 무시). 팔레트 검색과 가명 사전은 그대로 구분하지 않는다.
 * 같은 이름의 뜻이 여럿이면(SIL) 모두 돌려준다. 어느 뜻인지는 AI가 글을 보고 고른다.
 */
export function findGlossaryTerms(text: string, entries: GlossaryEntry[]): GlossaryEntry[] {
  // 같은 이름끼리 묶는다. 대문자 약어는 표기 그대로(전각만 반각으로), 나머지는 소문자로 묶는다(서로 겹치지 않는다)
  const byName = new Map<string, { name: string; caseSensitive: boolean; entries: GlossaryEntry[] }>()
  for (const e of entries) {
    for (const raw of new Set([e.term, ...e.aliases])) {
      const name = foldWidth(raw.normalize('NFC'))
      const caseSensitive = isCapitalName(name)
      const key = caseSensitive ? name : foldForMatch(name)
      if (!key) continue
      const group = byName.get(key) ?? { name, caseSensitive, entries: [] }
      if (!group.entries.includes(e)) group.entries.push(e)
      byName.set(key, group)
    }
  }
  const hits = findNames(
    text.normalize('NFC'),
    [...byName].map(([key, g]) => ({ key, names: [g.name], ...(g.caseSensitive ? { caseSensitive: true } : {}) }))
  )
  const seen = new Set<string>()
  const out: GlossaryEntry[] = []
  for (const hit of hits) {
    for (const e of byName.get(hit.key)?.entries ?? []) {
      if (seen.has(e.id)) continue
      seen.add(e.id)
      out.push(e)
    }
  }
  return out
}

/** {{terms}}에 붙이는 용어 수 상한(입력에 용어가 아주 많아도 프롬프트가 지나치게 길어지지 않게) */
export const MAX_TERMS = 20

/** 입력 글에 나온 용어를 {{terms}}용 "용어: 설명"으로, 처음 나온 순서로 MAX_TERMS개까지 */
export function termsFor(input: string, entries: GlossaryEntry[]): { term: string; definition: string }[] {
  return findGlossaryTerms(input, entries)
    .slice(0, MAX_TERMS)
    .map((e) => ({ term: e.term, definition: e.definition }))
}
