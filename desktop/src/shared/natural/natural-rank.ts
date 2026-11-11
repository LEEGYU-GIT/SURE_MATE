// 말하듯 입력 후보 점수(설계 §13 7단계 "후보 점수 = §9 검색 점수 + 의도 가산점 + 학습 가산점. 자동 실행하지 않는다").
import { rankAll, type RankHit, type SearchIndex } from '../search/ranker'
import type { PaletteGroup } from '../types'
import type { IntentPack, IntentRule } from './intent-pack'
import type { Understood } from './understand'

/** 찾은 의도 규칙 하나가 가리키는 문서에 더하는 점수(규칙끼리 합산) */
export const INTENT_BONUS = 120
/** 기억한 문장의 문서에 더하는 점수(늘 맨 위) */
export const LEARN_BONUS = 2000
/** 기억한 문장으로 맨 위가 된 후보의 의도 표시 */
export const LEARNED_LABEL = '기억한 문장'

/** 규칙이 가리키지 않는 맨 위 후보의 의도 표시(구역 기본 이름, 설계 §6) */
export const DEFAULT_INTENT_LABELS: Record<PaletteGroup, string> = {
  prompt: '프롬프트',
  command: '명령',
  workspace: '배치',
  snippet: '상용구',
  wiki: '용어 뜻'
}

export interface NaturalHit extends RankHit {
  /** 의도 표시: 기억한 문장, 아니면 이 문서를 가리키는 찾은 규칙 중 가장 좁은 규칙의 이름, 없으면 null */
  label: string | null
  learned: boolean
}

export interface NaturalRankOptions {
  pack: IntentPack
  groupOf(id: string): PaletteGroup | undefined
  /** 학습 키(understand의 key) → 항목 id */
  learned: ReadonlyMap<string, string>
  prefer?(id: string): number
}

/** 규칙이 이 문서를 가리키는지(id로, 또는 문서의 구역으로) */
const pointsAt = (rule: IntentRule, id: string, group: PaletteGroup | undefined): boolean =>
  rule.targets.some((t) => ('id' in t ? t.id === id : t.group === group))

/** 대상이 가장 적은 규칙(같으면 앞의 규칙) */
function narrowestRule(rules: IntentRule[]): IntentRule | null {
  let best: IntentRule | null = null
  for (const r of rules) if (best === null || r.targets.length < best.targets.length) best = r
  return best
}

/**
 * 그 id를 id로 가리키는 규칙 중 가장 좁은 규칙의 이름(찾았는지와 무관), 없으면 null.
 * 의도 규칙을 찾지 못한 맨 위 후보(접두어 검색 포함)의 의도 표시에 쓴다(지금 배치 저장 → '배치 저장').
 */
export function idRuleLabel(pack: IntentPack, id: string): string | null {
  return narrowestRule(pack.intents.filter((r) => r.targets.some((t) => 'id' in t && t.id === id)))?.label ?? null
}

/**
 * understand 결과의 변형 검색어로 점수를 매기고(rankAll), 찾은 규칙마다 그 규칙이 id나 구역으로 가리키는 문서에
 * INTENT_BONUS를 더한다(한 규칙은 한 번). id로 가리킨 문서는 검색어에 맞지 않아도 후보다("원래 이름으로 돌려줘" →
 * 가명 되돌리기). 학습 키에 연결된 문서는 LEARN_BONUS를 더하고 후보로 지목한다(색인에 없으면 무시).
 */
export function naturalRank(index: SearchIndex, u: Understood, o: NaturalRankOptions): NaturalHit[] {
  const found = o.pack.intents.filter((r) => u.intents.includes(r.id))
  const learnedId = u.key !== null ? o.learned.get(u.key) : undefined
  const nominate = new Set<string>()
  for (const r of found) for (const t of r.targets) if ('id' in t) nominate.add(t.id)
  if (learnedId !== undefined) nominate.add(learnedId)

  const rulesFor = (id: string): IntentRule[] => {
    const group = o.groupOf(id)
    return found.filter((r) => pointsAt(r, id, group))
  }
  const boost = (id: string): number => rulesFor(id).length * INTENT_BONUS + (id === learnedId ? LEARN_BONUS : 0)

  return rankAll(index, u.variants, { boost, nominate, prefer: o.prefer }).map((h) => {
    if (h.id === learnedId) return { ...h, label: LEARNED_LABEL, learned: true }
    return { ...h, label: narrowestRule(rulesFor(h.id))?.label ?? null, learned: false }
  })
}
