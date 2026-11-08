import { findNames } from '../text/find-names'
import { foldForMatch } from '../text/normalize'
import type { GlossaryEntry } from './types'

/**
 * 입력 글에 나온 용어(정식 이름·별칭)를 처음 나온 순서로 한 번씩 돌려준다(설계 문서 §7 {{terms}}).
 * 찾기 규칙은 가명 사전과 같다('SIL'이 'SILVER'에 걸리지 않고, '정적분석은'처럼 조사가 붙어도 찾음).
 * 같은 이름의 뜻이 여럿이면(SIL) 모두 돌려준다. 어느 뜻인지는 AI가 글을 보고 고른다.
 */
export function findGlossaryTerms(text: string, entries: GlossaryEntry[]): GlossaryEntry[] {
  const byName = new Map<string, GlossaryEntry[]>()
  for (const e of entries) {
    for (const name of new Set([e.term, ...e.aliases])) {
      const key = foldForMatch(name.normalize('NFC'))
      if (!key) continue
      const list = byName.get(key) ?? []
      if (!list.includes(e)) list.push(e)
      byName.set(key, list)
    }
  }
  const hits = findNames(
    text.normalize('NFC'),
    [...byName.keys()].map((key) => ({ key, names: [key] }))
  )
  const seen = new Set<string>()
  const out: GlossaryEntry[] = []
  for (const hit of hits) {
    for (const e of byName.get(hit.key) ?? []) {
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
