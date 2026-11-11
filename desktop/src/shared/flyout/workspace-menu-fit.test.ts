import { describe, expect, it } from 'vitest'
import { FLYOUT_MAX_HEIGHT } from './flyout-content'
import { WORKSPACE_MENU_METRICS, workspaceMenuHeight, workspaceMenuRowsThatFit } from './workspace-menu-fit'

describe('바 워크스페이스 메뉴 높이와 보일 행 수(13b: 메뉴는 스크롤하지 않는다)', () => {
  it('행 높이·머리 높이는 그대로다(저장한 배치 행 52, 머리 28: 스모크 시험 t21이 첫 행을 카드 위에서 58에 누른다)', () => {
    expect(WORKSPACE_MENU_METRICS.row).toBe(52)
    expect(WORKSPACE_MENU_METRICS.header).toBe(28)
    expect(WORKSPACE_MENU_METRICS.padding / 2 + WORKSPACE_MENU_METRICS.header + WORKSPACE_MENU_METRICS.row / 2).toBe(58)
  })

  it('높이: 8개면 544, 저장할 수 없으면 저장 행의 두 줄 설명만큼 36 더', () => {
    expect(workspaceMenuHeight({ rows: 8, canSave: true })).toBe(544)
    expect(workspaceMenuHeight({ rows: 8, canSave: false })).toBe(580)
    expect(workspaceMenuHeight({ rows: 0, canSave: true })).toBe(128)
  })

  it('최대 높이(560)에는 8개, 저장할 수 없으면 7개(8개면 580으로 잘린다)', () => {
    expect(workspaceMenuRowsThatFit({ maxHeight: FLYOUT_MAX_HEIGHT, canSave: true, max: 8 })).toBe(8)
    expect(workspaceMenuRowsThatFit({ maxHeight: FLYOUT_MAX_HEIGHT, canSave: false, max: 8 })).toBe(7)
  })

  it('1280×720 화면 125%(화면 576 DIP − 작업 표시줄 48 = 작업 영역 528, 카드 최대 512)에서는 7개', () => {
    const maxHeight = 720 / 1.25 - 48 - 16
    const rows = workspaceMenuRowsThatFit({ maxHeight, canSave: true, max: 8 })
    expect(rows).toBe(7)
    expect(workspaceMenuHeight({ rows, canSave: true })).toBeLessThanOrEqual(maxHeight)
  })

  it('어떤 높이에서도 보일 행을 넣은 메뉴는 그 높이를 넘지 않는다(저장·모두 보기 행이 늘 보인다). 행은 0~max', () => {
    for (let maxHeight = 128; maxHeight <= 900; maxHeight += 7) {
      for (const canSave of [true, false]) {
        const rows = workspaceMenuRowsThatFit({ maxHeight, canSave, max: 8 })
        expect(rows).toBeGreaterThanOrEqual(0)
        expect(rows).toBeLessThanOrEqual(8)
        if (workspaceMenuHeight({ rows: 0, canSave }) <= maxHeight) expect(workspaceMenuHeight({ rows, canSave })).toBeLessThanOrEqual(maxHeight)
        if (rows < 8) expect(workspaceMenuHeight({ rows: rows + 1, canSave })).toBeGreaterThan(maxHeight)
      }
    }
    expect(workspaceMenuRowsThatFit({ maxHeight: 100, canSave: true, max: 8 })).toBe(0)
    expect(workspaceMenuRowsThatFit({ maxHeight: 2000, canSave: true, max: 8 })).toBe(8)
  })
})
