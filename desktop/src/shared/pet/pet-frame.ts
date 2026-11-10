import type { Rect } from '../types'
import { PET_BASELINE } from './pet-world'
import { PET_WINDOW, SLOT, type PetPose, type SlotSide } from './pet-view'

/** 위로 뛰어오를 때 말풍선이 비켜야 하는 높이(64 격자 14칸). */
export function hopRoom(size: number): number {
  return Math.round((14 / 64) * size)
}

/**
 * 말풍선이 비켜야 하는 높이. 평소에는 폴짝 높이(hopRoom). 조종 중에는 머리 위 조종 표시(격자 −14~−2)가
 * 떠오르고(6칸) 폴짝하므로(14칸) 20칸을 더한다: 그대로 두면 표시가 말풍선 꼬리에 닿는다(미리 보기 pet-control).
 */
export function bubbleHop(size: number, controlling: boolean): number {
  return hopRoom(size) + (controlling ? Math.round((20 / 64) * size) : 0)
}

/** 발 위치(화면 DIP)로 64 격자 펫 상자를 만든다. */
export function petBox(foot: { x: number; y: number }, size: number): Rect {
  return { x: foot.x - size / 2, y: foot.y - PET_BASELINE * size, width: size, height: size }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi)
}

/** 상자를 창 아래 가운데에 두고 bounds 안으로 자른 뒤 반올림한다(옆 모니터에 걸치지 않게). */
export function petWindowRect(box: Rect, bounds: Rect): Rect {
  const { width, height } = PET_WINDOW
  const x = clamp(box.x + box.width / 2 - width / 2, bounds.x, bounds.x + bounds.width - width)
  const y = clamp(box.y + box.height - height, bounds.y, bounds.y + bounds.height - height)
  return { x: Math.round(x), y: Math.round(y), width, height }
}

/** 말풍선·메뉴 자리: 위쪽이 되면 위, 아니면 여유가 큰 옆. 반환 rect는 화면 DIP. */
export function placeSlot(o: {
  size: { width: number; height: number }
  box: Rect
  window: Rect
  bounds: Rect
  hop: number
}): { rect: Rect; side: SlotSide } {
  const { size, box, window, bounds, hop } = o
  const { width: w, height: h } = size
  const m = SLOT.margin
  const winRight = window.x + window.width
  const winBottom = window.y + window.height

  const ax = clamp(box.x + box.width / 2 - w / 2, window.x + m, winRight - m - w)
  const ay = box.y - hop - SLOT.gap - h
  if (ay >= window.y + m && ay >= bounds.y + m) {
    return { side: 'above', rect: { x: ax, y: ay, width: w, height: h } }
  }

  const leftRoom = box.x - window.x
  const rightRoom = winRight - (box.x + box.width)
  const sy = clamp(box.y + box.height / 2 - h / 2, window.y + m, winBottom - m - h)
  if (leftRoom > rightRoom) {
    return { side: 'left', rect: { x: box.x - SLOT.gap - w, y: sy, width: w, height: h } }
  }
  return { side: 'right', rect: { x: box.x + box.width + SLOT.gap, y: sy, width: w, height: h } }
}

/**
 * 말풍선 자리(최대 200×96, 화면 DIP). placeSlot을 따르되, 옆자리가 창 밖으로 나가면(양옆 모두 200 + 8이 안 될 때:
 * 화면 위쪽 가운데) 여유 쪽 폭으로 줄이고 같은 면적만큼 높이를 늘려 창 안에 둔다. 창은 반응 동안 옮기지 않는다.
 */
export function bubbleSlot(o: { box: Rect; window: Rect; bounds: Rect; hop: number }): { rect: Rect; side: SlotSide } {
  const { box, window } = o
  const w = SLOT.bubbleWidth
  const h = SLOT.bubbleMaxHeight
  const placed = placeSlot({ size: { width: w, height: h }, box, window, bounds: o.bounds, hop: o.hop })
  if (placed.side === 'above') return placed
  const m = SLOT.margin
  const lo = placed.side === 'left' ? window.x + m : box.x + box.width + SLOT.gap
  const hi = placed.side === 'left' ? box.x - SLOT.gap : window.x + window.width - m
  if (placed.rect.x >= lo && placed.rect.x + placed.rect.width <= hi) return placed
  const width = Math.max(1, hi - lo)
  const height = Math.min(window.height - 2 * m, Math.ceil((w * h) / width))
  const y = clamp(box.y + box.height / 2 - height / 2, window.y + m, window.y + window.height - m - height)
  return { side: placed.side, rect: { x: lo, y, width, height } }
}

export function menuSize(rows: number): { width: number; height: number } {
  return { width: SLOT.menuWidth, height: rows * SLOT.menuRow + 2 * SLOT.menuPad }
}

/**
 * 오른쪽 클릭 메뉴 자리(menuSize(rows), 화면 DIP). placeSlot과 같은 규칙(위쪽이 되면 펫 상자 위, 아니면 여유가 큰 옆)이되
 * hop은 0이고(메뉴가 열린 동안 펫은 폴짝하지 않는다), 창 가장자리 여백은 그림자가 잘리지 않는 SLOT.menuMargin이다.
 * 옆자리가 창 밖으로 나가면(양옆 모두 메뉴 + 여백이 안 될 때) 창 안으로 자른다: 메뉴는 말풍선처럼 줄일 수 없고,
 * 투명 창 밖은 그려지지 않는다. 그런 드문 자리에서는 메뉴가 펫 상자에 겹칠 수 있다.
 */
export function menuSlot(o: { rows: number; box: Rect; window: Rect; bounds: Rect }): { rect: Rect; side: SlotSide } {
  const { width: w, height: h } = menuSize(o.rows)
  const { box, window: win, bounds } = o
  const M = SLOT.menuMargin
  const xLo = win.x + M.side
  const xHi = win.x + win.width - M.side - w
  const ay = box.y - SLOT.gap - h
  if (ay >= win.y + M.top && ay >= bounds.y + M.top) {
    return { side: 'above', rect: { x: clamp(box.x + box.width / 2 - w / 2, xLo, xHi), y: ay, width: w, height: h } }
  }
  const side: SlotSide = box.x - win.x > win.x + win.width - (box.x + box.width) ? 'left' : 'right'
  const x = side === 'left' ? box.x - SLOT.gap - w : box.x + box.width + SLOT.gap
  const y = clamp(box.y + box.height / 2 - h / 2, win.y + M.top, win.y + win.height - M.bottom - h)
  return { side, rect: { x: clamp(x, xLo, xHi), y, width: w, height: h } }
}

type Cell = readonly [number, number, number, number]

const BODY: Cell[] = [[14, 15, 36, 12], [7, 27, 50, 33]]
const SHAPES: Record<PetPose, Cell[]> = {
  stand: BODY,
  walk: BODY,
  air: BODY,
  sit: [[12, 29, 40, 8], [5, 37, 54, 23]],
  sleep: [[12, 32, 40, 8], [5, 40, 54, 20]],
  climb: [[11, 7, 33, 52]],
  held: [[18, 3, 28, 58]]
}

/** 자세별 클릭 판정 사각형(소품 제외). 64 격자를 상자 크기로 늘린다. */
export function hitShape(pose: PetPose, box: Rect, mirror: boolean): Rect[] {
  const sx = box.width / 64
  const sy = box.height / 64
  return SHAPES[pose].map(([x, y, w, h]) => {
    const gx = mirror ? 64 - x - w : x
    return { x: box.x + gx * sx, y: box.y + y * sy, width: w * sx, height: h * sy }
  })
}

export function isOver(p: { x: number; y: number }, rects: (Rect | null)[]): boolean {
  return rects.some(
    (r) => r !== null && p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height
  )
}
