import { afterEach, describe, expect, it } from 'vitest'
import type { MonitorInfo, WindowInfo } from '../../shared/types'
import type { CaptureSkipped } from '../../shared/workspace/capture'
import { HIDE_WORKSPACE_ID, HIDE_WORKSPACE_NAME, withHideWorkspace } from '../../shared/workspace/builtin'
import { EDIT_ERRORS } from '../../shared/workspace/edit'
import type { PressDecision } from '../../shared/workspace/hide'
import { hideSummary, restoreSummary, saveSummary, WORKSPACE_NOTES } from '../../shared/workspace/messages'
import { monitorFingerprint, monitorKey } from '../../shared/workspace/monitors'
import type { ReadyPlan } from '../../shared/workspace/restore-plan'
import type { RestoreReport } from '../../shared/workspace/restore-result'
import { L, P } from '../../shared/workspace/test-monitors'
import { TEST_WINDOWS, testWindow, testWorkspace, toDipPL } from '../../shared/workspace/test-workspaces'
import type { Workspace } from '../../shared/workspace/types'
import type { HideController } from './hide-runner'
import { createWorkspaceService, type WorkspaceServiceDeps, type WorkspaceSource } from './workspace-service'

const FP = monitorFingerprint([P, L])
const NOW = '2026-11-11T09:00:00.000Z'
const NONE: CaptureSkipped = { minimized: 0, excluded: 0, offscreen: 0, overLimit: 0 }

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.freeze(v)
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k])
  }
  return v
}

/** 가짜 runner의 결과: 계획의 건너뜀은 그대로, 나머지는 모두 배치 */
const reportOf = (plan: ReadyPlan): RestoreReport => ({
  total: plan.total,
  placed: plan.steps.length,
  outcomes: [
    ...plan.skipped.map((s) => ({ ruleId: s.ruleId, app: s.app, result: s.reason })),
    ...plan.steps.map((s) => ({ ruleId: s.ruleId, app: s.app, result: 'placed' as const }))
  ],
  gathered: plan.gathered,
  ms: 42,
  maxDiff: 3,
  restoredFocus: true,
  focusTarget: 'workspace'
})

interface World {
  list: Workspace[]
  saves: number
  failSave: boolean
  /** 있으면 저장마다 이것을 기다린다(동시에 보낸 저장 시험) */
  saveGate: Promise<void> | null
  native: boolean
  windows: WindowInfo[]
  monitors: MonitorInfo[]
  confirm: boolean
  /** 있으면 runner가 이것을 기다린다(한 번에 하나 시험) */
  hold: Promise<void> | null
  snapshots: number
  plans: ReadyPlan[]
  confirms: { savedMonitors: number; currentMonitors: number }[]
  notes: string[]
  logs: [string, Record<string, unknown>][]
  /** 지금 등록된 워크스페이스 단축키(워크스페이스 id → 조합) */
  bound: Map<string, string>
  /** restored를 부른 차례. after는 그때 마지막 로그 줄의 이름 */
  restored: { id: string; source: WorkspaceSource; after: string | undefined }[]
  restoredThrows: boolean
  /** runner에 넘긴 화면 감추기가 내린 창(정렬, 없으면 null) */
  runHidden: (string[] | null)[]
}

const worlds: World[] = []

/** 가짜 세계: 메모리 저장소(실제 캐시처럼 얼린 목록을 준다), 고정 snapshot, 계획을 기록하는 runner, 가짜 확인·시계 */
function world(
  o: Partial<Pick<World, 'list' | 'native' | 'windows' | 'monitors' | 'confirm'>> & { hide?: HideController; loadClean?: boolean } = {}
): { w: World; service: ReturnType<typeof createWorkspaceService> } {
  const w: World = {
    list: deepFreeze(o.list ?? []),
    saves: 0,
    failSave: false,
    saveGate: null,
    native: o.native ?? true,
    windows: o.windows ?? TEST_WINDOWS,
    monitors: o.monitors ?? [P, L],
    confirm: o.confirm ?? false,
    hold: null,
    snapshots: 0,
    plans: [],
    confirms: [],
    notes: [],
    logs: [],
    bound: new Map(),
    restored: [],
    restoredThrows: false,
    runHidden: []
  }
  worlds.push(w)
  let n = 0
  const deps: WorkspaceServiceDeps = {
    store: {
      get: async () => w.list,
      save: async (list) => {
        if (w.saveGate) await w.saveGate
        if (w.failSave) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
        w.list = deepFreeze(structuredClone(list))
        w.saves++
      }
    },
    nativeOk: () => w.native,
    snapshot: () => {
      w.snapshots++
      return { windows: w.windows, monitors: w.monitors }
    },
    monitors: () => w.monitors,
    toDip: toDipPL,
    selfElevated: () => false,
    runner: {
      run: async (plan, ro) => {
        w.plans.push(plan)
        w.runHidden.push(ro?.hidden ? [...ro.hidden].sort() : null)
        if (w.hold) await w.hold
        return reportOf(plan)
      }
    },
    hide: o.hide,
    loadClean: o.loadClean === undefined ? undefined : () => o.loadClean!,
    selfPid: 4242,
    confirmGather: async (c) => {
      w.confirms.push(c)
      return w.confirm
    },
    notify: (m) => void w.notes.push(m),
    newId: () => `id-${++n}`,
    now: () => new Date(NOW),
    log: (event, data) => void w.logs.push([event, data]),
    hotkeyBound: (id) => w.bound.get(id),
    restored: (id, source) => {
      w.restored.push({ id, source, after: w.logs.at(-1)?.[0] })
      if (w.restoredThrows) throw new Error('listener failed')
    }
  }
  return { w, service: createWorkspaceService(deps) }
}

// (Global Constraints) 로그에는 id·건수·시간만: 이름·별칭·창 제목이 없다
afterEach(() => {
  const json = JSON.stringify(worlds.map((w) => w.logs))
  worlds.length = 0
  for (const content of ['QA 모드', '가상자동차', 'XY방산', 'SureMate-WS-A', '배치 1', '보고서 모드', '회의 모드', '화면 감추기', '가상 메신저']) expect(json).not.toContain(content)
})

describe('지금 배치 저장(saveNew)', () => {
  it('지금 창을 새 워크스페이스로: 이름 배치 1, 배치 키는 지금 지문, 알림 한 번, onChange', async () => {
    const { w, service } = world()
    const changes: Workspace[][] = []
    service.onChange((list) => changes.push(list))
    const r = await service.saveNew({ source: 'palette' })
    expect(w.list).toHaveLength(1)
    const ws = w.list[0]
    expect(r).toEqual({ ok: true, id: ws.id, name: '배치 1', windows: 3, skipped: NONE })
    expect(ws).toMatchObject({ name: '배치 1', aliases: [], hotkey: null, updatedAt: NOW })
    expect(Object.keys(ws.layouts)).toEqual([FP])
    expect(ws.layouts[FP].windows.map((x) => [x.match.exe, x.match.titleIncludes ?? null, x.enabled])).toEqual([
      ['EXCEL.EXE', '가상자동차 보고서.xlsx', true],
      ['EXCEL.EXE', 'XY방산 예산.xlsx', true],
      ['notepad.exe', null, true]
    ])
    // 이름 없이 저장했으니 이름을 바꾸는 곳(설정)을 함께 알린다
    expect(w.notes).toEqual([saveSummary({ name: '배치 1', windows: 3, skipped: NONE, renameHint: true })])
    expect(changes).toEqual([w.list])
    expect(w.logs).toContainEqual([
      'workspace.save',
      expect.objectContaining({ source: 'palette', ok: true, windows: 3, minimized: 0, excluded: 0, offscreen: 0, monitors: 2 })
    ])

    const r2 = await service.saveNew({ source: 'bar' })
    expect(r2).toMatchObject({ ok: true, name: '배치 2' })
    expect(w.list.map((x) => x.name)).toEqual(['배치 1', '배치 2'])
    expect(new Set(w.list.map((x) => x.id)).size).toBe(2)
  })

  it('최소화한 창은 빼고 저장하고 알림에 그 수를 붙인다', async () => {
    const chrome = testWindow({ hwnd: '104', exe: 'chrome.exe', title: '가상자동차 사내 포털 - Chrome', minimized: true, frame: { x: -32000, y: -32000, width: 160, height: 28 } })
    const { w, service } = world({ windows: [...TEST_WINDOWS, chrome] })
    const skipped = { ...NONE, minimized: 1 }
    expect(await service.saveNew({ source: 'hotkey' })).toMatchObject({ ok: true, windows: 3, skipped })
    expect(w.notes).toEqual([saveSummary({ name: '배치 1', windows: 3, skipped, renameHint: true })])
  })

  it('quiet면 알리지 않는다(편집 화면이 결과를 보여 준다)', async () => {
    const { w, service } = world({ windows: [] })
    expect(await service.saveNew({ source: 'editor', quiet: true })).toEqual({ ok: false, reason: 'no-windows', message: WORKSPACE_NOTES.noWindows })
    expect((await service.saveNew({ source: 'editor', quiet: true, name: '회의 모드' })).ok).toBe(false)
    w.windows = TEST_WINDOWS
    expect(await service.saveNew({ source: 'editor', quiet: true, name: '회의 모드' })).toMatchObject({ ok: true, name: '회의 모드' })
    expect(w.notes).toEqual([])
  })

  it('Win32를 쓸 수 없으면 알리고 창 목록·파일을 건드리지 않는다(native-unavailable)', async () => {
    const { w, service } = world({ native: false, list: [testWorkspace()] })
    const before = w.list
    expect(await service.saveNew({ source: 'palette' })).toEqual({ ok: false, reason: 'native-unavailable', message: WORKSPACE_NOTES.nativeUnavailable })
    expect(await service.recapture('ws-qa', { source: 'palette' })).toMatchObject({ ok: false, reason: 'native-unavailable' })
    expect(await service.saveAs('QA 모드', 'palette')).toMatchObject({ ok: false, reason: 'native-unavailable' })
    expect(await service.run('ws-qa', 'hotkey')).toEqual({ ok: false, reason: 'native-unavailable' })
    expect(w.notes).toEqual(Array(4).fill(WORKSPACE_NOTES.nativeUnavailable))
    expect(w.snapshots).toBe(0)
    expect(w.saves).toBe(0)
    expect(w.plans).toEqual([])
    expect(w.list).toBe(before)
  })

  it('저장할 창이 없으면 no-windows(최소화·바탕 화면 창만 있을 때도)', async () => {
    const desktop = testWindow({ hwnd: '9', exe: 'explorer.exe', className: 'Progman', title: 'Program Manager', frame: { x: 0, y: 0, width: 1920, height: 1080 } })
    const minimized = testWindow({ hwnd: '8', exe: 'chrome.exe', title: 'Chrome', minimized: true, frame: { x: -32000, y: -32000, width: 160, height: 28 } })
    const { w, service } = world({ windows: [desktop, minimized] })
    expect(await service.saveNew({ source: 'palette' })).toEqual({ ok: false, reason: 'no-windows', message: WORKSPACE_NOTES.noWindows })
    expect(w.saves).toBe(0)
    expect(w.notes).toEqual([WORKSPACE_NOTES.noWindows])
    expect(w.logs).toContainEqual(['workspace.save', expect.objectContaining({ ok: false, reason: 'no-windows', windows: 0, minimized: 1, excluded: 1 })])
  })

  it('이미 30개면 limit', async () => {
    const list = Array.from({ length: 30 }, (_, i) => testWorkspace({ id: `ws-${i}`, name: `가상 ${i}` }))
    const { w, service } = world({ list })
    expect(await service.saveNew({ source: 'palette' })).toEqual({ ok: false, reason: 'limit', message: WORKSPACE_NOTES.limit })
    expect(w.saves).toBe(0)
    expect(w.notes).toEqual([WORKSPACE_NOTES.limit])
  })

  it('파일을 저장하지 못하면 save-failed를 알리고 목록·onChange는 그대로', async () => {
    const { w, service } = world()
    const changes: Workspace[][] = []
    service.onChange((list) => changes.push(list))
    w.failSave = true
    expect(await service.saveNew({ source: 'palette' })).toEqual({ ok: false, reason: 'save-failed', message: WORKSPACE_NOTES.saveFailed })
    expect(w.list).toEqual([])
    expect(changes).toEqual([])
    expect(w.notes).toEqual([WORKSPACE_NOTES.saveFailed])
    expect(w.logs).toContainEqual(['workspace.save', expect.objectContaining({ ok: false, reason: 'save-failed', error: 'ENOSPC' })])
  })
})

describe('다른 이름으로 저장(saveAs)·다시 저장(recapture)', () => {
  it('saveAs: 같은 이름이 없으면 그 이름으로 새로 저장', async () => {
    const { w, service } = world({ list: [testWorkspace({ id: 'ws-meet', name: '회의 모드', aliases: [] })] })
    expect(await service.saveAs('QA 모드', 'palette')).toMatchObject({ ok: true, name: 'QA 모드', windows: 3 })
    expect(w.list.map((x) => x.name)).toEqual(['회의 모드', 'QA 모드'])
    expect(w.notes).toEqual([saveSummary({ name: 'QA 모드', windows: 3, skipped: NONE })])
  })

  it("saveAs: 'QA 모드'가 있을 때 'qa 모드'(compactOf가 같음)는 그 워크스페이스를 다시 저장(개수·이름 그대로)", async () => {
    const { w, service } = world({ list: [testWorkspace({ hotkey: 'Ctrl+Alt+1', updatedAt: '2026-11-01T00:00:00.000Z' })] })
    expect(await service.saveAs('qa 모드', 'palette')).toMatchObject({ ok: true, id: 'ws-qa', name: 'QA 모드', windows: 3 })
    expect(w.list).toHaveLength(1)
    expect(w.list[0]).toMatchObject({ id: 'ws-qa', name: 'QA 모드', aliases: ['qa'], hotkey: 'Ctrl+Alt+1', updatedAt: NOW })
    // 별칭으로 쳐도 같은 워크스페이스
    expect(await service.saveAs(' QA ', 'palette')).toMatchObject({ ok: true, id: 'ws-qa' })
    expect(w.list).toHaveLength(1)
    expect(w.notes).toEqual(Array(2).fill(saveSummary({ name: 'QA 모드', windows: 3, skipped: NONE })))
  })

  it('saveAs: quiet면 새로 저장·다시 저장·실패 모두 알리지 않는다(saveNew·recapture와 같다)', async () => {
    const { w, service } = world({ list: [testWorkspace({ id: 'ws-meet', name: '회의 모드', aliases: [] })] })
    expect(await service.saveAs('QA 모드', 'onboarding', { quiet: true })).toMatchObject({ ok: true, name: 'QA 모드', windows: 3 })
    expect(await service.saveAs('회의모드', 'onboarding', { quiet: true })).toMatchObject({ ok: true, id: 'ws-meet', name: '회의 모드' })
    w.windows = []
    expect(await service.saveAs('QA 모드', 'onboarding', { quiet: true })).toEqual({ ok: false, reason: 'no-windows', message: WORKSPACE_NOTES.noWindows })
    expect(w.notes).toEqual([])
    expect(w.list.map((x) => x.name)).toEqual(['회의 모드', 'QA 모드'])
    expect(w.logs).toContainEqual(['workspace.save', expect.objectContaining({ op: 'new', source: 'onboarding', ok: true })])
    expect(w.logs).toContainEqual(['workspace.save', expect.objectContaining({ op: 'recapture', source: 'onboarding', ok: true, id: 'ws-meet' })])
    // quiet가 아니면 전처럼 알린다
    w.windows = TEST_WINDOWS
    expect((await service.saveAs('QA 모드', 'palette', { quiet: false })).ok).toBe(true)
    expect(w.notes).toEqual([saveSummary({ name: 'QA 모드', windows: 3, skipped: NONE })])
  })

  it('recapture: 이름·별칭·단축키는 그대로이고 배치는 지금 지문 하나(새 규칙은 모두 켜짐)', async () => {
    const old = testWorkspace({ hotkey: 'Ctrl+Alt+1' })
    const layout = old.layouts[FP]
    old.layouts = {
      '1|1280x720@100:0,0': structuredClone(layout),
      [FP]: { ...layout, windows: layout.windows.map((x, i) => (i === 0 ? { ...x, enabled: false } : x)) }
    }
    const { w, service } = world({ list: [old, testWorkspace({ id: 'ws-meet', name: '회의 모드' })] })
    const r = await service.recapture('ws-qa', { source: 'editor', quiet: true })
    expect(r).toEqual({ ok: true, id: 'ws-qa', name: 'QA 모드', windows: 3, skipped: NONE })
    const ws = w.list[0]
    expect(ws).toMatchObject({ id: 'ws-qa', name: 'QA 모드', aliases: ['qa'], hotkey: 'Ctrl+Alt+1', updatedAt: NOW })
    expect(Object.keys(ws.layouts)).toEqual([FP])
    expect(ws.layouts[FP].windows.every((x) => x.enabled)).toBe(true)
    expect(w.list[1].id).toBe('ws-meet')
    expect(w.notes).toEqual([])
  })

  it('recapture: 없는 id는 missing(quiet가 아니면 알림)', async () => {
    const { w, service } = world()
    expect(await service.recapture('nope', { source: 'palette' })).toEqual({ ok: false, reason: 'missing', message: WORKSPACE_NOTES.missing })
    expect(w.notes).toEqual([WORKSPACE_NOTES.missing])
    expect(w.snapshots).toBe(0)
  })
})

describe('불러오기(run)', () => {
  it('같은 구성: 계획(ready)을 runner에 한 번 넘기고 결과를 알린다', async () => {
    const { w, service } = world({ list: [testWorkspace()] })
    const r = await service.run('ws-qa', 'palette')
    expect(w.plans).toHaveLength(1)
    const plan = w.plans[0]
    expect(plan).toMatchObject({ kind: 'ready', gathered: false, total: 3, skipped: [] })
    expect(plan.steps.map((s) => s.hwnd).sort()).toEqual(['101', '102', '103'])
    expect(r).toEqual({ ok: true, report: reportOf(plan) })
    expect(w.notes).toEqual([restoreSummary('QA 모드', reportOf(plan))])
    expect(w.confirms).toEqual([])
    expect(w.logs).toContainEqual([
      'workspace.restore',
      expect.objectContaining({ source: 'palette', total: 3, placed: 3, missing: 0, elevated: 0, hung: 0, blocked: 0, failed: 0, off: 0, timeout: 0, gathered: false, maxDiff: 3, ms: 42, restoredFocus: true, focusTarget: 'workspace' })
    ])
  })

  it('못 찾은 창은 계획의 건너뜀으로 결과에 들어간다', async () => {
    const { w, service } = world({ list: [testWorkspace()], windows: TEST_WINDOWS.slice(1) })
    const r = await service.run('ws-qa', 'bar')
    expect(r.ok && r.report.outcomes.filter((x) => x.result === 'missing')).toHaveLength(1)
    expect(w.notes[0]).toBe('QA 모드 · 창 3개 중 2개 배치 · Excel 못 찾음')
    expect(w.logs).toContainEqual(['workspace.restore', expect.objectContaining({ total: 3, placed: 2, missing: 1 })])
  })

  it('(Review Focus 3) 다른 구성이면 먼저 묻는다: 거절하면 아무 창도 옮기지 않고, 수락하면 주 모니터로 모은다', async () => {
    const { w, service } = world({ list: [testWorkspace()], monitors: [P] })
    expect(await service.run('ws-qa', 'bar')).toEqual({ ok: false, reason: 'cancelled' })
    expect(w.confirms).toEqual([{ savedMonitors: 2, currentMonitors: 1 }])
    expect(w.plans).toEqual([])
    expect(w.notes).toEqual([])
    expect(w.logs).toContainEqual(['workspace.gather', expect.objectContaining({ accepted: false })])

    w.confirm = true
    const r = await service.run('ws-qa', 'bar')
    expect(r.ok).toBe(true)
    expect(w.plans).toHaveLength(1)
    expect(w.plans[0].gathered).toBe(true)
    expect(w.plans[0].steps.every((s) => s.target.x >= 0)).toBe(true)
    expect(w.logs).toContainEqual(['workspace.gather', expect.objectContaining({ accepted: true })])
    expect(w.notes).toEqual([restoreSummary('QA 모드', reportOf(w.plans[0]))])
    expect(w.notes[0]).toMatch(/^주 모니터로 모았어요 · /)
  })

  it('없는 id는 missing, 켜진 창이 없으면 empty를 알린다', async () => {
    const off = testWorkspace({ id: 'ws-off' })
    off.layouts[FP] = { ...off.layouts[FP], windows: off.layouts[FP].windows.map((x) => ({ ...x, enabled: false })) }
    const { w, service } = world({ list: [off] })
    expect(await service.run('nope', 'hotkey')).toEqual({ ok: false, reason: 'missing' })
    expect(await service.run('ws-off', 'hotkey')).toEqual({ ok: false, reason: 'empty' })
    expect(w.notes).toEqual([WORKSPACE_NOTES.missing, WORKSPACE_NOTES.empty])
    expect(w.plans).toEqual([])
  })

  it('한 번에 하나: 첫 불러오기가 끝나기 전의 두 번째 요청(저장 포함)은 busy를 알리고 runner는 한 번', async () => {
    const { w, service } = world({ list: [testWorkspace()] })
    let release!: () => void
    w.hold = new Promise((resolve) => (release = resolve))
    const first = service.run('ws-qa', 'hotkey')
    expect(await service.run('ws-qa', 'hotkey')).toEqual({ ok: false, reason: 'busy' })
    expect(await service.saveNew({ source: 'palette' })).toEqual({ ok: false, reason: 'busy', message: WORKSPACE_NOTES.busy })
    expect(await service.recapture('ws-qa', { source: 'palette' })).toMatchObject({ ok: false, reason: 'busy' })
    expect(w.notes).toEqual(Array(3).fill(WORKSPACE_NOTES.busy))
    expect(w.logs).toContainEqual(['workspace.busy', expect.objectContaining({ op: 'run' })])
    release()
    expect((await first).ok).toBe(true)
    expect(w.plans).toHaveLength(1)
    // 끝난 뒤에는 다시 된다
    expect((await service.run('ws-qa', 'hotkey')).ok).toBe(true)
    expect(w.plans).toHaveLength(2)
  })

  it('저장하는 동안의 불러오기도 busy', async () => {
    const { w, service } = world({ list: [testWorkspace()] })
    let open!: () => void
    w.saveGate = new Promise((resolve) => (open = resolve))
    const saving = service.saveNew({ source: 'palette' })
    expect(await service.run('ws-qa', 'palette')).toEqual({ ok: false, reason: 'busy' })
    open()
    expect((await saving).ok).toBe(true)
    expect(w.plans).toEqual([])
  })
})

describe('불러오기를 마쳤다고 알리기(restored)', () => {
  it('불러오기가 성공하면 결과 로그(workspace.restore) 뒤에 그 id·부른 곳으로 한 번 부른다', async () => {
    const { w, service } = world({ list: [testWorkspace()] })
    expect((await service.run('ws-qa', 'onboarding')).ok).toBe(true)
    expect(w.restored).toEqual([{ id: 'ws-qa', source: 'onboarding', after: 'workspace.restore' }])
    expect(w.logs).toContainEqual(['workspace.restore', expect.objectContaining({ source: 'onboarding', ok: true, id: 'ws-qa' })])
    expect((await service.run('ws-qa', 'hotkey')).ok).toBe(true)
    expect(w.restored.map((r) => r.source)).toEqual(['onboarding', 'hotkey'])
  })

  it('불러오지 않았으면(없는 id·켜진 창 없음·다른 구성에서 취소·Win32 없음·busy) 부르지 않는다', async () => {
    const off = testWorkspace({ id: 'ws-off' })
    off.layouts[FP] = { ...off.layouts[FP], windows: off.layouts[FP].windows.map((x) => ({ ...x, enabled: false })) }
    const { w, service } = world({ list: [testWorkspace(), off] })
    expect(await service.run('nope', 'hotkey')).toEqual({ ok: false, reason: 'missing' })
    expect(await service.run('ws-off', 'hotkey')).toEqual({ ok: false, reason: 'empty' })
    w.monitors = [P]
    expect(await service.run('ws-qa', 'hotkey')).toEqual({ ok: false, reason: 'cancelled' })
    w.monitors = [P, L]
    w.native = false
    expect(await service.run('ws-qa', 'hotkey')).toEqual({ ok: false, reason: 'native-unavailable' })
    w.native = true
    let release!: () => void
    w.hold = new Promise((resolve) => (release = resolve))
    const first = service.run('ws-qa', 'palette')
    expect(await service.run('ws-qa', 'hotkey')).toEqual({ ok: false, reason: 'busy' })
    expect(w.restored).toEqual([])
    release()
    expect((await first).ok).toBe(true)
    expect(w.restored).toEqual([{ id: 'ws-qa', source: 'palette', after: 'workspace.restore' }])
  })

  it('restored가 던져도 불러오기 결과는 그대로이고 workspace.listenerError로 남긴다(다음 불러오기도 된다)', async () => {
    const { w, service } = world({ list: [testWorkspace()] })
    w.restoredThrows = true
    expect(await service.run('ws-qa', 'editor')).toEqual({ ok: true, report: reportOf(w.plans[0]) })
    expect(w.logs).toContainEqual(['workspace.listenerError', { error: 'listener failed' }])
    expect((await service.run('ws-qa', 'editor')).ok).toBe(true)
    expect(w.restored).toHaveLength(2)
  })
})

describe('편집·지우기·단축키(파일만 바꾸므로 Win32 없이도 된다)', () => {
  const meet = (): Workspace => testWorkspace({ id: 'ws-meet', name: '회의 모드', aliases: [], updatedAt: '2026-11-09T00:00:00.000Z' })

  it('edit: 적용해 저장하고 onChange, 오류·없는 id면 저장하지 않는다', async () => {
    const { w, service } = world({ list: [testWorkspace(), meet()], native: false })
    const changes: Workspace[][] = []
    service.onChange((list) => changes.push(list))
    const r = await service.edit('ws-qa', {
      name: '보고서 모드',
      aliases: ['보고', 'report'],
      rules: [{ id: 'r1', enabled: false, titleIncludes: null, monitor: monitorKey(P) }]
    })
    expect(r.ok).toBe(true)
    expect(w.list[0]).toMatchObject({ id: 'ws-qa', name: '보고서 모드', aliases: ['보고', 'report'], updatedAt: NOW })
    expect(r.ok && r.workspace).toEqual(w.list[0])
    expect(changes).toEqual([w.list])
    expect(w.logs).toContainEqual(['workspace.edit', expect.objectContaining({ rules: 3, enabled: 2, aliases: 2 })])

    const saves = w.saves
    expect(await service.edit('ws-qa', { name: '회의모드', aliases: [], rules: [] })).toEqual({ ok: false, errors: [EDIT_ERRORS.nameTaken] })
    expect(await service.edit('nope', { name: '가상 모드', aliases: [], rules: [] })).toEqual({ ok: false, errors: [WORKSPACE_NOTES.missing] })
    w.failSave = true
    expect(await service.edit('ws-qa', { name: '가상 모드', aliases: [], rules: [] })).toEqual({ ok: false, errors: [WORKSPACE_NOTES.saveFailed] })
    expect(w.saves).toBe(saves)
    expect(changes).toHaveLength(1)
    expect(w.notes).toEqual([])
  })

  it('remove: 지우고 onChange, 없는 id는 false', async () => {
    const { w, service } = world({ list: [testWorkspace(), meet()], native: false })
    const changes: Workspace[][] = []
    service.onChange((list) => changes.push(list))
    expect(await service.remove('ws-qa')).toBe(true)
    expect(w.list.map((x) => x.id)).toEqual(['ws-meet'])
    expect(changes).toEqual([w.list])
    expect(w.logs).toContainEqual(['workspace.remove', expect.anything()])
    expect(await service.remove('ws-qa')).toBe(false)
    expect(changes).toHaveLength(1)
  })

  it('setHotkey: 저장하고 onChange, null은 해제, 없는 id는 false', async () => {
    const { w, service } = world({ list: [testWorkspace(), meet()], native: false })
    const changes: Workspace[][] = []
    const off = service.onChange((list) => changes.push(list))
    expect(await service.setHotkey('ws-meet', 'Ctrl+Alt+2')).toBe(true)
    expect(w.list[1].hotkey).toBe('Ctrl+Alt+2')
    expect(changes).toEqual([w.list])
    expect(await service.setHotkey('ws-meet', null)).toBe(true)
    expect(w.list[1].hotkey).toBeNull()
    expect(changes).toHaveLength(2)
    expect(await service.setHotkey('nope', 'Ctrl+Alt+3')).toBe(false)
    off()
    expect(await service.setHotkey('ws-qa', 'Ctrl+Alt+4')).toBe(true)
    expect(changes).toHaveLength(2)
  })
})

describe('파일 쓰기는 한 줄로(읽고 고치고 저장하는 사이에 다른 저장이 끼지 않는다)', () => {
  it('동시에 보낸 편집·단축키·새 저장이 서로의 변경을 덮지 않는다', async () => {
    const { w, service } = world({ list: [testWorkspace()] })
    let open!: () => void
    w.saveGate = new Promise((resolve) => (open = resolve))
    const all = Promise.all([
      service.edit('ws-qa', { name: '보고서 모드', aliases: ['qa'], rules: [] }),
      service.setHotkey('ws-qa', 'Ctrl+Alt+1'),
      service.saveNew({ source: 'bar' })
    ])
    open()
    const [edited, hotkey, saved] = await all
    expect([edited.ok, hotkey, saved.ok]).toEqual([true, true, true])
    expect(w.list.map((x) => [x.name, x.hotkey])).toEqual([
      ['보고서 모드', 'Ctrl+Alt+1'],
      ['배치 1', null]
    ])
    expect(w.saves).toBe(3)
  })
})

describe('보기(view)·목록(list)', () => {
  it('지금 구성과 같은지·단축키가 등록됐는지 함께 돌려주고 없는 id는 null(Win32 없이, 창 목록을 읽지 않는다)', async () => {
    const { w, service } = world({ list: [testWorkspace()], native: false })
    expect(await service.view('ws-qa')).toEqual({ workspace: w.list[0], sameConfig: true, hotkeyRegistered: false })
    w.monitors = [P]
    expect(await service.view('ws-qa')).toEqual({ workspace: w.list[0], sameConfig: false, hotkeyRegistered: false })
    expect(await service.view('nope')).toBeNull()
    expect(await service.list()).toBe(w.list)
    expect(w.snapshots).toBe(0)
  })

  it('단축키 등록: 저장한 조합이 지금 등록된 조합과 같을 때만(보조키 순서·대소문자는 따지지 않는다)', async () => {
    const { w, service } = world({ list: [testWorkspace({ hotkey: 'Ctrl+Alt+1' })] })
    expect((await service.view('ws-qa'))?.hotkeyRegistered).toBe(false)
    w.bound.set('ws-qa', 'alt+ctrl+1')
    expect((await service.view('ws-qa'))?.hotkeyRegistered).toBe(true)
    // 다른 조합이 남아 있으면(바꾸다 실패) 등록 못 함
    w.bound.set('ws-qa', 'Ctrl+Alt+2')
    expect((await service.view('ws-qa'))?.hotkeyRegistered).toBe(false)
    // 조합이 없으면 등록할 것도 없다
    w.list = deepFreeze([testWorkspace({ hotkey: null })])
    expect((await service.view('ws-qa'))?.hotkeyRegistered).toBe(false)
  })

  it('설정 창 목록(listView): 최근에 바꾼 순서, 항목마다 같은 구성·단축키 등록, 창 제어를 쓸 수 있는지', async () => {
    const a = testWorkspace({ id: 'ws-a', name: '가상 A', updatedAt: '2026-11-09T00:00:00.000Z' })
    const b = testWorkspace({ id: 'ws-b', name: '가상 B', hotkey: 'Ctrl+Alt+2', updatedAt: '2026-11-11T00:00:00.000Z' })
    const { w, service } = world({ list: [a, b], native: false })
    w.bound.set('ws-b', 'Ctrl+Alt+2')
    expect(await service.listView()).toEqual({
      items: [
        { workspace: w.list[1], sameConfig: true, hotkeyRegistered: true },
        { workspace: w.list[0], sameConfig: true, hotkeyRegistered: false }
      ],
      canControl: false
    })
    w.native = true
    w.monitors = [P]
    const v = await service.listView()
    expect(v.canControl).toBe(true)
    expect(v.items.map((i) => [i.workspace.id, i.sameConfig])).toEqual([
      ['ws-b', false],
      ['ws-a', false]
    ])
    // 창 목록은 읽지 않는다(설정 창을 여는 것만으로 Win32를 부르지 않게)
    expect(w.snapshots).toBe(0)
  })

  it('목록을 읽지 못하면 빈 목록(설정 창은 빈 화면 안내)', async () => {
    const { service } = world()
    const broken = createWorkspaceService({
      ...({} as WorkspaceServiceDeps),
      store: { get: async () => Promise.reject(new Error('EACCES')), save: async () => {} },
      nativeOk: () => true,
      monitors: () => [P],
      log: () => {}
    })
    expect(await broken.listView()).toEqual({ items: [], canControl: true })
    expect(await service.listView()).toEqual({ items: [], canControl: true })
  })
})

// ── 기본 워크스페이스 '화면 감추기'(2026-11-12 사용자 결정) ─────────────────────────────────────────────

/** 다른 앱 창(가상): 메신저(맨 위, 감추기 직전 앞 창)와 Word */
const CHAT = testWindow({ hwnd: '201', exe: 'chat.exe', title: '가상 메신저', frame: { x: 100, y: 100, width: 400, height: 600 } })
const WORD = testWindow({ hwnd: '202', exe: 'WINWORD.EXE', title: 'XY방산 회의록.docx - Word', maximized: true, frame: { x: 0, y: 0, width: 1920, height: 1040 } })
/** 저장한 창이 없는(처음 만든) 화면 감추기 */
const hideEmpty = (): Workspace => withHideWorkspace([], { now: new Date(NOW), hotkey: 'Ctrl+Alt+H' }).list[0]
/** 시험 창 3개(101~103)를 저장한 화면 감추기 */
const hideSaved = (o: Partial<Workspace> = {}): Workspace => ({ ...testWorkspace({ id: HIDE_WORKSPACE_ID, name: HIDE_WORKSPACE_NAME, aliases: [] }), ...o })

/** 부른 차례를 남기는 가짜 화면 감추기(내리기는 모두 성공, 되돌리기도 모두 성공) */
function fakeHide(o: { decide?: PressDecision; front?: string | null; topmost?: string[] } = {}): { hide: HideController; calls: string[] } {
  const calls: string[] = []
  const hide: HideController = {
    front: () => (o.front === undefined ? '201' : o.front),
    focusDesktop: () => {
      calls.push('desktop')
      return true
    },
    decide: () => o.decide ?? { kind: 'hide', why: 'first', carry: [] },
    hide: async (x) => {
      calls.push(`hide:${x.targets.map((t) => t.hwnd).join(',')}|front:${x.front}|carry:${x.carry.length}`)
      return { minimized: x.targets.length, elevated: 0, hung: 0, failed: 0, hidden: new Set(x.targets.map((t) => t.hwnd)) }
    },
    unhide: async (d) => {
      calls.push(`unhide:${d.windows.map((x) => x.hwnd).join(',')}|focus:${d.focus}`)
      return { restored: d.windows.length, skipped: 0, focused: true }
    },
    restorable: () => 3,
    topmost: (hs) => new Set([...hs].filter((h) => (o.topmost ?? []).includes(h))),
    pin: (hs, keep) => {
      calls.push(`pin:${hs.join(',')}|keep:${[...keep].sort().join(',')}`)
      return hs.length
    },
    release: (t) => void calls.push(`release:${t}`)
  }
  return { hide, calls }
}

describe('기본 워크스페이스 만들기(ensureBuiltin)·지우기 거절·목록 차례', () => {
  it('없으면 맨 앞에 만들고 그때만 단축키를 정한다(검사 함수를 한 번 부른다). 있으면 다시 만들지 않는다', async () => {
    const { w, service } = world({ list: [testWorkspace()], loadClean: true })
    let asked = 0
    expect(await service.ensureBuiltin({ hotkey: () => (asked++, 'Ctrl+Alt+H') })).toBe(true)
    expect(w.list.map((x) => x.id)).toEqual([HIDE_WORKSPACE_ID, 'ws-qa'])
    expect(w.list[0]).toMatchObject({ name: HIDE_WORKSPACE_NAME, hotkey: 'Ctrl+Alt+H', layouts: {} })
    expect(await service.ensureBuiltin({ hotkey: () => (asked++, null) })).toBe(false)
    expect(asked).toBe(1)
    expect(w.saves).toBe(1)
    expect(w.logs).toContainEqual(['workspace.builtin', { created: true, hotkey: true }])
  })

  it('파일을 읽을 때 문제가 있었으면(깨짐·일부 건너뜀) 만들지 않는다(사본을 남기기 전에 자동으로 덮어쓰지 않게)', async () => {
    const { w, service } = world({ loadClean: false })
    expect(await service.ensureBuiltin({ hotkey: () => 'Ctrl+Alt+H' })).toBe(false)
    expect(w.saves).toBe(0)
    expect(w.logs).toContainEqual(['workspace.builtin', { created: false, reason: 'load-errors' }])
  })

  it('지우기를 거절한다(파일 그대로, 까닭 builtin)', async () => {
    const { w, service } = world({ list: [hideEmpty(), testWorkspace()] })
    expect(await service.remove(HIDE_WORKSPACE_ID)).toBe(false)
    expect(w.saves).toBe(0)
    expect(w.list).toHaveLength(2)
    expect(w.logs).toContainEqual(['workspace.remove', { id: HIDE_WORKSPACE_ID, ok: false, reason: 'builtin' }])
  })

  it('30개 제한은 사용자 워크스페이스만 센다(기본 + 29개면 저장, 기본 + 30개면 limit)', async () => {
    const users = (n: number): Workspace[] => Array.from({ length: n }, (_, i) => testWorkspace({ id: `ws-${i}`, name: `가상 ${i}` }))
    expect((await world({ list: [hideEmpty(), ...users(29)] }).service.saveNew({ source: 'palette' })).ok).toBe(true)
    expect(await world({ list: [hideEmpty(), ...users(30)] }).service.saveNew({ source: 'palette' })).toMatchObject({ ok: false, reason: 'limit' })
  })

  it('설정 창 목록은 기본 워크스페이스를 맨 앞에(나머지는 최근에 바꾼 순서), 되돌릴 창 수를 함께 준다', async () => {
    const { hide } = fakeHide()
    const old = { ...hideEmpty(), updatedAt: '2020-01-01T00:00:00.000Z' }
    const { service } = world({ list: [testWorkspace({ id: 'ws-a', updatedAt: '2026-11-10T00:00:00.000Z' }), old, testWorkspace({ id: 'ws-b', updatedAt: '2026-11-11T00:00:00.000Z' })], hide })
    const v = await service.listView()
    expect(v.items.map((i) => [i.workspace.id, i.restorable])).toEqual([
      [HIDE_WORKSPACE_ID, 3],
      ['ws-b', undefined],
      ['ws-a', undefined]
    ])
    expect(service.hideRestorable()).toBe(3)
  })
})

describe('화면 감추기 불러오기(run): 저장한 창만 남기고 나머지 앱 창을 내린다', () => {
  it('저장한 창(업무 창)은 불러오고, 그 밖의 창을 z-순서대로 내리며, runner에 내린 창을 넘긴다. 알림·결과·기록(건수만)', async () => {
    const { hide, calls } = fakeHide()
    const { w, service } = world({ list: [hideSaved()], windows: [CHAT, ...TEST_WINDOWS, WORD], hide })
    const r = await service.run(HIDE_WORKSPACE_ID, 'hotkey')
    expect(calls).toEqual(['release:press', 'hide:201,202|front:201|carry:0'])
    expect(w.plans).toHaveLength(1)
    expect(w.runHidden).toEqual([['201', '202']])
    expect(r).toMatchObject({ ok: true, hide: { kind: 'hide', minimized: 2, elevated: 0, skipped: 0, saved: true } })
    if (!r.ok) throw new Error('ok expected')
    expect(w.notes).toEqual([hideSummary(HIDE_WORKSPACE_NAME, r.report, r.hide!)])
    expect(w.logs).toContainEqual(['workspace.hide', expect.objectContaining({ source: 'hotkey', id: HIDE_WORKSPACE_ID, minimized: 2, elevated: 0, hung: 0, failed: 0, why: 'first', saved: true, desktop: false })])
    expect(w.logs).toContainEqual(['workspace.restore', expect.objectContaining({ source: 'hotkey', id: HIDE_WORKSPACE_ID, total: 3, placed: 3 })])
    expect(w.restored).toEqual([{ id: HIDE_WORKSPACE_ID, source: 'hotkey', after: 'workspace.hide' }])
  })

  it('저장한 창이 없으면(처음) 모든 앱 창을 내리고 불러오기는 하지 않으며, 감추기 직전 앞 창을 내렸으면 바탕 화면에 포커스', async () => {
    const { hide, calls } = fakeHide()
    const { w, service } = world({ list: [hideEmpty()], windows: [CHAT, ...TEST_WINDOWS], hide })
    const r = await service.run(HIDE_WORKSPACE_ID, 'palette')
    expect(calls).toEqual(['release:press', 'hide:201,101,102,103|front:201|carry:0', 'desktop'])
    expect(w.plans).toEqual([])
    expect(r).toMatchObject({ ok: true, report: { total: 0, placed: 0 }, hide: { kind: 'hide', minimized: 4, saved: false } })
    expect(w.notes).toEqual(['화면 감추기 · 창 4개를 내렸어요 · 설정에서 남길 창을 저장할 수 있어요'])
  })

  it('다시 누름(10분 안): 내렸던 창을 되돌리고 알린다(창 목록·runner를 부르지 않는다)', async () => {
    const decide: PressDecision = { kind: 'restore', windows: [{ hwnd: '202', maximized: true }, { hwnd: '201', maximized: false }], focus: '201' }
    const { hide, calls } = fakeHide({ decide })
    const { w, service } = world({ list: [hideSaved()], hide })
    const r = await service.run(HIDE_WORKSPACE_ID, 'hotkey')
    expect(calls).toEqual(['release:press', 'unhide:202,201|focus:201'])
    expect(w.snapshots).toBe(0)
    expect(w.plans).toEqual([])
    expect(r).toMatchObject({ ok: true, hide: { kind: 'unhide', restored: 2, skipped: 0 } })
    expect(w.notes).toEqual(['화면 감추기 · 내렸던 창 2개를 되돌렸어요'])
    expect(w.logs).toContainEqual(['workspace.unhide', expect.objectContaining({ source: 'hotkey', id: HIDE_WORKSPACE_ID, restored: 2, skipped: 0, focused: true })])
  })

  it('사용자가 내린 창을 되살린 뒤 누르면(changed) 다시 감추고 아직 최소화된 창을 이어서 기억한다', async () => {
    const { hide, calls } = fakeHide({ decide: { kind: 'hide', why: 'changed', carry: [{ hwnd: '300', maximized: false }] } })
    const { service } = world({ list: [hideSaved()], windows: [CHAT, ...TEST_WINDOWS], hide })
    await service.run(HIDE_WORKSPACE_ID, 'bar')
    expect(calls).toContain('hide:201|front:201|carry:1')
  })

  it('Win32를 쓸 수 없으면 보안 프로그램 안내만 하고 아무 창도 내리지 않는다', async () => {
    const { hide, calls } = fakeHide()
    const { w, service } = world({ list: [hideSaved()], native: false, hide })
    expect(await service.run(HIDE_WORKSPACE_ID, 'hotkey')).toEqual({ ok: false, reason: 'native-unavailable' })
    expect(calls).toEqual([])
    expect(w.notes).toEqual([WORKSPACE_NOTES.nativeUnavailable])
  })

  it('다른 워크스페이스를 불러오면 먼저 항상 위 고정을 푼다(새 배치가 고정한 창 밑에 깔리지 않게)', async () => {
    const { hide, calls } = fakeHide()
    const { service } = world({ list: [hideSaved(), testWorkspace()], hide })
    await service.run('ws-qa', 'hotkey')
    expect(calls).toEqual(['release:workspace'])
  })
})

describe('감춘 동안 업무 창을 항상 위에 두기(keepOnTop, 기본 꺼짐)', () => {
  it('켜져 있으면 배치한 업무 창을 고정한다: 감추기 전에 이미 항상 위였던 창은 빼고, 업무 창 전체를 앞 창 판단에 넘긴다', async () => {
    const { hide, calls } = fakeHide({ topmost: ['102'] })
    const { service } = world({ list: [hideSaved({ keepOnTop: true })], windows: [CHAT, ...TEST_WINDOWS], hide })
    await service.run(HIDE_WORKSPACE_ID, 'hotkey')
    expect(calls).toContain('pin:103,101|keep:101,102,103')
  })

  it('꺼져 있으면 아무 창도 고정하지 않는다', async () => {
    const { hide, calls } = fakeHide()
    const { service } = world({ list: [hideSaved()], windows: [CHAT, ...TEST_WINDOWS], hide })
    await service.run(HIDE_WORKSPACE_ID, 'hotkey')
    expect(calls.filter((c) => c.startsWith('pin:'))).toEqual([])
  })

  it('setKeepOnTop: 기본 워크스페이스에만 저장하고(켜면 true, 끄면 칸을 지움), 끄면 지금 고정을 푼다', async () => {
    const { hide, calls } = fakeHide()
    const { w, service } = world({ list: [hideEmpty(), testWorkspace()], hide })
    expect(await service.setKeepOnTop(HIDE_WORKSPACE_ID, true)).toBe(true)
    expect(w.list[0].keepOnTop).toBe(true)
    expect(await service.setKeepOnTop(HIDE_WORKSPACE_ID, false)).toBe(true)
    expect(Object.hasOwn(w.list[0], 'keepOnTop')).toBe(false)
    expect(calls).toEqual(['release:off'])
    expect(await service.setKeepOnTop('ws-qa', true)).toBe(false)
    expect(w.saves).toBe(2)
    expect(w.logs).toContainEqual(['workspace.keepOnTop', { id: HIDE_WORKSPACE_ID, on: true }])
  })

  it('앱을 끝낼 때(shutdown) 고정을 푼다', () => {
    const { hide, calls } = fakeHide()
    world({ hide }).service.shutdown()
    expect(calls).toEqual(['release:quit'])
  })
})
