// 설정 창 워크스페이스 탭의 편집 칸(설계 §11 "이름·별칭·단축키 편집, 저장된 창 목록(포함 여부, 실행 파일, 제목 규칙, 대상 모니터)").
// 설정 창 규칙대로 칸마다 그 자리에서 저장한다: 입력칸은 칸을 떠나거나 조합이 아닌 Enter, 체크 상자·모니터 단추는 바로.
import { appLabel, TITLE_SEP } from '../../../shared/workspace/capture'
import type { WorkspaceEdit } from '../../../shared/workspace/edit'
import type { SavedLayout, SavedMonitor, WindowRule, Workspace } from '../../../shared/workspace/types'
import type { WorkspaceEditResult } from '../../../shared/workspace/workspace-ipc'

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

/** 칸 하나의 키(저장을 기다리는 칸을 셀 때) */
export const fieldKey = (f: DraftField): string => (f.kind === 'rule' ? `rule:${f.id}:${f.prop}` : f.kind)

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

/** rebaseDraft에 함께 넘기는 저장 상태 */
export interface RebaseOptions {
  /** committed 칸을 보낼 때의 칸 글(초안). 주면 그 칸이 아직 보낸 값 그대로일 때만 저장된 값으로 바꾼다 */
  sent?: WorkspaceDraft
  /** 저장을 보냈거나 차례를 기다리는 칸(fieldKey). 이 칸의 글은 그대로 둔다: 그 저장의 답이나 다음 저장이 맞춘다 */
  pending?: ReadonlySet<string>
}

/**
 * 워크스페이스가 바뀐 뒤(저장 응답, 다른 곳에서 바뀜) 칸의 글을 맞춘다. 사용자가 손대지 않은 칸(이전 저장 값 그대로)은 새 값을
 * 따르고, 아직 저장하지 않은 글은 남긴다. committed는 방금 답을 받은 칸이라 저장된(다듬은) 값으로 바꾸되, 보낸 뒤 사용자가 그 칸을
 * 또 바꿨으면(o.sent와 다름) 새 글을 남긴다(A-I2: 체크 상자를 끄고 바로 켬, 모니터 단추 두 번, Enter 뒤 이어 친 글).
 * 저장을 기다리는 칸(o.pending)은 이전 저장 값과 같아 보여도 손댄 칸이라 그대로 둔다(끄고 다시 켜면 처음 값과 같다).
 * 규칙은 새 배치의 규칙만 남는다(지금 배치로 다시 저장하면 id가 모두 바뀐다).
 */
export function rebaseDraft(prev: Workspace, next: Workspace, d: WorkspaceDraft, committed?: DraftField, o: RebaseOptions = {}): WorkspaceDraft {
  const p = draftFromWorkspace(prev)
  const n = draftFromWorkspace(next)
  const committedKey = committed ? fieldKey(committed) : null
  const sentRules = new Map((o.sent?.rules ?? []).map((r) => [r.id, r]))
  const pick = <T,>(field: DraftField, mine: T, old: T, fresh: T, sent: T | undefined): T => {
    const key = fieldKey(field)
    if (key === committedKey) return o.sent === undefined || mine === sent ? fresh : mine
    if (o.pending?.has(key)) return mine
    return mine === old ? fresh : mine
  }
  const prevRules = new Map(p.rules.map((r) => [r.id, r]))
  const mineRules = new Map(d.rules.map((r) => [r.id, r]))
  return {
    name: pick({ kind: 'name' }, d.name, p.name, n.name, o.sent?.name),
    aliases: pick({ kind: 'aliases' }, d.aliases, p.aliases, n.aliases, o.sent?.aliases),
    rules: n.rules.map((fresh) => {
      const old = prevRules.get(fresh.id)
      const mine = mineRules.get(fresh.id)
      if (!old || !mine) return fresh
      const sent = sentRules.get(fresh.id)
      const rule = (prop: Extract<DraftField, { kind: 'rule' }>['prop']): DraftField => ({ kind: 'rule', id: fresh.id, prop })
      return {
        id: fresh.id,
        enabled: pick(rule('enabled'), mine.enabled, old.enabled, fresh.enabled, sent?.enabled),
        titleIncludes: pick(rule('titleIncludes'), mine.titleIncludes, old.titleIncludes, fresh.titleIncludes, sent?.titleIncludes),
        monitor: pick(rule('monitor'), mine.monitor, old.monitor, fresh.monitor, sent?.monitor)
      }
    })
  }
}

/** 그 자리 저장의 연결부(설정 창 워크스페이스 탭): 마지막으로 저장된 값과 칸의 글을 읽고 바꾸며, 편집 값을 main에 보낸다 */
export interface FieldCommitPorts {
  saved(): Workspace
  draft(): WorkspaceDraft
  putSaved(ws: Workspace): void
  putDraft(update: (d: WorkspaceDraft) => WorkspaceDraft): void
  /** 편집 값을 저장한다(실패하면 칸 아래 오류 문구). 거부하지 않는다 */
  send(id: string, edit: WorkspaceEdit): Promise<WorkspaceEditResult>
  setError(field: DraftField, errors: string[] | null): void
}

export interface FieldCommits {
  /** 그 칸을 그 자리에서 저장한다(차례로). 저장된 값과 같으면 보내지 않고 칸을 다듬은 값으로 맞춘다 */
  commit(field: DraftField): void
  /** 보냈거나 차례를 기다리는 저장이 모두 끝나면(불러오기·다시 저장·지우기 전에 기다린다) */
  idle(): Promise<void>
  /** 다른 곳에서 바뀐 워크스페이스(설정 창에 온 새 목록): 손대지 않은 칸만 새 값을 따른다 */
  external(next: Workspace): void
}

/**
 * 칸마다 그 칸만 적은 편집 값을 만들어(fieldEdit) 차례로 보낸다(앞 저장의 답을 받은 뒤에 다음 편집 값을 만든다: 서로 덮지 않게).
 * 보낼 때의 칸 글을 기억해, 답이 오면 그 칸이 아직 그 글일 때만 저장된 값으로 바꾼다. 그사이 또 바꿨으면 새 글을 남기고
 * 차례를 기다리는 저장(체크 상자·모니터 단추)이나 다음 Enter·칸 떠나기가 저장한다(A-I2). 답과 바뀐 목록 알림은 순서가 정해져
 * 있지 않으므로 저장을 기다리는 칸은 어느 쪽이 먼저 와도 그대로 둔다.
 */
export function createFieldCommits(p: FieldCommitPorts): FieldCommits {
  let queue: Promise<void> = Promise.resolve()
  /** 보냈거나 차례를 기다리는 저장의 수(fieldKey별) */
  const waiting = new Map<string, number>()
  const pending = (): ReadonlySet<string> => new Set(waiting.keys())
  const done = (key: string): void => {
    const n = (waiting.get(key) ?? 1) - 1
    if (n > 0) waiting.set(key, n)
    else waiting.delete(key)
  }
  return {
    commit(field) {
      const key = fieldKey(field)
      waiting.set(key, (waiting.get(key) ?? 0) + 1)
      const run = queue
        .then(async () => {
          const ws = p.saved()
          const sent = p.draft()
          const edit = fieldEdit(ws, sent, field)
          if (!edit) {
            p.putDraft((d) => rebaseDraft(ws, ws, d, field, { sent, pending: pending() }))
            p.setError(field, null)
            return
          }
          const r = await p.send(ws.id, edit)
          if (r.ok) {
            const prev = p.saved()
            p.putDraft((d) => rebaseDraft(prev, r.workspace, d, field, { sent, pending: pending() }))
            p.putSaved(r.workspace)
            p.setError(field, null)
          } else p.setError(field, r.errors)
        })
        .finally(() => done(key))
      // 한 저장이 던져도 다음 저장은 이어서 보낸다
      queue = run.catch(() => undefined)
    },
    idle: () => queue,
    external(next) {
      const prev = p.saved()
      if (next === prev) return
      p.putDraft((d) => rebaseDraft(prev, next, d, undefined, { pending: pending() }))
      p.putSaved(next)
    }
  }
}
