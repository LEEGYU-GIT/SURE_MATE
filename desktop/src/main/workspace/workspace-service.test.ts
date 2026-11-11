import { afterEach, describe, expect, it } from 'vitest'
import type { MonitorInfo, WindowInfo } from '../../shared/types'
import type { CaptureSkipped } from '../../shared/workspace/capture'
import { restoreSummary, saveSummary, WORKSPACE_NOTES } from '../../shared/workspace/messages'
import { monitorFingerprint, monitorKey } from '../../shared/workspace/monitors'
import type { ReadyPlan } from '../../shared/workspace/restore-plan'
import type { RestoreReport } from '../../shared/workspace/restore-result'
import { L, P } from '../../shared/workspace/test-monitors'
import { TEST_WINDOWS, testWindow, testWorkspace, toDipPL } from '../../shared/workspace/test-workspaces'
import type { Workspace } from '../../shared/workspace/types'
import { createWorkspaceService, type WorkspaceServiceDeps } from './workspace-service'

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
  restoredFocus: true
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
}

const worlds: World[] = []

/** 가짜 세계: 메모리 저장소(실제 캐시처럼 얼린 목록을 준다), 고정 snapshot, 계획을 기록하는 runner, 가짜 확인·시계 */
function world(o: Partial<Pick<World, 'list' | 'native' | 'windows' | 'monitors' | 'confirm'>> = {}): { w: World; service: ReturnType<typeof createWorkspaceService> } {
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
    logs: []
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
      run: async (plan) => {
        w.plans.push(plan)
        if (w.hold) await w.hold
        return reportOf(plan)
      }
    },
    confirmGather: async (c) => {
      w.confirms.push(c)
      return w.confirm
    },
    notify: (m) => void w.notes.push(m),
    newId: () => `id-${++n}`,
    now: () => new Date(NOW),
    log: (event, data) => void w.logs.push([event, data])
  }
  return { w, service: createWorkspaceService(deps) }
}

// (Global Constraints) 로그에는 id·건수·시간만: 이름·별칭·창 제목이 없다
afterEach(() => {
  const json = JSON.stringify(worlds.map((w) => w.logs))
  worlds.length = 0
  for (const content of ['QA 모드', '가상자동차', 'XY방산', 'SureMate-WS-A', '배치 1', '보고서 모드', '회의 모드']) expect(json).not.toContain(content)
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
    expect(w.notes).toEqual([saveSummary({ name: '배치 1', windows: 3, skipped: NONE })])
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
    expect(w.notes).toEqual([saveSummary({ name: '배치 1', windows: 3, skipped })])
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
      expect.objectContaining({ source: 'palette', total: 3, placed: 3, missing: 0, elevated: 0, hung: 0, blocked: 0, failed: 0, off: 0, timeout: 0, gathered: false, maxDiff: 3, ms: 42, restoredFocus: true })
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
    expect(await service.edit('ws-qa', { name: '회의모드', aliases: [], rules: [] })).toEqual({ ok: false, errors: ['같은 이름의 워크스페이스가 있어요'] })
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
  it('지금 구성과 같은지 함께 돌려주고 없는 id는 null(Win32 없이, 창 목록을 읽지 않는다)', async () => {
    const { w, service } = world({ list: [testWorkspace()], native: false })
    expect(await service.view('ws-qa')).toEqual({ workspace: w.list[0], sameConfig: true })
    w.monitors = [P]
    expect(await service.view('ws-qa')).toEqual({ workspace: w.list[0], sameConfig: false })
    expect(await service.view('nope')).toBeNull()
    expect(await service.list()).toBe(w.list)
    expect(w.snapshots).toBe(0)
  })
})
