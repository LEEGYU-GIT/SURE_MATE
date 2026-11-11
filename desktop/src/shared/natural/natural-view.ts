// 설정 창 말하듯 입력 탭의 보기(설계 §13 8단계·§14). main이 저장소 값과 지금 팔레트 항목으로 만들어 설정 창에만 보낸다. 순수 함수.
import type { PaletteItem } from '../types'
import type { IntentPack } from './intent-pack'
import type { IntentRuleView, NaturalView, PhraseRow } from './natural-ipc'

/** phrase-map.json의 한 줄: 정규화한 문장 키, 항목 id, 기억한 시각(ISO) */
export interface PhraseEntry {
  key: string
  id: string
  at: string
}

/** 지금 쓰는 단어 목록과 출처. errors는 사용자 파일을 읽을 때 생긴 문제(순번·까닭만, 파일 내용 없음) */
export interface IntentState {
  pack: IntentPack
  source: 'builtin' | 'user'
  errors: string[]
}

/** 팔레트 명령과 설정 창이 같이 쓰는 문구 */
export const NATURAL_NOTES = {
  /** 단어 목록 파일(.json)을 열 프로그램이 없어 폴더를 열었을 때(알림과 설정 창 탭) */
  openFallback: '단어 목록 파일(.json)을 열 프로그램이 없어 폴더를 열었어요. 메모장으로 열어 고쳐 주세요.'
} as const

/** 시각을 읽을 수 없으면 가장 오래된 것으로 */
const timeOf = (e: PhraseEntry): number => {
  const t = Date.parse(e.at)
  return Number.isFinite(t) ? t : -Infinity
}

/**
 * 기억한 문장 줄: 최근에 기억한 것부터(시각을 읽을 수 없으면 맨 뒤, 같으면 파일에서 뒤에 있는 것 = 나중에 기억한 것 먼저).
 * 그 문장이 여는 항목의 이름·구역을 붙이고, 지금 팔레트에 없는 항목이면 null. 항목 id는 싣지 않는다.
 */
export function phraseRows(entries: readonly PhraseEntry[], items: ReadonlyMap<string, Pick<PaletteItem, 'title' | 'group'>>): PhraseRow[] {
  return entries
    .map((e, i) => ({ e, i, t: timeOf(e) }))
    .sort((a, b) => (a.t === b.t ? b.i - a.i : b.t > a.t ? 1 : -1))
    .map(({ e }) => {
      const item = items.get(e.id)
      return { key: e.key, item: item ? { title: item.title, group: item.group } : null }
    })
}

/** 의도 규칙: 이름·단어는 그대로, 대상은 구역이나 지금 항목 이름(없으면 null) */
function ruleViews(pack: IntentPack, items: ReadonlyMap<string, Pick<PaletteItem, 'title' | 'group'>>): IntentRuleView[] {
  return pack.intents.map((r) => ({
    id: r.id,
    label: r.label,
    words: [...r.words],
    targets: r.targets.map((t) => ('group' in t ? { group: t.group } : { title: items.get(t.id)?.title ?? null }))
  }))
}

export function buildNaturalView(o: {
  rev: number
  entries: readonly PhraseEntry[]
  phraseMax: number
  usageCount: number
  intents: IntentState
  /** 지금 팔레트 항목(기억한 문장과 의도 규칙 대상의 이름·구역을 찾는다) */
  items: readonly PaletteItem[]
}): NaturalView {
  const byId = new Map(o.items.map((item) => [item.id, item]))
  const { pack, source, errors } = o.intents
  return {
    rev: o.rev,
    phrases: phraseRows(o.entries, byId),
    phraseMax: o.phraseMax,
    usageCount: o.usageCount,
    intents: {
      source,
      errors: [...errors],
      endings: pack.endings.length,
      particles: pack.particles.length,
      fillers: pack.fillers.length,
      rules: ruleViews(pack, byId)
    }
  }
}
