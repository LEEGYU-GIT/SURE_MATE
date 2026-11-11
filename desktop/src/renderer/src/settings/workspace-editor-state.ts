// 설정 창 워크스페이스 탭의 편집 칸(설계 §11 "이름·별칭·단축키 편집, 저장된 창 목록(포함 여부, 실행 파일, 제목 규칙, 대상 모니터)").
// 설정 창 규칙대로 칸마다 그 자리에서 저장한다: 입력칸은 칸을 떠나거나 조합이 아닌 Enter, 체크 상자·모니터 단추는 바로.
import { appLabel, TITLE_SEP } from '../../../shared/workspace/capture'
import type { WorkspaceEdit } from '../../../shared/workspace/edit'
import type { SavedLayout, SavedMonitor, WindowRule, Workspace } from '../../../shared/workspace/types'

/** 창 규칙 한 줄의 칸(제목 조건은 입력칸 글 그대로, 비었으면 '') */
export interface DraftRule {
  id: string
  enabled: boolean
  titleIncludes: string
  monitor: string
}

/** 편집 칸에 보이는 글(별칭은 쉼표로 이은 한 줄) */
export interface WorkspaceDraft {
  name: string
  aliases: string
  rules: DraftRule[]
}

/** 그 자리에서 저장하는 칸 하나 */
export type DraftField = { kind: 'name' } | { kind: 'aliases' } | { kind: 'rule'; id: string; prop: 'enabled' | 'titleIncludes' | 'monitor' }

/** 별칭 칸은 쉼표(,)·전각 쉼표(，)·모점(、)으로 나눈다 */
const ALIAS_SEP = /[,，、]/

export const splitAliases = (text: string): string[] =>
  text
    .split(ALIAS_SEP)
    .map((a) => a.trim())
    .filter(Boolean)

export const joinAliases = (aliases: readonly string[]): string => aliases.join(', ')

/** 편집하는 배치: 첫 배치(applyWorkspaceEdit도 첫 배치만 바꾼다. 배치는 Should 8 전까지 하나) */
export const firstLayout = (ws: Workspace): SavedLayout | null => Object.values(ws.layouts)[0] ?? null

export function draftFromWorkspace(ws: Workspace): WorkspaceDraft {
  return {
    name: ws.name,
    aliases: joinAliases(ws.aliases),
    rules: (firstLayout(ws)?.windows ?? []).map((r) => ({ id: r.id, enabled: r.enabled, titleIncludes: r.match.titleIncludes ?? '', monitor: r.target.monitor }))
  }
}

/** 보낼 편집 값. 빈 제목 조건은 null(IPC 검사가 undefined를 받지 않는다), 이름·제목 조건은 앞뒤 공백을 뺀다 */
export function draftToEdit(d: WorkspaceDraft): WorkspaceEdit {
  return {
    name: d.name.trim(),
    aliases: splitAliases(d.aliases),
    rules: d.rules.map((r) => ({ id: r.id, enabled: r.enabled, titleIncludes: r.titleIncludes.trim() || null, monitor: r.monitor }))
  }
}

const sameEdit = (a: WorkspaceEdit, b: WorkspaceEdit): boolean => JSON.stringify(a) === JSON.stringify(b)

/** 칸에 저장하지 않은 글이 있는지(앞뒤 공백만 다른 것은 같다) */
export function isDraftDirty(d: WorkspaceDraft, ws: Workspace): boolean {
  return !sameEdit(draftToEdit(d), draftToEdit(draftFromWorkspace(ws)))
}

/** 대상 모니터 단추: 저장한 순서대로 다음 모니터(끝에서 처음으로, 모르는 키는 첫 모니터) */
export function nextMonitor(current: string, monitors: readonly SavedMonitor[]): string {
  if (monitors.length === 0) return current
  const i = monitors.findIndex((m) => m.key === current)
  return monitors[(i + 1) % monitors.length].key
}

/**
 * 창 규칙 줄의 이름: 프로그램 이름(appLabel)과, 저장할 때 제목에서 끝의 프로그램 이름 조각을 뗀 나머지(어느 창이었는지).
 * 제목이 프로그램 이름뿐이면 title은 빈 글
 */
export function ruleCaption(rule: Pick<WindowRule, 'savedTitle'> & { match: Pick<WindowRule['match'], 'exe'> }): { app: string; title: string } {
  const app = appLabel(rule)
  const t = rule.savedTitle.trim()
  const seps = [...t.matchAll(new RegExp(TITLE_SEP.source, 'g'))]
  const last = seps[seps.length - 1]
  if (last?.index !== undefined && t.slice(last.index + last[0].length).trim() === app) return { app, title: t.slice(0, last.index).trim() }
  return { app, title: t === app ? '' : t }
}

/**
 * 칸 하나를 그 자리에서 저장할 때 보낼 편집 값: 그 칸만 적은 값이고 나머지는 마지막으로 저장된 값이다
 * (다른 칸에 아직 저장하지 않은 글이나 틀린 글이 있어도 이 저장을 막지 않게). 저장된 값과 같으면 null(보내지 않는다).
 */
export function fieldEdit(ws: Workspace, d: WorkspaceDraft, field: DraftField): WorkspaceEdit | null {
  const base = draftToEdit(draftFromWorkspace(ws))
  const mine = draftToEdit(d)
  switch (field.kind) {
    case 'name':
      return mine.name === base.name ? null : { ...base, name: mine.name }
    case 'aliases':
      return JSON.stringify(mine.aliases) === JSON.stringify(base.aliases) ? null : { ...base, aliases: mine.aliases }
    case 'rule': {
      const want = mine.rules.find((r) => r.id === field.id)
      const i = base.rules.findIndex((r) => r.id === field.id)
      if (!want || i < 0 || base.rules[i][field.prop] === want[field.prop]) return null
      return { ...base, rules: base.rules.map((r, j) => (j === i ? { ...r, [field.prop]: want[field.prop] } : r)) }
    }
  }
}

/**
 * 워크스페이스가 바뀐 뒤(저장 응답, 다른 곳에서 바뀜) 칸의 글을 맞춘다. 사용자가 손대지 않은 칸(이전 저장 값 그대로)은 새 값을
 * 따르고, 아직 저장하지 않은 글은 남긴다. committed는 방금 저장한 칸이라 저장된(다듬은) 값으로 바꾼다.
 * 규칙은 새 배치의 규칙만 남는다(지금 배치로 다시 저장하면 id가 모두 바뀐다).
 */
export function rebaseDraft(prev: Workspace, next: Workspace, d: WorkspaceDraft, committed?: DraftField): WorkspaceDraft {
  const p = draftFromWorkspace(prev)
  const n = draftFromWorkspace(next)
  const pick = <T,>(isCommitted: boolean, mine: T, old: T, fresh: T): T => (isCommitted || mine === old ? fresh : mine)
  const prevRules = new Map(p.rules.map((r) => [r.id, r]))
  const mineRules = new Map(d.rules.map((r) => [r.id, r]))
  const ruleCommitted = (id: string, prop: Extract<DraftField, { kind: 'rule' }>['prop']): boolean =>
    committed?.kind === 'rule' && committed.id === id && committed.prop === prop
  return {
    name: pick(committed?.kind === 'name', d.name, p.name, n.name),
    aliases: pick(committed?.kind === 'aliases', d.aliases, p.aliases, n.aliases),
    rules: n.rules.map((fresh) => {
      const old = prevRules.get(fresh.id)
      const mine = mineRules.get(fresh.id)
      if (!old || !mine) return fresh
      return {
        id: fresh.id,
        enabled: pick(ruleCommitted(fresh.id, 'enabled'), mine.enabled, old.enabled, fresh.enabled),
        titleIncludes: pick(ruleCommitted(fresh.id, 'titleIncludes'), mine.titleIncludes, old.titleIncludes, fresh.titleIncludes),
        monitor: pick(ruleCommitted(fresh.id, 'monitor'), mine.monitor, old.monitor, fresh.monitor)
      }
    })
  }
}
