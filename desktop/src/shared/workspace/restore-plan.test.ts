import { describe, expect, it } from 'vitest'
import type { Rect, WindowInfo } from '../types'
import { captureLayout } from './capture'
import { monitorFingerprint } from './monitors'
import type { LiveWindow } from './match'
import { planRestore } from './restore-plan'
import type { ReadyPlan } from './restore-plan'
import { L, P } from './test-monitors'
import type { Workspace } from './types'

const toDip = (r: Rect): Rect =>
  r.x < 0 ? { x: (r.x + 2880) / 1.5 - 1920, y: r.y / 1.5, width: r.width / 1.5, height: r.height / 1.5 } : r
const fr = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height })
function win(o: Partial<WindowInfo> & { title: string; exe: string; frame: Rect }): WindowInfo {
  return { hwnd: '1', className: 'Cls', pid: 1, rect: o.frame, minimized: false, maximized: false, cloaked: false, elevated: false, dpi: 96, ...o }
}
let n = 0
const captured = captureLayout({
  windows: [
    win({ exe: 'EXCEL.EXE', className: 'XLMAIN', title: '가상자동차 보고서.xlsx - Excel', frame: fr(0, 0, 960, 1040) }),
    win({ exe: 'EXCEL.EXE', className: 'XLMAIN', title: '예산.xlsx - Excel', frame: fr(960, 0, 960, 1040) }),
    win({ exe: 'Code.exe', title: 'a.ts - sure - Visual Studio Code', frame: fr(-2880, 0, 1440, 864) }),
    win({ exe: 'notepad.exe', title: '메모 - Windows 메모장', maximized: true, frame: fr(0, 0, 1920, 1040) })
  ],
  monitors: [P, L], toDip, newId: () => `r${++n}`
})
const ws = (over?: (w: Workspace) => void): Workspace => {
  const w: Workspace = {
    id: 'w', name: 'n', aliases: [], hotkey: null, updatedAt: '',
    layouts: { [captured.fingerprint]: structuredClone(captured.layout) }
  }
  over?.(w)
  return w
}
const live = (hwnd: string, exe: string, title: string, o: Partial<LiveWindow> = {}): LiveWindow => ({
  hwnd, exe, className: exe === 'EXCEL.EXE' ? 'XLMAIN' : 'Cls', title, minimized: false, maximized: false, elevated: false, ...o
})
const now = [
  live('b', 'EXCEL.EXE', '예산.xlsx - Excel'),
  live('c', 'Code.exe', 'a.ts - sure - Visual Studio Code'),
  live('m', 'notepad.exe', '메모 - Windows 메모장')
]
const ready = (p: unknown): ReadyPlan => {
  expect((p as { kind: string }).kind).toBe('ready')
  return p as ReadyPlan
}
const base = { workspace: ws(), monitors: [P, L], windows: now, gather: false, selfElevated: false as boolean | null }

describe('planRestore 같은 구성', () => {
  it('순서·목표·건너뜀', () => {
    const p = ready(planRestore(base))
    expect(p.steps.map((s) => s.hwnd)).toEqual(['m', 'c', 'b'])
    const code = p.steps[1]
    expect(code.target).toEqual({ x: -1920, y: 0, width: 960, height: 576 })
    expect(code.dpi).toBe(144)
    expect(p.steps[0].target).toEqual(P.workArea)
    expect(p.steps[0].state).toBe('maximized')
    expect(p.skipped).toEqual([{ ruleId: 'r1', app: 'Excel', reason: 'missing' }])
    expect(p.total).toBe(4)
    expect(p.gathered).toBe(false)
  })
  it('관리자 권한 창', () => {
    const w = [...now.slice(0, 2), live('m', 'notepad.exe', '메모 - Windows 메모장', { elevated: true })]
    const a = ready(planRestore({ ...base, windows: w, selfElevated: false }))
    expect(a.skipped).toContainEqual({ ruleId: 'r4', app: 'Windows 메모장', reason: 'elevated' })
    expect(a.steps.map((s) => s.hwnd)).toEqual(['c', 'b'])
    expect(ready(planRestore({ ...base, windows: w, selfElevated: true })).steps).toHaveLength(3)
    const unknown = [...now.slice(0, 2), live('m', 'notepad.exe', '메모 - Windows 메모장', { elevated: null })]
    expect(ready(planRestore({ ...base, windows: unknown, selfElevated: false })).steps).toHaveLength(3)
  })
  it('옮길 창마다 관리자 권한 여부(모르면 null)를 함께 넘긴다(옮기지 못했을 때 까닭을 고르는 데 쓴다, A-M3)', () => {
    const w = [live('b', 'EXCEL.EXE', '예산.xlsx - Excel', { elevated: null }), now[1], live('m', 'notepad.exe', '메모 - Windows 메모장', { elevated: true })]
    const p = ready(planRestore({ ...base, windows: w, selfElevated: true }))
    expect(Object.fromEntries(p.steps.map((s) => [s.hwnd, s.elevated]))).toEqual({ b: null, c: false, m: true })
  })
  it('꺼진 규칙은 total에서 제외', () => {
    const workspace = ws((w) => { Object.values(w.layouts)[0].windows[0].enabled = false })
    const p = ready(planRestore({ ...base, workspace }))
    expect(p.total).toBe(3)
    expect(p.skipped).toEqual([])
  })
})

describe('planRestore 다른 구성', () => {
  it('노트북 분리 시 모으기 질문', () => {
    expect(planRestore({ ...base, monitors: [P] })).toEqual({ kind: 'needs-gather', savedMonitors: 2, currentMonitors: 1 })
  })
  it('모으기', () => {
    const p = ready(planRestore({ ...base, monitors: [P], gather: true }))
    expect(p.gathered).toBe(true)
    const code = p.steps.find((s) => s.hwnd === 'c')!
    expect(code.target).toEqual({ x: 0, y: 0, width: 960, height: 520 })
    expect(code.dpi).toBe(96)
    for (const s of p.steps) {
      expect(s.target.x).toBeGreaterThanOrEqual(0)
      expect(s.target.x + s.target.width).toBeLessThanOrEqual(1920)
    }
  })
  it('화면 밖 비율 보정', () => {
    const workspace = ws((w) => { Object.values(w.layouts)[0].windows[2].target.rect = { x: 0.99, y: 0.97, w: 0.5, h: 0.5 } })
    const p = ready(planRestore({ ...base, workspace, monitors: [P], gather: true }))
    expect(p.steps.find((s) => s.hwnd === 'c')!.target).toEqual({ x: 1872, y: 992, width: 960, height: 520 })
  })
})

describe('planRestore empty', () => {
  it('배치 없음', () => {
    expect(planRestore({ ...base, workspace: ws((w) => { w.layouts = {} }) })).toEqual({ kind: 'empty' })
  })
  it('모두 꺼짐', () => {
    const workspace = ws((w) => { Object.values(w.layouts)[0].windows.forEach((r) => { r.enabled = false }) })
    expect(planRestore({ ...base, workspace })).toEqual({ kind: 'empty' })
    expect(monitorFingerprint([P, L])).toBe(captured.fingerprint)
  })
})
