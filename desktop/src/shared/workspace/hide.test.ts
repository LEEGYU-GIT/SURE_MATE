import { describe, expect, it } from 'vitest'
import {
  decidePress,
  HIDE_SESSION_MS,
  hideCandidates,
  type HideSession,
  focusLeftOnHidden,
  pinCheck,
  pinRelease,
  pinTargets,
  startSession,
  workspaceWindowIds
} from './hide'
import { L, P } from './test-monitors'
import { TEST_WINDOWS, testWindow, testWorkspace, toDipPL } from './test-workspaces'

const SELF_PID = 4242
const T0 = Date.parse('2026-11-12T09:00:00.000Z')

/** 다른 앱 창(가상 제목). P(주 모니터) 위 */
const chat = testWindow({ hwnd: '201', exe: 'chat.exe', title: '가상 메신저', frame: { x: 100, y: 100, width: 400, height: 600 } })
const word = testWindow({ hwnd: '202', exe: 'WINWORD.EXE', title: 'XY방산 회의록.docx - Word', maximized: true, frame: { x: 0, y: 0, width: 1920, height: 1040 } })
/** L(내장 화면, 물리 x -2880부터) 위의 다른 앱 창 */
const onL = testWindow({ hwnd: '203', exe: 'explorer.exe', title: '시험 자료 - 파일 탐색기', frame: { x: -2700, y: 100, width: 900, height: 600 } })

describe('업무 창(workspaceWindowIds): 불러오기와 같은 배치·같은 짝짓기로 고른 창은 내리지 않는다', () => {
  it('저장한 창 규칙과 짝지어지는 창만(같은 모니터 구성)', () => {
    const ws = testWorkspace()
    expect([...workspaceWindowIds(ws, [P, L], [chat, ...TEST_WINDOWS])].sort()).toEqual(['101', '102', '103'])
  })
  it('포함하지 않은 규칙의 창은 업무 창이 아니다', () => {
    const ws = testWorkspace()
    const layout = Object.values(ws.layouts)[0]
    const off = { ...ws, layouts: { [Object.keys(ws.layouts)[0]]: { ...layout, windows: layout.windows.map((r) => (r.id === 'r3' ? { ...r, enabled: false } : r)) } } }
    expect([...workspaceWindowIds(off, [P, L], TEST_WINDOWS)].sort()).toEqual(['101', '102'])
  })
  it('다른 모니터 구성이면 첫 배치로 짝짓는다(모으기를 물어도, 거절해도 같은 창)', () => {
    expect([...workspaceWindowIds(testWorkspace(), [P], TEST_WINDOWS)].sort()).toEqual(['101', '102', '103'])
  })
  it('저장한 배치가 없으면(저장 전의 화면 감추기) 업무 창이 없다', () => {
    expect(workspaceWindowIds({ ...testWorkspace(), layouts: {} }, [P, L], TEST_WINDOWS).size).toBe(0)
  })
})

describe('내릴 창(hideCandidates): 설계 §11 대상 창 규칙과 같은 창, 모든 모니터, 업무 창 제외', () => {
  const base = { monitors: [P, L], toDip: toDipPL, selfElevated: false, selfPid: SELF_PID }

  it('z-순서를 지키고 두 모니터의 다른 앱 창을 모두 고르며 업무 창(keep)은 뺀다', () => {
    const r = hideCandidates({ ...base, windows: [chat, TEST_WINDOWS[0], word, onL], keep: new Set(['101']) })
    expect(r.targets.map((t) => t.hwnd)).toEqual(['201', '202', '203'])
    expect(r.elevated).toBe(0)
  })

  it('이미 최소화한 창·바탕 화면과 작업 표시줄·제목 없는 창·가려진 창·Sure-Mate 창·어느 모니터에도 없는 창은 고르지 않는다', () => {
    const windows = [
      testWindow({ hwnd: '301', exe: 'chat.exe', title: '가상 메신저 2', minimized: true, frame: { x: -32000, y: -32000, width: 160, height: 28 } }),
      testWindow({ hwnd: '302', exe: 'explorer.exe', className: 'Progman', title: 'Program Manager', frame: { x: 0, y: 0, width: 1920, height: 1080 } }),
      testWindow({ hwnd: '303', exe: 'explorer.exe', className: 'Shell_TrayWnd', title: '작업 표시줄', frame: { x: 0, y: 1040, width: 1920, height: 40 } }),
      testWindow({ hwnd: '304', exe: 'app.exe', title: '', frame: { x: 10, y: 10, width: 300, height: 200 } }),
      testWindow({ hwnd: '305', exe: 'app.exe', title: '가려진 창', cloaked: true, frame: { x: 10, y: 10, width: 300, height: 200 } }),
      testWindow({ hwnd: '306', exe: 'Sure-Mate.exe', title: 'Sure-Mate 설정', pid: SELF_PID, frame: { x: 10, y: 10, width: 300, height: 200 } }),
      testWindow({ hwnd: '307', exe: 'app.exe', title: '화면 밖 창', frame: { x: 9000, y: 9000, width: 300, height: 200 } }),
      chat
    ]
    expect(hideCandidates({ ...base, windows, keep: new Set() }).targets.map((t) => t.hwnd)).toEqual(['201'])
  })

  it('시작 메뉴·검색·알림 센터·작업 전환 같은 셸 화면은 고르지 않는다(검토 M7)', () => {
    const shell = ['Windows.UI.Core.CoreWindow', 'XamlExplorerHostIslandWindow', 'MultitaskingViewFrame', 'ForegroundStaging', 'TopLevelWindowForOverflowXamlIsland', 'NotifyIconOverflowWindow', 'Shell_InputSwitchTopLevelWindow'].map((className, i) =>
      testWindow({ hwnd: `5${i}`, exe: 'StartMenuExperienceHost.exe', className, title: '시작', frame: { x: 0, y: 0, width: 600, height: 700 } })
    )
    expect(hideCandidates({ ...base, windows: [...shell, chat], keep: new Set() }).targets.map((t) => t.hwnd)).toEqual(['201'])
  })

  it('최대화 상태를 함께 기억한다(되돌릴 때 최대화로)', () => {
    const r = hideCandidates({ ...base, windows: [chat, word], keep: new Set() })
    expect(r.targets).toEqual([
      { hwnd: '201', maximized: false, elevated: false },
      { hwnd: '202', maximized: true, elevated: false }
    ])
  })

  it('관리자 권한 창은 내릴 수 없어(UIPI) 세기만 한다. Sure-Mate도 관리자 권한이면 내린다. 모르면(null) 내려 본다', () => {
    const admin = testWindow({ hwnd: '401', exe: 'regedit.exe', title: '레지스트리 편집기', elevated: true, frame: { x: 50, y: 50, width: 800, height: 600 } })
    const unknown = testWindow({ hwnd: '402', exe: 'svc.exe', title: '가상 관리 도구', elevated: null, frame: { x: 60, y: 60, width: 800, height: 600 } })
    const r = hideCandidates({ ...base, windows: [admin, unknown, chat], keep: new Set() })
    expect(r.targets.map((t) => [t.hwnd, t.elevated])).toEqual([
      ['402', null],
      ['201', false]
    ])
    expect(r.elevated).toBe(1)
    const asAdmin = hideCandidates({ ...base, selfElevated: true, windows: [admin, chat], keep: new Set() })
    expect(asAdmin.targets.map((t) => t.hwnd)).toEqual(['401', '201'])
    expect(asAdmin.elevated).toBe(0)
  })
})

/** 감춘 세션: chat(맨 위)·word·onL을 내렸고 감추기 직전 앞 창은 chat */
const session = (o: Partial<HideSession> = {}): HideSession => ({
  at: T0,
  hidden: [
    { hwnd: '201', maximized: false },
    { hwnd: '202', maximized: true },
    { hwnd: '203', maximized: false }
  ],
  front: '201',
  note: { elevated: 1, skipped: 0, saved: false },
  ...o
})
const minimizedAll = (hwnd: string): { minimized: boolean } | null => ({ minimized: hwnd !== '101' })

describe('다시 누름(decidePress): 10분 안·내린 창이 그대로면 되돌리기, 아니면 다시 감추기', () => {
  it('감춘 적이 없으면 감추기(first)', () => {
    expect(decidePress({ session: null, now: T0, state: minimizedAll })).toEqual({ kind: 'hide', why: 'first', carry: [] })
  })

  it('10분 안이고 내린 창이 모두 최소화 상태면 되돌리기: 아래에서 위 차례, 감추기 직전 앞 창에 포커스, 감출 때의 문제(note)를 함께', () => {
    expect(decidePress({ session: session(), now: T0 + HIDE_SESSION_MS - 1, state: minimizedAll })).toEqual({
      kind: 'restore',
      windows: [
        { hwnd: '203', maximized: false },
        { hwnd: '202', maximized: true },
        { hwnd: '201', maximized: false }
      ],
      focus: '201',
      note: { elevated: 1, skipped: 0, saved: false }
    })
  })

  it('10분이 지났거나(정각 포함) 시계가 거꾸로 갔으면 다시 감추기(expired)', () => {
    expect(decidePress({ session: session(), now: T0 + HIDE_SESSION_MS, state: minimizedAll })).toEqual({ kind: 'hide', why: 'expired', carry: [] })
    expect(decidePress({ session: session(), now: T0 - 1, state: minimizedAll })).toEqual({ kind: 'hide', why: 'expired', carry: [] })
  })

  it('사라진 창은 건너뛰고 남은 창만 되돌린다. 앞 창이 사라졌으면 맨 위로 되돌릴 창에 포커스', () => {
    const state = (hwnd: string): { minimized: boolean } | null => (hwnd === '201' ? null : { minimized: true })
    expect(decidePress({ session: session(), now: T0 + 1000, state })).toMatchObject({
      kind: 'restore',
      windows: [
        { hwnd: '203', maximized: false },
        { hwnd: '202', maximized: true }
      ],
      focus: '202'
    })
  })

  it('앞 창이 내린 창이 아니어도(업무 창·설정 창) 아직 있으면 그 창에 포커스', () => {
    const state = (hwnd: string): { minimized: boolean } | null => ({ minimized: hwnd !== '101' })
    const d = decidePress({ session: session({ front: '101' }), now: T0 + 1000, state })
    expect(d).toMatchObject({ kind: 'restore', focus: '101' })
  })

  it('내린 창을 사용자가 직접 되살렸으면(최소화가 아님) 다시 감추기(changed)이고, 아직 최소화된 창은 이어서 기억한다(carry)', () => {
    const state = (hwnd: string): { minimized: boolean } | null => (hwnd === '202' ? { minimized: false } : { minimized: true })
    expect(decidePress({ session: session(), now: T0 + 1000, state })).toEqual({
      kind: 'hide',
      why: 'changed',
      carry: [
        { hwnd: '201', maximized: false },
        { hwnd: '203', maximized: false }
      ]
    })
  })

  it('내린 창이 모두 사라졌거나 내린 창이 없었으면 다시 감추기(nothing)', () => {
    expect(decidePress({ session: session(), now: T0 + 1000, state: () => null })).toEqual({ kind: 'hide', why: 'nothing', carry: [] })
    expect(decidePress({ session: session({ hidden: [] }), now: T0 + 1000, state: minimizedAll })).toEqual({ kind: 'hide', why: 'nothing', carry: [] })
  })
})

describe('세션 시작(startSession): 이번에 내린 창 다음에 이어서 기억한 창', () => {
  it('이번에 내린 창(z-순서) 뒤에 carry를 붙이고 겹치는 창은 한 번만', () => {
    const s = startSession({
      now: T0 + 5000,
      front: '202',
      note: { elevated: 0, skipped: 1, saved: true },
      hidden: [
        { hwnd: '202', maximized: true },
        { hwnd: '204', maximized: false }
      ],
      carry: [
        { hwnd: '201', maximized: false },
        { hwnd: '202', maximized: false }
      ]
    })
    expect(s).toEqual({
      at: T0 + 5000,
      front: '202',
      note: { elevated: 0, skipped: 1, saved: true },
      hidden: [
        { hwnd: '202', maximized: true },
        { hwnd: '204', maximized: false },
        { hwnd: '201', maximized: false }
      ]
    })
  })
})

describe('감춘 뒤 실제 앞 창 확인(focusLeftOnHidden, 검토 I2): 키 입력이 내린 창으로 가면 바탕 화면에 포커스', () => {
  const hidden = new Set(['201', '202'])
  const state = (hwnd: string): { minimized: boolean } | null => (hwnd === '101' || hwnd === '900' ? { minimized: false } : hwnd === '203' ? { minimized: true } : null)
  it('앞 창(맨 위 소유 창)이 보이는 업무 창이나 Sure-Mate 설정 창이면 그대로', () => {
    expect(focusLeftOnHidden({ foreground: { hwnd: '101', own: false }, hidden, state })).toBe(false)
    expect(focusLeftOnHidden({ foreground: { hwnd: '900', own: true }, hidden, state })).toBe(false)
  })
  it('앞 창의 맨 위 소유 창이 내린 창이면(다른 이름으로 저장 대화상자·메신저 대화 창 포함) 바탕 화면으로', () => {
    expect(focusLeftOnHidden({ foreground: { hwnd: '201', own: false }, hidden, state })).toBe(true)
  })
  it('포커스를 주지 못해 앞 창이 최소화된 창·숨은 창으로 남았으면 바탕 화면으로', () => {
    expect(focusLeftOnHidden({ foreground: { hwnd: '203', own: false }, hidden, state })).toBe(true)
    expect(focusLeftOnHidden({ foreground: { hwnd: '777', own: true }, hidden, state })).toBe(true)
  })
  it('앞 창이 없으면 키 입력을 받는 창이 없어 그대로', () => {
    expect(focusLeftOnHidden({ foreground: null, hidden, state })).toBe(false)
  })
})

describe('감춘 동안 업무 창을 항상 위에 두기(옵션, 2026-11-12)', () => {
  const steps = [
    { ruleId: 'r3', hwnd: '103' },
    { ruleId: 'r2', hwnd: '102' },
    { ruleId: 'r1', hwnd: '101' }
  ]

  it('고정할 창: 이번에 배치한 창(placed·off)만 아래에서 위 차례로, 원래 항상 위였던 창은 Sure-Mate가 고정한 창이 아니라 뺀다', () => {
    const outcomes = [
      { ruleId: 'r9', result: 'missing' as const },
      { ruleId: 'r3', result: 'off' as const },
      { ruleId: 'r2', result: 'placed' as const },
      { ruleId: 'r1', result: 'placed' as const }
    ]
    expect(pinTargets({ steps, outcomes, topmostBefore: new Set() })).toEqual(['103', '102', '101'])
    expect(pinTargets({ steps, outcomes, topmostBefore: new Set(['102']) })).toEqual(['103', '101'])
  })

  it('옮기지 못한 창(blocked·failed·hung·gone·timeout)은 고정하지 않는다', () => {
    for (const result of ['blocked', 'failed', 'hung', 'gone', 'timeout'] as const) {
      expect(pinTargets({ steps, outcomes: [{ ruleId: 'r1', result }], topmostBefore: new Set() }), result).toEqual([])
    }
  })

  it('살피기(pinCheck): 10분이 지나면 expired, 앞 창이 업무 창 밖의 다른 앱 창이면 switched', () => {
    const keep = new Set(['101', '102', '103'])
    const until = T0 + HIDE_SESSION_MS
    expect(pinCheck({ until, now: until, keep, foreground: { hwnd: '101', own: false } })).toBe('expired')
    expect(pinCheck({ until, now: T0 + 1000, keep, foreground: { hwnd: '201', own: false } })).toBe('switched')
  })

  it('살피기: 시계가 거꾸로 가면(감춘 시각보다 앞) expired(검토 M2)', () => {
    const keep = new Set(['101'])
    const until = T0 + HIDE_SESSION_MS
    expect(pinCheck({ until, now: T0 - 1, keep, foreground: { hwnd: '101', own: false } })).toBe('expired')
  })

  it('살피기: Sure-Mate 창(설정·팔레트)이 앞이어도 switched(검토 M6: 고정한 창이 설정 창을 덮지 않게)', () => {
    const keep = new Set(['101'])
    expect(pinCheck({ until: T0 + HIDE_SESSION_MS, now: T0 + 1000, keep, foreground: { hwnd: '777', own: true } })).toBe('switched')
  })

  it('살피기: 업무 창·앞 창을 읽지 못함은 그대로 둔다', () => {
    const keep = new Set(['101', '102', '103'])
    const until = T0 + HIDE_SESSION_MS
    expect(pinCheck({ until, now: T0 + 1000, keep, foreground: { hwnd: '102', own: false } })).toBeNull()
    expect(pinCheck({ until, now: T0 + 1000, keep, foreground: null })).toBeNull()
  })

  it('풀기(pinRelease): 고정한 창 가운데 아직 있는 창만 풀고 사라진 창은 버린다(세기만)', () => {
    expect(pinRelease({ pinned: ['103', '102', '101'], alive: (h) => h !== '102' })).toEqual({ release: ['103', '101'], dropped: 1 })
    expect(pinRelease({ pinned: [], alive: () => true })).toEqual({ release: [], dropped: 0 })
  })
})
