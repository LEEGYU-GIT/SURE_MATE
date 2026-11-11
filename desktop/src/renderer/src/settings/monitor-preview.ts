// 워크스페이스 탭의 모니터 그림(설계 §11 "모니터 그림 위 사각형 미리 보기"). 저장한 모니터와 창 규칙만으로 그린다(Win32 없이).
import type { Rect } from '../../../shared/types'
import { fromRatio } from '../../../shared/workspace/layout-math'
import type { SavedLayout, SavedMonitor } from '../../../shared/workspace/types'

export interface PreviewLayout {
  /** 저장한 순서. rect는 모니터 전체, workArea는 작업 표시줄을 뺀 곳(둘 다 그림 좌표) */
  monitors: { key: string; label: string; rect: Rect; workArea: Rect }[]
  /** 그리는 순서(아래 창부터, 맨 위 창이 마지막). 포함하지 않은 창도 enabled false로 */
  windows: { ruleId: string; rect: Rect; maximized: boolean; enabled: boolean }[]
}

/** 모니터 bounds의 합집합(DIP). 모니터가 없으면 null */
function unionOf(monitors: SavedMonitor[]): Rect | null {
  if (monitors.length === 0) return null
  const left = Math.min(...monitors.map((m) => m.bounds.x))
  const top = Math.min(...monitors.map((m) => m.bounds.y))
  const right = Math.max(...monitors.map((m) => m.bounds.x + m.bounds.width))
  const bottom = Math.max(...monitors.map((m) => m.bounds.y + m.bounds.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * 모니터 이름: 주 모니터는 '주 모니터', 내장 디스플레이는 '내장 화면', 나머지는 x(같으면 y) 순서로 '모니터 2'부터.
 * 창 규칙의 대상 모니터 단추와 그림의 모니터 이름표가 같은 이름을 쓴다
 */
export function monitorLabel(m: SavedMonitor, all: SavedMonitor[]): string {
  if (m.role === 'primary') return '주 모니터'
  if (m.role === 'internal') return '내장 화면'
  const others = all.filter((o) => o.role === 'secondary').sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
  return `모니터 ${Math.max(0, others.findIndex((o) => o.key === m.key)) + 2}`
}

/**
 * 저장한 모니터 bounds의 합집합을 `box − 2×pad` 안에 비율을 지켜 가운데 놓고, 창은 그 모니터 작업 영역의 비율 사각형
 * (fromRatio, 최대화는 작업 영역 전체)을 같은 비율로 옮긴다. 모니터를 찾지 못한 창은 뺀다.
 */
export function previewLayout(layout: SavedLayout, box: { width: number; height: number }, pad = 8): PreviewLayout {
  const union = unionOf(layout.monitors)
  if (!union || union.width <= 0 || union.height <= 0) return { monitors: [], windows: [] }
  const innerW = Math.max(0, box.width - 2 * pad)
  const innerH = Math.max(0, box.height - 2 * pad)
  const scale = Math.min(innerW / union.width, innerH / union.height)
  const ox = pad + (innerW - union.width * scale) / 2
  const oy = pad + (innerH - union.height * scale) / 2
  const map = (r: Rect): Rect => ({
    x: ox + (r.x - union.x) * scale,
    y: oy + (r.y - union.y) * scale,
    width: r.width * scale,
    height: r.height * scale
  })

  const byKey = new Map(layout.monitors.map((m) => [m.key, m]))
  const windows = [...layout.windows]
    // z-순서(order 0이 맨 위): 아래 창부터 그려 맨 위 창이 마지막에 덮게
    .sort((a, b) => b.order - a.order)
    .flatMap((rule) => {
      const m = byKey.get(rule.target.monitor)
      if (!m) return []
      const maximized = rule.target.state === 'maximized'
      const dip = maximized ? m.workArea : fromRatio(rule.target.rect, m.workArea)
      return [{ ruleId: rule.id, rect: map(dip), maximized, enabled: rule.enabled }]
    })
  return {
    monitors: layout.monitors.map((m) => ({ key: m.key, label: monitorLabel(m, layout.monitors), rect: map(m.bounds), workArea: map(m.workArea) })),
    windows
  }
}

/** 모니터에서 작업 영역 밖의 띠(작업 표시줄 자리. 보통 아래 하나) */
export function taskbarRects(bounds: Rect, workArea: Rect): Rect[] {
  const out: Rect[] = []
  const bRight = bounds.x + bounds.width
  const bBottom = bounds.y + bounds.height
  const wRight = workArea.x + workArea.width
  const wBottom = workArea.y + workArea.height
  if (workArea.y > bounds.y) out.push({ x: bounds.x, y: bounds.y, width: bounds.width, height: workArea.y - bounds.y })
  if (wBottom < bBottom) out.push({ x: bounds.x, y: wBottom, width: bounds.width, height: bBottom - wBottom })
  if (workArea.x > bounds.x) out.push({ x: bounds.x, y: workArea.y, width: workArea.x - bounds.x, height: workArea.height })
  if (wRight < bRight) out.push({ x: wRight, y: workArea.y, width: bRight - wRight, height: workArea.height })
  return out
}

/**
 * 미리 보기 높이: 너비에 모니터 합집합의 비율을 맞추고 [min, max]로 자른다(가로로 놓인 모니터 두 대는 낮게,
 * 위아래로 놓이면 상한까지). 모니터가 없으면 min
 */
export function previewHeight(layout: SavedLayout, width: number, o: { pad: number; min: number; max: number }): number {
  const union = unionOf(layout.monitors)
  if (!union || union.width <= 0) return o.min
  const h = Math.round((Math.max(0, width - 2 * o.pad) * union.height) / union.width + 2 * o.pad)
  return Math.min(o.max, Math.max(o.min, h))
}
