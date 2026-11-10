import { describe, expect, it } from 'vitest'
import type { Rect, WindowInfo } from '../types'
import { appLabel, captureLayout, deriveTitleRules } from './capture'
import { L, P, } from './test-monitors'
import { monitorKey, toSavedMonitor } from './monitors'

const toDip = (r: Rect): Rect =>
  r.x < 0 ? { x: (r.x + 2880) / 1.5 - 1920, y: r.y / 1.5, width: r.width / 1.5, height: r.height / 1.5 } : r

function win(o: Partial<WindowInfo> & { title: string; exe: string; frame: Rect }): WindowInfo {
  return {
    hwnd: '1', className: 'Cls', pid: 1, rect: o.frame, minimized: false, maximized: false,
    cloaked: false, elevated: false, dpi: 96, ...o
  }
}
const fr = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height })
let n = 0
const newId = (): string => `id-${n++}`

describe('captureLayout', () => {
  const windows = [
    win({ exe: 'EXCEL.EXE', className: 'XLMAIN', title: '가상자동차 보고서.xlsx - Excel', frame: fr(0, 0, 960, 1040) }),
    win({ exe: 'EXCEL.EXE', className: 'XLMAIN', title: '예산.xlsx - Excel', frame: fr(960, 0, 960, 1040) }),
    win({ exe: 'Code.exe', title: 'a.ts - sure - Visual Studio Code', frame: fr(-2880, 0, 1440, 864) }),
    win({ exe: 'notepad.exe', title: '메모 - Windows 메모장', maximized: true, frame: fr(0, 0, 1920, 1040) }),
    win({ exe: 'explorer.exe', className: 'Progman', title: 'Program Manager', frame: fr(0, 0, 1920, 1080) }),
    win({ exe: 'chrome.exe', title: 'x', minimized: true, frame: fr(-32000, -32000, 160, 28) })
  ]
  it('창 6개', () => {
    n = 0
    const r = captureLayout({ windows, monitors: [P, L], toDip, newId })
    expect(r.fingerprint).toBe('2|1920x1080@100:0,0|2880x1800@150i:-1920,0')
    expect(r.skipped).toEqual({ minimized: 1, excluded: 1, offscreen: 0, overLimit: 0 })
    expect(r.layout.monitors).toEqual([toSavedMonitor(P), toSavedMonitor(L)])
    const w = r.layout.windows
    expect(w).toHaveLength(4)
    expect(w[0].match.titleIncludes).toBe('가상자동차 보고서.xlsx')
    expect(w[0].match.className).toBe('XLMAIN')
    expect(w[0].target).toEqual({ monitor: monitorKey(P), rect: { x: 0, y: 0, w: 0.5, h: 1 }, state: 'normal' })
    expect(w[0].order).toBe(0)
    expect(w[0].id).toBe('id-0')
    expect(w[0].savedTitle).toBe('가상자동차 보고서.xlsx - Excel')
    expect(w[1].match.titleIncludes).toBe('예산.xlsx')
    expect(w[1].target.rect).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 })
    expect(w[1].order).toBe(1)
    expect(w[2].match.titleIncludes).toBeUndefined()
    expect(w[2].target).toEqual({ monitor: monitorKey(L), rect: { x: 0, y: 0, w: 0.5, h: 0.5 }, state: 'normal' })
    expect(w[2].order).toBe(2)
    expect(w[3].target).toEqual({ monitor: monitorKey(P), rect: { x: 0, y: 0, w: 1, h: 1 }, state: 'maximized' })
    expect(w[3].order).toBe(3)
  })
  it('화면 밖', () => {
    const r = captureLayout({
      windows: [win({ exe: 'a.exe', title: 't', frame: fr(5000, 5000, 100, 100) })], monitors: [P, L], toDip, newId
    })
    expect(r.skipped.offscreen).toBe(1)
    expect(r.layout.windows).toHaveLength(0)
  })
  it('40개 제한', () => {
    const many = Array.from({ length: 45 }, (_, i) => win({ exe: `a${i}.exe`, title: `t${i}`, frame: fr(10, 10, 300, 300) }))
    const r = captureLayout({ windows: many, monitors: [P, L], toDip, newId })
    expect(r.layout.windows).toHaveLength(40)
    expect(r.skipped.overLimit).toBe(5)
  })
  it('제목 200자 제한', () => {
    const r = captureLayout({
      windows: [win({ exe: 'a.exe', title: 'k'.repeat(300), frame: fr(10, 10, 300, 300) })], monitors: [P], toDip, newId
    })
    expect(r.layout.windows[0].savedTitle).toHaveLength(200)
  })
})

describe('deriveTitleRules', () => {
  it('규칙', () => {
    expect(deriveTitleRules(['보고서.xlsx - Excel', '예산.xlsx - Excel'])).toEqual(['보고서.xlsx', '예산.xlsx'])
    expect(deriveTitleRules(['a.ts - sure - Visual Studio Code', 'b.ts - mate - Visual Studio Code'])).toEqual(['sure', 'mate'])
    expect(deriveTitleRules(['제목 없음 - Windows 메모장', '제목 없음 - Windows 메모장'])).toEqual([null, null])
    expect(deriveTitleRules(['SureMate-WS-A', 'SureMate-WS-B'])).toEqual(['SureMate-WS-A', 'SureMate-WS-B'])
    expect(deriveTitleRules(['only - App'])).toEqual([null])
    expect(deriveTitleRules(['x - App', 'x - App', 'y - App'])).toEqual([null, null, 'y'])
  })
})

describe('appLabel', () => {
  it('라벨', () => {
    expect(appLabel({ savedTitle: '보고서.xlsx - Excel', match: { exe: 'EXCEL.EXE' } })).toBe('Excel')
    expect(appLabel({ savedTitle: 'a.ts - sure - Visual Studio Code', match: { exe: 'Code.exe' } })).toBe('Visual Studio Code')
    expect(appLabel({ savedTitle: 'SureMate-WS-A', match: { exe: 'powershell.exe' } })).toBe('powershell')
    expect(appLabel({ savedTitle: '', match: { exe: 'EXCEL.EXE' } })).toBe('EXCEL')
    expect(appLabel({ savedTitle: `a - ${'z'.repeat(40)}`, match: { exe: 'foo.exe' } })).toBe('foo')
  })
})
