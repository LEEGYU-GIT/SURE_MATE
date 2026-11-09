import type { Rect } from '../types'
import { PET_BASELINE } from './pet-world'
import { PET_WINDOW, SLOT, type PetPose, type SlotSide } from './pet-view'

/** 위로 뛰어오를 때 말풍선이 비켜야 하는 높이(64 격자 14칸). */
export function hopRoom(size: number): number {
  return Math.round((14 / 64) * size)
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

export function menuSize(rows: number): { width: number; height: number } {
  return { width: SLOT.menuWidth, height: rows * SLOT.menuRow + 2 * SLOT.menuPad }
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
