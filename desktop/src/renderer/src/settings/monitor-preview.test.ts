import { describe, expect, it } from 'vitest'
import type { MonitorInfo, Rect } from '../../../shared/types'
import { monitorKey, toSavedMonitor } from '../../../shared/workspace/monitors'
import { L, P } from '../../../shared/workspace/test-monitors'
import type { RatioRect, SavedLayout, WindowRule, WindowState } from '../../../shared/workspace/types'
import { monitorLabel, previewHeight, previewLayout, taskbarRects } from './monitor-preview'

const rule = (id: string, monitor: string, rect: RatioRect, state: WindowState, order: number, enabled = true): WindowRule => ({
  id,
  enabled,
  match: { exe: `${id}.exe` },
  savedTitle: id,
  target: { monitor, rect, state },
  order
})

/** Task 2의 P(주, 100%)·L(내장, 150%, 왼쪽) 배치: L 왼쪽 위 1/4의 Code 창, P에서 최대화한 메모장 */
const layout: SavedLayout = {
  monitors: [toSavedMonitor(P), toSavedMonitor(L)],
  windows: [rule('code', monitorKey(L), { x: 0, y: 0, w: 0.5, h: 0.5 }, 'normal', 1), rule('memo', monitorKey(P), { x: 0, y: 0, w: 1, h: 1 }, 'maximized', 0)]
}

function expectRect(r: Rect | undefined, want: Rect): void {
  expect(r).toBeDefined()
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(r?.[k], k).toBeCloseTo(want[k], 6)
}

describe('previewLayout: 저장한 모니터 그림 위 창 사각형(설계 §11)', () => {
  it('모니터 합집합을 상자(280×160, 여백 8) 안 가운데에 비율대로 놓는다', () => {
    const p = previewLayout(layout, { width: 280, height: 160 }, 8)
    const byKey = new Map(p.monitors.map((m) => [m.key, m]))
    expectRect(byKey.get(monitorKey(P))?.rect, { x: 140, y: 38.75, width: 132, height: 74.25 })
    expectRect(byKey.get(monitorKey(L))?.rect, { x: 8, y: 38.75, width: 132, height: 82.5 })
    expect(p.monitors.map((m) => m.label)).toEqual(['주 모니터', '내장 화면'])
  })

  it('창은 그 모니터 작업 영역의 비율 사각형(최대화는 작업 영역 전체)을 같은 비율로 옮긴다', () => {
    const p = previewLayout(layout, { width: 280, height: 160 }, 8)
    const code = p.windows.find((w) => w.ruleId === 'code')
    const memo = p.windows.find((w) => w.ruleId === 'memo')
    expectRect(code?.rect, { x: 8, y: 38.75, width: 66, height: 39.6 })
    expect(code?.maximized).toBe(false)
    expectRect(memo?.rect, { x: 140, y: 38.75, width: 132, height: 71.5 })
    expect(memo?.maximized).toBe(true)
    // 작업 표시줄 자리(모니터 bounds − 작업 영역)를 그릴 수 있게 작업 영역도 준다
    expectRect(p.monitors[0].workArea, { x: 140, y: 38.75, width: 132, height: 71.5 })
  })

  it('그리는 순서는 아래 창부터(order가 큰 것 먼저), 포함하지 않은 창도 enabled false로 그린다', () => {
    const withOff: SavedLayout = { ...layout, windows: [...layout.windows, rule('off', monitorKey(P), { x: 0.5, y: 0, w: 0.5, h: 1 }, 'normal', 2, false)] }
    const p = previewLayout(withOff, { width: 280, height: 160 }, 8)
    expect(p.windows.map((w) => [w.ruleId, w.enabled])).toEqual([
      ['off', false],
      ['code', true],
      ['memo', true]
    ])
  })

  it('모니터를 찾지 못한 창은 빼고, 모니터가 없으면 빈 그림', () => {
    const lost: SavedLayout = { ...layout, windows: [rule('lost', 'nope', { x: 0, y: 0, w: 1, h: 1 }, 'normal', 0)] }
    expect(previewLayout(lost, { width: 280, height: 160 }, 8).windows).toEqual([])
    expect(previewLayout({ monitors: [], windows: [] }, { width: 280, height: 160 })).toEqual({ monitors: [], windows: [] })
  })

  it('상자가 여백보다 작아도 음수 크기를 만들지 않는다', () => {
    const p = previewLayout(layout, { width: 10, height: 10 }, 8)
    for (const m of p.monitors) expect(m.rect.width).toBeGreaterThanOrEqual(0)
  })
})

describe('taskbarRects: 모니터에서 작업 영역 밖(작업 표시줄 자리) 띠', () => {
  it('아래·위·왼쪽·오른쪽 작업 표시줄, 작업 영역이 모니터 전체면 없음', () => {
    const m = { x: 0, y: 0, width: 100, height: 60 }
    expect(taskbarRects(m, { x: 0, y: 0, width: 100, height: 56 })).toEqual([{ x: 0, y: 56, width: 100, height: 4 }])
    expect(taskbarRects(m, { x: 0, y: 4, width: 100, height: 56 })).toEqual([{ x: 0, y: 0, width: 100, height: 4 }])
    expect(taskbarRects(m, { x: 5, y: 0, width: 95, height: 60 })).toEqual([{ x: 0, y: 0, width: 5, height: 60 }])
    expect(taskbarRects(m, { x: 0, y: 0, width: 95, height: 60 })).toEqual([{ x: 95, y: 0, width: 5, height: 60 }])
    expect(taskbarRects(m, m)).toEqual([])
  })
})

describe('previewHeight: 모니터 합집합 비율에 맞춘 미리 보기 높이', () => {
  it('가로로 놓인 모니터 두 대는 낮게, 한 대(16:9)는 그 비율대로, 위아래로 놓이면 상한까지', () => {
    // 합집합 3840×1200: (248 − 24) × 1200 / 3840 + 24 = 94 → 하한 96
    expect(previewHeight(layout, 248, { pad: 12, min: 96, max: 200 })).toBe(96)
    // 1920×1080 하나: 224 × 1080 / 1920 + 24 = 150
    expect(previewHeight({ monitors: [toSavedMonitor(P)], windows: [] }, 248, { pad: 12, min: 96, max: 200 })).toBe(150)
    const below: MonitorInfo = { ...L, bounds: { x: 0, y: 1080, width: 1920, height: 1200 }, workArea: { x: 0, y: 1080, width: 1920, height: 1152 } }
    expect(previewHeight({ monitors: [toSavedMonitor(P), toSavedMonitor(below)], windows: [] }, 248, { pad: 12, min: 96, max: 200 })).toBe(200)
    // 넓은 칸(456): 432 × 1200 / 3840 + 24 = 159
    expect(previewHeight(layout, 456, { pad: 12, min: 96, max: 180 })).toBe(159)
    expect(previewHeight({ monitors: [], windows: [] }, 248, { pad: 12, min: 96, max: 200 })).toBe(96)
  })
})

describe('monitorLabel: 모니터 이름(주 모니터 · 내장 화면 · 나머지는 x 순서로 모니터 2부터)', () => {
  const ext = (x: number): MonitorInfo => ({
    id: String(x),
    bounds: { x, y: 0, width: 1920, height: 1080 },
    workArea: { x, y: 0, width: 1920, height: 1040 },
    scaleFactor: 1,
    isPrimary: false,
    isInternal: false
  })

  it('주 모니터 오른쪽의 외부 모니터 두 대는 x 순서로 모니터 2·모니터 3(저장 순서와 상관없이)', () => {
    const all = [toSavedMonitor(ext(3840)), toSavedMonitor(P), toSavedMonitor(ext(1920))]
    expect(all.map((m) => monitorLabel(m, all))).toEqual(['모니터 3', '주 모니터', '모니터 2'])
  })

  it('주 모니터와 내장 화면은 역할로, 내장 화면은 번호를 차지하지 않는다', () => {
    const all = [toSavedMonitor(L), toSavedMonitor(P), toSavedMonitor(ext(1920))]
    expect(all.map((m) => monitorLabel(m, all))).toEqual(['내장 화면', '주 모니터', '모니터 2'])
  })
})
