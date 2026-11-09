import type { MonitorInfo, Rect } from '../types'
import type { BarItem } from './bar-items'
import type { BarEdge } from './bar-settings'

type Shape = 'edge' | 'capsule'
interface Size {
  width: number
  height: number
}

/** 모든 값은 DIP */
export const BAR_METRICS = {
  edge: { width: 56, cell: 40, padY: 8, radius: 8 },
  capsule: { width: 44, cell: 36, padY: 12, margin: 12 },
  gap: 4,
  separator: 12,
  screenMargin: 12,
  handle: 6,
  hoverScale: 1.15
} as const

export const DEFAULT_BAR_RATIO = 0.5

const childHeight = (item: BarItem, shape: Shape): number => (item.kind === 'separator' ? BAR_METRICS.separator : BAR_METRICS[shape].cell)

export function barSize(items: BarItem[], shape: Shape): Size {
  const m = BAR_METRICS[shape]
  const sum = items.reduce((s, it) => s + childHeight(it, shape), 0)
  const gaps = Math.max(0, items.length - 1) * BAR_METRICS.gap
  return { width: m.width, height: 2 * m.padY + sum + gaps }
}

/** 구분선을 뺀 항목별 바 안쪽 위치 */
export function itemOffsets(items: BarItem[], shape: Shape): { id: string; top: number; height: number }[] {
  const out: { id: string; top: number; height: number }[] = []
  let y = BAR_METRICS[shape].padY
  for (const it of items) {
    const h = childHeight(it, shape)
    if (it.kind !== 'separator') out.push({ id: it.id, top: y, height: h })
    y += h + BAR_METRICS.gap
  }
  return out
}

/** 구분선이 연속되거나 양 끝에 오지 않게 정리한다. */
function tidySeparators(items: BarItem[]): BarItem[] {
  const out: BarItem[] = []
  for (const it of items) {
    if (it.kind === 'separator' && (out.length === 0 || out[out.length - 1].kind === 'separator')) continue
    out.push(it)
  }
  while (out.length > 0 && out[out.length - 1].kind === 'separator') out.pop()
  return out
}

/** maxHeight를 넘으면 뒤쪽 고정 프롬프트부터 뺀다. 프롬프트가 없어져도 줄어들지 않으면 그대로 돌려준다. */
export function fitBarItems(items: BarItem[], shape: Shape, maxHeight: number): BarItem[] {
  let cur = items
  while (barSize(cur, shape).height > maxHeight) {
    let last = -1
    for (let i = cur.length - 1; i >= 0; i--) {
      if (cur[i].kind === 'prompt') {
        last = i
        break
      }
    }
    if (last < 0) break
    cur = tidySeparators(cur.filter((_, i) => i !== last))
  }
  return cur
}

const topRange = (height: number, workArea: Rect): { min: number; span: number } => ({
  min: workArea.y + BAR_METRICS.screenMargin,
  span: Math.max(0, workArea.height - height - 2 * BAR_METRICS.screenMargin)
})

export function barRect(o: { workArea: Rect; shape: Shape; edge: BarEdge; size: Size; ratio: number }): Rect {
  const { workArea: wa, size } = o
  const inset = o.shape === 'capsule' ? BAR_METRICS.capsule.margin : 0
  const x = o.edge === 'right' ? wa.x + wa.width - size.width - inset : wa.x + inset
  const r = topRange(size.height, wa)
  return { x, y: r.min + Math.round(o.ratio * r.span), width: size.width, height: size.height }
}

/** 자동 숨김 손잡이: 두 모양 모두 작업 영역 끝에 붙는다. */
export function handleRect(bar: Rect, edge: BarEdge, workArea: Rect): Rect {
  const w = BAR_METRICS.handle
  return { x: edge === 'right' ? workArea.x + workArea.width - w : workArea.x, y: bar.y, width: w, height: bar.height }
}

export function ratioFromTop(top: number, height: number, workArea: Rect): number {
  const r = topRange(height, workArea)
  if (r.span <= 0) return 0
  return Math.min(1, Math.max(0, (top - r.min) / r.span))
}

export function dragTop(o: { startTop: number; startY: number; y: number; height: number; workArea: Rect }): number {
  const r = topRange(o.height, o.workArea)
  return Math.min(r.min + r.span, Math.max(r.min, o.startTop + o.y - o.startY))
}

/** 고른 모니터. 없으면 주 모니터, 주 모니터 표시가 없으면 첫 모니터, 목록이 비면 null */
export function pickBarDisplay(monitors: MonitorInfo[], choice: string): MonitorInfo | null {
  return monitors.find((m) => m.id === choice) ?? monitors.find((m) => m.isPrimary) ?? monitors[0] ?? null
}
