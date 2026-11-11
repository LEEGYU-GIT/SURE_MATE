import type { Rect, WindowInfo } from '../types'
import { captureLayout } from './capture'
import { L, P } from './test-monitors'
import type { Workspace } from './types'

// 워크스페이스 시험 데이터(가상 이름만). 모니터는 test-monitors.ts의 P(주, 100%)·L(내장, 150%, 왼쪽)

/** 시험용 물리 → DIP: P는 그대로, L(물리 x -2880부터, 150%)은 1.5로 나눈다 */
export const toDipPL = (r: Rect): Rect =>
  r.x < 0 ? { x: (r.x + 2880) / 1.5 - 1920, y: r.y / 1.5, width: r.width / 1.5, height: r.height / 1.5 } : r

export function testWindow(o: Partial<WindowInfo> & { hwnd: string; exe: string; title: string; frame: Rect }): WindowInfo {
  return { className: 'Cls', pid: 100, rect: o.frame, minimized: false, maximized: false, cloaked: false, elevated: false, dpi: 96, ...o }
}

/** 지금 열린 창 3개(z-순서): P 왼쪽 절반·오른쪽 절반의 Excel 두 개, L 위쪽의 메모장 */
export const TEST_WINDOWS: WindowInfo[] = [
  testWindow({ hwnd: '101', exe: 'EXCEL.EXE', className: 'XLMAIN', title: '가상자동차 보고서.xlsx - Excel', frame: { x: 0, y: 0, width: 960, height: 1040 } }),
  testWindow({ hwnd: '102', exe: 'EXCEL.EXE', className: 'XLMAIN', title: 'XY방산 예산.xlsx - Excel', frame: { x: 960, y: 0, width: 960, height: 1040 } }),
  testWindow({ hwnd: '103', exe: 'notepad.exe', title: 'SureMate-WS-A - Windows 메모장', frame: { x: -2880, y: 0, width: 1440, height: 864 } })
]

/** TEST_WINDOWS를 [P, L]에서 저장한 배치(규칙 id r1·r2·r3) */
export function testLayout(): ReturnType<typeof captureLayout> {
  let n = 0
  return captureLayout({ windows: TEST_WINDOWS, monitors: [P, L], toDip: toDipPL, newId: () => `r${++n}` })
}

/** 'QA 모드'(별칭 qa): [P, L]에서 저장한 배치 하나 */
export function testWorkspace(over: Partial<Workspace> = {}): Workspace {
  const { fingerprint, layout } = testLayout()
  return {
    id: 'ws-qa',
    name: 'QA 모드',
    aliases: ['qa'],
    hotkey: null,
    layouts: { [fingerprint]: layout },
    updatedAt: '2026-11-10T09:00:00.000Z',
    ...over
  }
}
