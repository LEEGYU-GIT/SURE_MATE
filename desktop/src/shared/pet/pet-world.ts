import type { BarEdge } from '../bar/bar-settings'
import type { MonitorInfo, Rect } from '../types'

/** 몸 크기 배율: 64칸 그림에서 바닥선 y=58. */
export const PET_BASELINE = 58 / 64
/** 바 면에서 발 가운데까지(몸 크기 배율). */
export const CLIMB_OFFSET = 12 / 64

export interface PetBar {
  rect: Rect
  edge: BarEdge
}

export interface PetWorld {
  displayId: string
  scale: number
  bounds: Rect
  floorY: number
  minX: number
  maxX: number
  topY: number
  bar: PetBar | null
  side: { x: number; top: number; bottom: number; wall: 'left' | 'right' } | null
  ledge: { y: number; x1: number; x2: number; cx: number } | null
}

function insideRect(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

/** 모니터 작업 영역과 바 사각형으로 펫이 다니는 세계를 만든다(모두 DIP). */
export function petWorld(monitor: MonitorInfo, bar: PetBar | null, size: number): PetWorld {
  const { bounds, workArea } = monitor
  const topY = bounds.y + PET_BASELINE * size
  const usable = bar !== null && insideRect(bar.rect, bounds) ? bar : null
  let side: PetWorld['side'] = null
  let ledge: PetWorld['ledge'] = null
  if (usable && usable.rect.y >= topY) {
    const r = usable.rect
    const right = r.x + r.width
    side = {
      x: usable.edge === 'right' ? r.x - CLIMB_OFFSET * size : right + CLIMB_OFFSET * size,
      top: r.y,
      bottom: r.y + r.height,
      wall: usable.edge
    }
    ledge = { y: r.y, x1: r.x, x2: right, cx: (r.x + right) / 2 }
  }
  return {
    displayId: monitor.id,
    scale: monitor.scaleFactor,
    bounds,
    floorY: workArea.y + workArea.height,
    minX: workArea.x + size / 2,
    maxX: workArea.x + workArea.width - size / 2,
    topY,
    bar: usable,
    side,
    ledge
  }
}
