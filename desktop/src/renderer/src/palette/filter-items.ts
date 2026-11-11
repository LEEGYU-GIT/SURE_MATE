import type { IntentPack } from '../../../shared/natural/intent-pack'
import { DEFAULT_INTENT_LABELS, idRuleLabel, naturalRank } from '../../../shared/natural/natural-rank'
import { understand } from '../../../shared/natural/understand'
import { recentIds, usageScore, type UsageRecord } from '../../../shared/natural/usage'
import { parseQuery } from '../../../shared/palette-query'
import { buildSearchIndex, compactOf, rank, type SearchIndex } from '../../../shared/search/ranker'
import type { PaletteGroup, PaletteItem } from '../../../shared/types'
import { WORKSPACE_LIMITS } from '../../../shared/workspace/types'

/** 팔레트 항목 색인. 제목, 별칭은 키워드, 본문은 부제와 본문(위키 설명)과 태그 */
export function buildPaletteIndex(items: PaletteItem[]): SearchIndex {
  return buildSearchIndex(
    items.map((item) => ({
      id: item.id,
      title: item.title,
      aliases: item.keywords ?? [],
      body: [item.subtitle, item.body, ...(item.tags ?? [])].filter(Boolean).join('\n')
    }))
  )
}

/** 한 번에 그리는 목록 줄 수 상한. 용어가 2,000개여도 한 번 칠 때마다 수천 줄을 다시 그리지 않게(설계 문서 §16 검색 갱신 50ms) */
export const MAX_ROWS = 50

const byTitle = (a: PaletteItem, b: PaletteItem): number => a.title.localeCompare(b.title, 'ko')

/** 한 글자(자모 하나 포함)만 친 검색어. 범위 없이 이렇게 치면 거의 모든 용어가 걸려 목록을 덮는다 */
const isOneChar = (text: string): boolean => [...text].length <= 1

/** 검색 문맥(설계 §13 말하듯 입력, §9 동점 순서). pack이 null이면 말하듯 입력 없이 M4 검색에 동점 순서만 더한다 */
export interface SearchContext {
  /** 말하듯 입력 단어 목록 */
  pack: IntentPack | null
  /** 학습 키 → 항목 id(기억한 문장) */
  learned: ReadonlyMap<string, string>
  /** 항목 id → 사용 기록 */
  usage: ReadonlyMap<string, UsageRecord>
  /** 사용 점수를 계산할 지금 시각(ms) */
  now: number
}

/** 단어 목록·학습·사용 기록이 없는 문맥: M4 검색과 같다 */
export const EMPTY_SEARCH_CONTEXT: SearchContext = Object.freeze({
  pack: null,
  learned: new Map<string, string>(),
  usage: new Map<string, UsageRecord>(),
  now: 0
})

export interface PaletteSearch {
  /** 그릴 목록(MAX_ROWS개까지) */
  items: PaletteItem[]
  /** 맨 위 후보와 의도 표시(설계 §6). 검색어가 비었거나 결과가 없으면 null */
  top: { id: string; label: string } | null
  /** 말하듯 입력으로 해석했는지(understand의 natural). 접두어 검색·빈 검색어는 false */
  natural: boolean
  /** 학습 키(understand의 key). 접두어 검색·빈 검색어는 null */
  key: string | null
  /** 빈 검색어에서 목록 맨 앞에 둔 최근 실행 항목 id(최근 순) */
  recent: string[]
}

/** 빈 화면 맨 앞에 둘 최근 실행 항목 수(목록을 덮지 않게, 설계 §6 빈 화면) */
export const RECENT_MAX = 5

/** 의도 표시: 찾은 규칙 이름 → 그 id를 id로 가리키는 규칙 이름 → 구역 기본 이름 */
function topOf(item: PaletteItem | undefined, label: string | null, pack: IntentPack | null): PaletteSearch['top'] {
  if (!item) return null
  return { id: item.id, label: label ?? (pack ? idRuleLabel(pack, item.id) : null) ?? DEFAULT_INTENT_LABELS[item.group] }
}

/**
 * 팔레트 검색(설계 §6·§9·§13). 접두어가 있으면 그 구역만 찾는다. 위키는 `?`로 골랐거나 범위 없이 두 글자 이상 쳤을 때만
 * 보인다(한 글자 판단은 변형 검색어가 아닌 친 글 그대로).
 * - 검색어가 비었으면 최근 실행 항목(최근 순, 지금 있고 범위에 맞는 것 RECENT_MAX개까지, 위키 포함) 다음에 M4 목록(중복 제외).
 * - 접두어가 있거나 단어 목록(pack)이 없으면 M4와 같은 한 검색어 검색이고, 같은 점수에서만 자주·최근 쓴 항목이 앞선다.
 * - 그 밖에는 말하듯 입력: understand로 변형 검색어·의도·학습 키를 만들고 naturalRank로 점수를 매긴다.
 */
export function searchPalette(items: PaletteItem[], query: string, index: SearchIndex, ctx: SearchContext): PaletteSearch {
  const { scope, text } = parseQuery(query)
  const inScope = (item: PaletteItem): boolean => (scope ? item.group === scope : item.group !== 'wiki' || !isOneChar(text))
  const byId = new Map(items.map((item) => [item.id, item]))
  const prefer = (id: string): number => usageScore(ctx.usage.get(id), ctx.now)

  if (!text) {
    const recent: PaletteItem[] = []
    for (const id of recentIds(ctx.usage, ctx.usage.size)) {
      if (recent.length >= RECENT_MAX) break
      const item = byId.get(id)
      if (item && (!scope || item.group === scope)) recent.push(item)
    }
    const shown = new Set(recent.map((item) => item.id))
    const list = items.filter((item) => inScope(item) && !shown.has(item.id))
    const rest = scope === 'wiki' ? list.sort(byTitle) : list
    return { items: [...recent, ...rest].slice(0, MAX_ROWS), top: null, natural: false, key: null, recent: [...shown] }
  }

  const out: PaletteItem[] = []
  const pack = ctx.pack
  if (scope !== null || pack === null) {
    for (const r of rank(index, text, { prefer })) {
      const item = byId.get(r.id)
      if (item && inScope(item)) out.push(item)
      if (out.length >= MAX_ROWS) break
    }
    return { items: out, top: topOf(out[0], null, pack), natural: false, key: null, recent: [] }
  }

  const understood = understand(text, pack)
  // 군말·끝 기호만 친 글(예: '그룹'을 치는 중인 '그')은 남는 검색어가 없으므로 친 글 그대로 찾는다(M4와 같은 결과)
  const u = understood.variants.length > 0 ? understood : { ...understood, variants: [{ text, penalty: 0, typo: true }] }
  let label: string | null = null
  for (const h of naturalRank(index, u, { pack, groupOf: (id) => byId.get(id)?.group, learned: ctx.learned, prefer })) {
    const item = byId.get(h.id)
    if (!item || !inScope(item)) continue
    if (out.length === 0) label = h.label
    out.push(item)
    if (out.length >= MAX_ROWS) break
  }
  return { items: out, top: topOf(out[0], label, pack), natural: u.natural, key: u.key, recent: [] }
}

/**
 * 검색어로 항목을 거르고 점수 높은 순으로 MAX_ROWS개까지 돌려준다(searchPalette의 목록). 문맥이 없으면 M4 검색 그대로.
 * 접두어가 있으면 그 구역만. 위키는 `?`로 골랐거나 범위 없이 두 글자 이상 쳤을 때만 보인다(검색어가 비었으면 용어 순).
 */
export function filterItems(
  items: PaletteItem[],
  query: string,
  index: SearchIndex = buildPaletteIndex(items),
  ctx: SearchContext = EMPTY_SEARCH_CONTEXT
): PaletteItem[] {
  return searchPalette(items, query, index, ctx).items
}

/** 구역별로 묶되, 구역 순서는 그 구역 항목이 처음 나온 순서(맨 위 후보가 맨 위 구역에 오게) */
export function groupItems(items: PaletteItem[]): { group: PaletteGroup; items: PaletteItem[] }[] {
  const groups = new Map<PaletteGroup, PaletteItem[]>()
  for (const item of items) {
    const list = groups.get(item.group)
    if (list) list.push(item)
    else groups.set(item.group, [item])
  }
  return [...groups].map(([group, list]) => ({ group, items: list }))
}

/** 목록 맨 끝의 '직접 추가하기' 항목 id(설계 문서 §9: 이 용어를 아시나요?) */
export const WIKI_ADD_ID = 'wiki-add'

/**
 * 위키 범위(?)에 검색어가 있거나, 범위 없이 쳤는데 아무것도 못 찾았으면 맨 끝에 '직접 추가하기'를 붙인다.
 * 다른 범위(/ > ! @)에서는 붙이지 않는다. 범위 없이 한 글자만 쳤을 때도 붙이지 않는다:
 * 그때는 위키를 빼고 찾으므로(filterItems) 맞는 용어가 있어도 목록이 비어 '직접 추가하기'만 남는다.
 */
export function withWikiAdd(items: PaletteItem[], query: string): PaletteItem[] {
  const { scope, text } = parseQuery(query)
  if (!text) return items
  if (scope === null && isOneChar(text)) return items
  if (scope !== 'wiki' && (scope !== null || items.length > 0)) return items
  return [...items, { id: WIKI_ADD_ID, group: 'wiki', title: `‘${text}’ 용어 직접 추가하기`, subtitle: '이 용어를 아시나요? 설명을 적어 팔레트 위키에 넣어요' }]
}

/** 워크스페이스 범위(@) 목록 맨 끝의 '이 이름으로 지금 배치 저장' 줄 id. 팔레트가 runItem 대신 saveWorkspaceAs로 처리한다 */
export const WORKSPACE_SAVE_AS_ID = 'workspace-save-as'

/**
 * `@` 범위에 1~40자를 쳤으면 맨 끝에 그 이름으로 지금 배치를 저장하는 줄을 붙인다(설계 §11 "지금 배치 저장"을 이름과 함께).
 * 이름이나 별칭이 같은(compactOf) 워크스페이스가 목록에 있으면 저장도 그 워크스페이스를 다시 저장하므로 '바꾸기' 줄로 알린다.
 * 친 이름은 id에 넣지 않는다(palette.run 로그에 남지 않게).
 */
export function withWorkspaceSaveAs(items: PaletteItem[], query: string): PaletteItem[] {
  const { scope, text } = parseQuery(query)
  if (scope !== 'workspace' || text.length < 1 || text.length > WORKSPACE_LIMITS.name) return items
  const key = compactOf(text)
  const same = items.find(
    (item) => item.group === 'workspace' && item.id.startsWith('workspace:') && (compactOf(item.title) === key || (item.keywords ?? []).some((k) => compactOf(k) === key))
  )
  const line: PaletteItem = same
    ? { id: WORKSPACE_SAVE_AS_ID, group: 'workspace', title: `‘${same.title}’ 배치를 지금 배치로 바꾸기`, subtitle: '이름·별칭·단축키는 그대로 두고 창 위치만 지금 배치로 바꿔요' }
    : { id: WORKSPACE_SAVE_AS_ID, group: 'workspace', title: `‘${text}’ 이름으로 지금 배치 저장`, subtitle: '지금 열린 창 위치를 이 이름으로 저장해요' }
  return [...items, line]
}
