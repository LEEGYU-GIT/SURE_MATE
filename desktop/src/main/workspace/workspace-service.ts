import { sameAccelerator } from '../../shared/hotkeys/accelerator-input'
import { compactOf } from '../../shared/search/ranker'
import type { MonitorInfo, Rect, WindowInfo } from '../../shared/types'
import { captureLayout } from '../../shared/workspace/capture'
import { applyWorkspaceEdit, type WorkspaceEdit } from '../../shared/workspace/edit'
import { restoreSummary, saveSummary, WORKSPACE_NOTES as NOTES } from '../../shared/workspace/messages'
import { monitorFingerprint } from '../../shared/workspace/monitors'
import { planRestore, type ReadyPlan, type RestorePlan } from '../../shared/workspace/restore-plan'
import type { OutcomeResult, RestoreReport } from '../../shared/workspace/restore-result'
import { type Workspace, WORKSPACE_LIMITS } from '../../shared/workspace/types'
import { nextWorkspaceName } from '../../shared/workspace/workspace-file'
import type {
  WorkspaceEditResult,
  WorkspaceFailReason,
  WorkspaceListView,
  WorkspaceRunResult,
  WorkspaceSaveResult,
  WorkspaceSource,
  WorkspaceView
} from '../../shared/workspace/workspace-ipc'
import { errorCode, errorText } from '../error-text'

export type { WorkspaceEditResult, WorkspaceFailReason, WorkspaceListView, WorkspaceRunResult, WorkspaceSaveResult, WorkspaceSource, WorkspaceView }

/**
 * 워크스페이스 저장·불러오기(설계 §11). list·onChange가 주는 목록은 저장소 캐시와 함께 쓰는 얼린 값이므로
 * 고치지 말고 새 배열·객체를 만든다.
 */
export interface WorkspaceService {
  list(): Promise<Workspace[]>
  /** 설정 창 워크스페이스 탭용. Win32 없이 된다(창 목록을 읽지 않는다) */
  view(id: string): Promise<WorkspaceView | null>
  /** 설정 창 워크스페이스 탭의 목록: 최근에 바꾼 순서, 창을 저장·불러올 수 있는지. 읽지 못하면 빈 목록 */
  listView(): Promise<WorkspaceListView>
  saveNew(o: { source: WorkspaceSource; name?: string; quiet?: boolean }): Promise<WorkspaceSaveResult>
  recapture(id: string, o: { source: WorkspaceSource; quiet?: boolean }): Promise<WorkspaceSaveResult>
  /** 이름이 기존 워크스페이스의 이름·별칭과 compactOf로 같으면 그것을 다시 저장, 아니면 그 이름으로 새로 저장 */
  saveAs(name: string, source: WorkspaceSource): Promise<WorkspaceSaveResult>
  run(id: string, source: WorkspaceSource): Promise<WorkspaceRunResult>
  edit(id: string, edit: WorkspaceEdit): Promise<WorkspaceEditResult>
  remove(id: string): Promise<boolean>
  setHotkey(id: string, hotkey: string | null): Promise<boolean>
  /** 저장·편집·삭제·단축키 저장 뒤 새 목록으로 부른다. 돌려받은 함수로 그만 듣는다 */
  onChange(cb: (list: Workspace[]) => void): () => void
}

export interface WorkspaceServiceDeps {
  store: { get(): Promise<Workspace[]>; save(list: Workspace[]): Promise<void> }
  /** Win32 기능을 쓸 수 있는지(nativeStatus). false면 저장·불러오기는 알리고 아무것도 바꾸지 않는다 */
  nativeOk(): boolean
  /** 지금 창(listWindows, z-순서)과 모니터. nativeOk()가 true일 때만 부른다 */
  snapshot(): { windows: WindowInfo[]; monitors: MonitorInfo[] }
  /** 지금 모니터(Electron screen, Win32 없이). 편집 화면 보기의 같은 구성 표시에 쓴다 */
  monitors(): MonitorInfo[]
  toDip(physical: Rect): Rect
  selfElevated(): boolean | null
  runner: { run(plan: ReadyPlan): Promise<RestoreReport> }
  /** 다른 모니터 구성에서 저장한 배치를 주 모니터로 모을지 묻는다 */
  confirmGather(o: { savedMonitors: number; currentMonitors: number }): Promise<boolean>
  notify(message: string): void
  newId(): string
  now(): Date
  /** 이름·별칭·창 제목은 남기지 않는다(id·건수·까닭·시간만) */
  log(event: string, data: Record<string, unknown>): void
  /**
   * 그 워크스페이스 단축키로 지금 등록된 조합(HotkeyManager.current('workspace:<id>')). 없거나 못 잡았으면 undefined.
   * 단축키 관리자는 서비스보다 늦게 만들어지므로 부를 때마다 묻는다. 없으면 모두 등록 안 됨으로 본다
   */
  hotkeyBound?(workspaceId: string): string | undefined
}

/** 실패 까닭마다 알림·화면 문구 */
const FAIL_MESSAGE: Record<WorkspaceFailReason, string> = {
  'native-unavailable': NOTES.nativeUnavailable,
  busy: NOTES.busy,
  'no-windows': NOTES.noWindows,
  limit: NOTES.limit,
  missing: NOTES.missing,
  'save-failed': NOTES.saveFailed,
  invalid: '요청 형식이 맞지 않아요.'
}

/** 최근에 바꾼 순서(팔레트·바 메뉴와 같은 순서). 읽지 못하는 시각은 맨 뒤 */
const updatedTime = (ws: Workspace): number => {
  const t = Date.parse(ws.updatedAt)
  return Number.isNaN(t) ? 0 : t
}

/** 복원 결과 로그에 세는 까닭(placed는 report.placed) */
const OUTCOMES: Exclude<OutcomeResult, 'placed'>[] = ['missing', 'gone', 'elevated', 'blocked', 'hung', 'off', 'failed', 'timeout']

type SaveKind = { kind: 'new'; name?: string } | { kind: 'recapture'; id: string } | { kind: 'as'; name: string }

export function createWorkspaceService(d: WorkspaceServiceDeps): WorkspaceService {
  /** 한 번에 하나: 진행 중인 저장·불러오기(창을 읽거나 옮기는 일) */
  let busy: string | null = null
  /** 파일을 바꾸는 일은 이 줄을 차례로 지난다(읽고 고치고 저장하는 사이에 다른 저장이 끼어 변경을 덮지 않게) */
  let queue: Promise<unknown> = Promise.resolve()
  const listeners = new Set<(list: Workspace[]) => void>()

  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = queue.then(fn)
    queue = next.catch(() => undefined)
    return next
  }

  async function safeList(): Promise<Workspace[]> {
    try {
      return await d.store.get()
    } catch (e) {
      d.log('workspace.loadError', { error: errorCode(e) })
      return []
    }
  }

  /** 저장하고 듣는 곳에 알린다. 듣는 곳의 오류는 저장 결과를 바꾸지 않는다 */
  async function commit(list: Workspace[]): Promise<void> {
    await d.store.save(list)
    for (const cb of [...listeners]) {
      try {
        cb(list)
      } catch (e) {
        d.log('workspace.listenerError', { error: errorText(e) })
      }
    }
  }

  /** Win32를 쓸 수 없거나 다른 저장·불러오기가 진행 중이면 그 까닭 */
  function gate(op: string, source: WorkspaceSource): 'native-unavailable' | 'busy' | null {
    if (!d.nativeOk()) return 'native-unavailable'
    if (busy) {
      d.log('workspace.busy', { op, source, running: busy })
      return 'busy'
    }
    return null
  }

  async function save(what: SaveKind, source: WorkspaceSource, quiet: boolean): Promise<WorkspaceSaveResult> {
    let op = what.kind === 'recapture' ? 'recapture' : 'new'
    const fail = (reason: WorkspaceFailReason, extra: Record<string, unknown> = {}): WorkspaceSaveResult => {
      const message = FAIL_MESSAGE[reason]
      if (!quiet) d.notify(message)
      d.log('workspace.save', { op, source, ok: false, reason, ...extra })
      return { ok: false, reason, message }
    }
    const blocked = gate(what.kind === 'as' ? 'save-as' : op, source)
    if (blocked) return fail(blocked)
    busy = what.kind === 'as' ? 'save-as' : op
    try {
      return await serial(async () => {
        let list: Workspace[]
        try {
          list = await d.store.get()
        } catch (e) {
          return fail('save-failed', { error: errorCode(e) })
        }
        // 다른 이름으로 저장: 이름·별칭이 같은 워크스페이스가 있으면 그것을 다시 저장(파일을 바꾸는 줄 안에서 찾는다)
        let target: Workspace | undefined
        if (what.kind === 'recapture') {
          target = list.find((w) => w.id === what.id)
          if (!target) return fail('missing')
        } else if (what.kind === 'as') {
          const key = compactOf(what.name)
          target = list.find((w) => compactOf(w.name) === key || w.aliases.some((a) => compactOf(a) === key))
          if (target) op = 'recapture'
        }

        let captured: ReturnType<typeof captureLayout>
        try {
          const snap = d.snapshot()
          captured = captureLayout({ windows: snap.windows, monitors: snap.monitors, toDip: d.toDip, newId: d.newId })
        } catch (e) {
          return fail('native-unavailable', { error: errorText(e) })
        }
        const { fingerprint, layout, skipped } = captured
        const counts = { windows: layout.windows.length, ...skipped, monitors: layout.monitors.length }
        if (counts.windows === 0) return fail('no-windows', counts)

        const updatedAt = d.now().toISOString()
        let next: Workspace
        let nextList: Workspace[]
        let autoNamed = false
        if (target) {
          // 이름·별칭·단축키는 그대로, 배치는 지금 구성 하나(Should 8 전까지 배치는 하나)
          const id = target.id
          next = { ...target, layouts: { [fingerprint]: layout }, updatedAt }
          nextList = list.map((w) => (w.id === id ? next : w))
        } else {
          if (list.length >= WORKSPACE_LIMITS.workspaces) return fail('limit', counts)
          const wanted = what.kind === 'recapture' ? undefined : what.name
          const name = wanted?.trim().slice(0, WORKSPACE_LIMITS.name).trim()
          autoNamed = !name
          next = { id: d.newId(), name: name || nextWorkspaceName(list), aliases: [], hotkey: null, layouts: { [fingerprint]: layout }, updatedAt }
          nextList = [...list, next]
        }
        try {
          await commit(nextList)
        } catch (e) {
          return fail('save-failed', { ...counts, error: errorCode(e) })
        }
        // 이름 없이 저장했으면('배치 N') 이름·단축키를 바꾸는 곳(설정)을 함께 알린다
        if (!quiet) d.notify(saveSummary({ name: next.name, windows: counts.windows, skipped, renameHint: autoNamed }))
        d.log('workspace.save', { op, source, ok: true, id: next.id, ...counts })
        return { ok: true, id: next.id, name: next.name, windows: counts.windows, skipped }
      })
    } finally {
      busy = null
    }
  }

  async function run(id: string, source: WorkspaceSource): Promise<WorkspaceRunResult> {
    const fail = (reason: WorkspaceFailReason | 'empty', extra: Record<string, unknown> = {}): WorkspaceRunResult => {
      d.notify(reason === 'empty' ? NOTES.empty : FAIL_MESSAGE[reason])
      d.log('workspace.restore', { source, ok: false, reason, ...extra })
      return { ok: false, reason }
    }
    const blocked = gate('run', source)
    if (blocked) return fail(blocked)
    busy = 'run'
    try {
      const ws = (await safeList()).find((w) => w.id === id)
      if (!ws) return fail('missing')
      const plan = (gather: boolean): RestorePlan => {
        const snap = d.snapshot()
        return planRestore({ workspace: ws, monitors: snap.monitors, windows: snap.windows, gather, selfElevated: d.selfElevated() })
      }
      let p: RestorePlan
      try {
        p = plan(false)
      } catch (e) {
        return fail('native-unavailable', { error: errorText(e) })
      }
      if (p.kind === 'needs-gather') {
        // 다른 모니터 구성(설계 §11): 먼저 묻고, 거절하면 아무 창도 옮기지 않는다
        let accepted = false
        try {
          accepted = await d.confirmGather({ savedMonitors: p.savedMonitors, currentMonitors: p.currentMonitors })
        } catch (e) {
          d.log('workspace.gatherError', { error: errorText(e) })
        }
        d.log('workspace.gather', { source, accepted, savedMonitors: p.savedMonitors, currentMonitors: p.currentMonitors })
        if (!accepted) return { ok: false, reason: 'cancelled' }
        // 묻는 동안 창·모니터가 바뀌었을 수 있으므로 다시 읽어 계획한다
        try {
          p = plan(true)
        } catch (e) {
          return fail('native-unavailable', { error: errorText(e) })
        }
      }
      if (p.kind !== 'ready') return fail('empty')

      let report: RestoreReport
      try {
        report = await d.runner.run(p)
      } catch (e) {
        return fail('native-unavailable', { error: errorText(e) })
      }
      d.notify(restoreSummary(ws.name, report))
      const counts = Object.fromEntries(OUTCOMES.map((r) => [r, report.outcomes.filter((o) => o.result === r).length]))
      d.log('workspace.restore', {
        source,
        ok: true,
        id,
        total: report.total,
        placed: report.placed,
        ...counts,
        gathered: report.gathered,
        maxDiff: report.maxDiff,
        ms: report.ms,
        restoredFocus: report.restoredFocus
      })
      return { ok: true, report }
    } finally {
      busy = null
    }
  }

  /** 지금 모니터 구성 지문(Electron screen). 읽지 못하면 null(모두 다른 구성으로 보인다) */
  function currentFingerprint(): string | null {
    try {
      return monitorFingerprint(d.monitors())
    } catch (e) {
      d.log('workspace.monitorsError', { error: errorText(e) })
      return null
    }
  }

  /** 설정 창이 그리는 워크스페이스 하나: 같은 구성인지, 저장한 단축키를 지금 잡고 있는지 */
  function viewOf(ws: Workspace, fingerprint: string | null): WorkspaceView {
    const bound = ws.hotkey === null ? undefined : d.hotkeyBound?.(ws.id)
    return {
      workspace: ws,
      sameConfig: fingerprint !== null && Object.hasOwn(ws.layouts, fingerprint),
      hotkeyRegistered: ws.hotkey !== null && bound !== undefined && sameAccelerator(bound, ws.hotkey)
    }
  }

  return {
    list: safeList,

    async view(id) {
      const ws = (await safeList()).find((w) => w.id === id)
      return ws ? viewOf(ws, currentFingerprint()) : null
    },

    async listView() {
      const list = await safeList()
      const fingerprint = currentFingerprint()
      const sorted = [...list].sort((a, b) => updatedTime(b) - updatedTime(a))
      return { items: sorted.map((ws) => viewOf(ws, fingerprint)), canControl: d.nativeOk() }
    },

    saveNew: (o) => save({ kind: 'new', name: o.name }, o.source, o.quiet === true),
    recapture: (id, o) => save({ kind: 'recapture', id }, o.source, o.quiet === true),
    saveAs: (name, source) => {
      const wanted = name.trim()
      return save(wanted ? { kind: 'as', name: wanted } : { kind: 'new' }, source, false)
    },
    run,

    edit: (id, edit) =>
      serial(async (): Promise<WorkspaceEditResult> => {
        let list: Workspace[]
        try {
          list = await d.store.get()
        } catch (e) {
          d.log('workspace.edit', { id, ok: false, error: errorCode(e) })
          return { ok: false, errors: [NOTES.saveFailed] }
        }
        const ws = list.find((w) => w.id === id)
        if (!ws) return { ok: false, errors: [NOTES.missing] }
        const r = applyWorkspaceEdit(ws, edit, list.filter((w) => w.id !== id), d.now())
        if (!r.ok) {
          d.log('workspace.edit', { id, ok: false, errors: r.errors.length })
          return r
        }
        try {
          await commit(list.map((w) => (w.id === id ? r.workspace : w)))
        } catch (e) {
          d.log('workspace.edit', { id, ok: false, error: errorCode(e) })
          return { ok: false, errors: [NOTES.saveFailed] }
        }
        const rules = Object.values(r.workspace.layouts)[0]?.windows ?? []
        d.log('workspace.edit', { id, ok: true, rules: rules.length, enabled: rules.filter((w) => w.enabled).length, aliases: r.workspace.aliases.length })
        return r
      }),

    remove: (id) =>
      serial(async () => {
        try {
          const list = await d.store.get()
          if (!list.some((w) => w.id === id)) return false
          await commit(list.filter((w) => w.id !== id))
        } catch (e) {
          d.log('workspace.remove', { id, ok: false, error: errorCode(e) })
          return false
        }
        d.log('workspace.remove', { id, ok: true })
        return true
      }),

    setHotkey: (id, hotkey) =>
      serial(async () => {
        if (hotkey !== null && (hotkey.length === 0 || hotkey.length > 40)) return false
        try {
          const list = await d.store.get()
          const ws = list.find((w) => w.id === id)
          if (!ws) return false
          if (ws.hotkey === hotkey) return true
          await commit(list.map((w) => (w.id === id ? { ...w, hotkey } : w)))
          return true
        } catch (e) {
          d.log('workspace.hotkeySaveError', { id, error: errorCode(e) })
          return false
        }
      }),

    onChange(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    }
  }
}
