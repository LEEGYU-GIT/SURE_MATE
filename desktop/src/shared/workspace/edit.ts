import { compactOf } from '../search/ranker'
import { type SavedLayout, type WindowRule, type Workspace, WORKSPACE_LIMITS as L } from './types'

/** 편집 화면이 보내는 값(설계 §11 "이름·별칭·단축키 편집, 저장된 창 목록(포함 여부, 제목 규칙, 대상 모니터)"). 단축키는 따로 저장한다 */
export interface WorkspaceEdit {
  name: string
  /** 나눈 별칭(쉼표로 나누기는 편집 화면이 한다) */
  aliases: string[]
  /** 첫 배치의 규칙을 id로 찾아 바꾼다. 없는 규칙은 그대로 */
  rules: { id: string; enabled: boolean; titleIncludes: string | null; monitor: string }[]
}

/**
 * 편집 오류 문구. 설정 창 워크스페이스 탭이 그 칸 아래에 그대로 보인다(어느 칸인지는 화면이 이 값으로 가린다).
 * 길이 문구는 앱의 다른 입력칸과 같은 'N자까지예요' 꼴, 겹침·모니터는 고칠 방법까지 말한다.
 */
export const EDIT_ERRORS = {
  nameEmpty: '이름을 적어 주세요',
  nameLong: `이름은 ${L.name}자까지예요`,
  nameTaken: '같은 이름의 워크스페이스가 있어요. 다른 이름을 적어 주세요',
  aliases: `별칭은 ${L.aliases}개, 하나에 ${L.alias}자까지예요`,
  titleLong: `‘제목에 포함’은 ${L.titleIncludes}자까지예요`,
  monitor: '대상 모니터를 찾지 못했어요. 대상 모니터 단추로 다시 골라 주세요'
} as const

/** 앞뒤 공백·빈 칸·중복(검색과 같은 compactOf)을 뺀 별칭 */
function cleanAliases(raw: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const a of raw) {
    const t = a.trim()
    if (!t) continue
    const key = compactOf(t)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

/**
 * 편집을 적용한 새 워크스페이스(원본은 바꾸지 않는다). 이름은 앞뒤 공백을 빼고 1~40자이고, 이름을 바꿀 때만 다른
 * 워크스페이스 이름과 compactOf가 같은지 본다(이미 겹친 이름이라도 다른 칸의 저장을 막지 않게). 규칙은 첫 배치에서 id로 찾아
 * 포함 여부·제목 조건(빈 글이면 삭제)·대상 모니터(그 배치의 모니터 키만)를 바꾸고, 모르는 id는 무시한다. 오류가 있으면 모두 돌려준다.
 */
export function applyWorkspaceEdit(
  ws: Workspace,
  edit: WorkspaceEdit,
  others: Workspace[],
  now: Date
): { ok: true; workspace: Workspace } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const name = edit.name.trim()
  if (!name) errors.push(EDIT_ERRORS.nameEmpty)
  else if (name.length > L.name) errors.push(EDIT_ERRORS.nameLong)
  else if (name !== ws.name && others.some((o) => o.id !== ws.id && compactOf(o.name) === compactOf(name))) errors.push(EDIT_ERRORS.nameTaken)

  const aliases = cleanAliases(edit.aliases)
  if (aliases.length > L.aliases || aliases.some((a) => a.length > L.alias)) errors.push(EDIT_ERRORS.aliases)

  let layouts = ws.layouts
  const first = Object.entries(ws.layouts)[0] as [string, SavedLayout] | undefined
  if (first) {
    const [fingerprint, layout] = first
    const keys = new Set(layout.monitors.map((m) => m.key))
    const byId = new Map(edit.rules.map((r) => [r.id, r]))
    let titleLong = false
    let unknownMonitor = false
    const windows = layout.windows.map((rule): WindowRule => {
      const e = byId.get(rule.id)
      if (!e) return rule
      const title = (e.titleIncludes ?? '').trim()
      if (title.length > L.titleIncludes) titleLong = true
      if (!keys.has(e.monitor)) unknownMonitor = true
      const match: WindowRule['match'] = { ...rule.match }
      delete match.titleIncludes
      if (title) match.titleIncludes = title
      return { ...rule, enabled: e.enabled, match, target: { ...rule.target, monitor: e.monitor } }
    })
    if (titleLong) errors.push(EDIT_ERRORS.titleLong)
    if (unknownMonitor) errors.push(EDIT_ERRORS.monitor)
    // 키 순서를 지켜 첫 배치가 계속 첫 배치이게
    layouts = { ...ws.layouts, [fingerprint]: { ...layout, windows } }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, workspace: { ...ws, name, aliases, layouts, updatedAt: now.toISOString() } }
}
