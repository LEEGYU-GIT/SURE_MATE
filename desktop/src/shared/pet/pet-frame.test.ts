import { describe, expect, it } from 'vitest'
import { bubbleSlot, hitShape, hopRoom, isOver, menuSize, petBox, petWindowRect, placeSlot } from './pet-frame'
import { SLOT } from './pet-view'
import type { Rect } from '../types'

const MAIN: Rect = { x: 0, y: 0, width: 1920, height: 1080 }

describe('petBox / petWindowRect', () => {
  it('floor pet', () => {
    const box = petBox({ x: 960, y: 1040 }, 56)
    expect(box).toEqual({ x: 932, y: 989.25, width: 56, height: 56 })
    expect(petWindowRect(box, MAIN)).toEqual({ x: 800, y: 805, width: 320, height: 240 })
  })

  it('top of bar', () => {
    const box = petBox({ x: 1892, y: 292 }, 56)
    expect(box).toEqual({ x: 1864, y: 241.25, width: 56, height: 56 })
    expect(petWindowRect(box, MAIN)).toEqual({ x: 1600, y: 57, width: 320, height: 240 })
  })

  it('stops at screen edges', () => {
    expect(petWindowRect(petBox({ x: 960, y: 100 }, 56), MAIN).y).toBe(0)
    expect(petWindowRect(petBox({ x: 28, y: 500 }, 56), MAIN).x).toBe(0)
  })

  it('stays inside a secondary monitor', () => {
    const b: Rect = { x: -1280, y: 0, width: 1280, height: 1024 }
    for (const foot of [{ x: -1260, y: 20 }, { x: -10, y: 1000 }, { x: -640, y: 500 }]) {
      const w = petWindowRect(petBox(foot, 56), b)
      expect(w.x).toBeGreaterThanOrEqual(b.x)
      expect(w.y).toBeGreaterThanOrEqual(b.y)
      expect(w.x + w.width).toBeLessThanOrEqual(b.x + b.width)
      expect(w.y + w.height).toBeLessThanOrEqual(b.y + b.height)
    }
  })
})

describe('placeSlot', () => {
  it('hopRoom', () => expect(hopRoom(56)).toBe(12))

  it('above for floor pet', () => {
    const box = petBox({ x: 960, y: 1040 }, 56)
    const window = petWindowRect(box, MAIN)
    const r = placeSlot({ size: { width: 200, height: 80 }, box, window, bounds: MAIN, hop: 12 })
    expect(r).toEqual({ side: 'above', rect: { x: 860, y: 889.25, width: 200, height: 80 } })
  })

  const box: Rect = { x: 1864, y: 69.25, width: 56, height: 56 }
  const window: Rect = { x: 1600, y: 0, width: 320, height: 240 }

  it('left when no room above', () => {
    const r = placeSlot({ size: { width: 200, height: 80 }, box, window, bounds: MAIN, hop: 12 })
    expect(r).toEqual({ side: 'left', rect: { x: 1656, y: 57.25, width: 200, height: 80 } })
  })

  it('menu on the left', () => {
    expect(menuSize(4)).toEqual({ width: 176, height: 136 })
    const r = placeSlot({ size: menuSize(4), box, window, bounds: MAIN, hop: 12 })
    expect(r.side).toBe('left')
    expect(r.rect.x).toBe(1680)
    expect(r.rect.y).toBe(29.25)
  })

  it('right for a bar on the left edge', () => {
    const b: Rect = { x: 0, y: 69.25, width: 56, height: 56 }
    const w: Rect = { x: 0, y: 0, width: 320, height: 240 }
    const r = placeSlot({ size: { width: 200, height: 80 }, box: b, window: w, bounds: MAIN, hop: 12 })
    expect(r.side).toBe('right')
    expect(r.rect.x).toBe(64)
  })
})

describe('bubbleSlot: 말풍선 자리(200×96, placeSlot)를 창 안에 둔다', () => {
  const BUBBLE = { width: SLOT.bubbleWidth, height: SLOT.bubbleMaxHeight }
  const inside = (r: Rect, w: Rect): boolean =>
    r.x >= w.x + SLOT.margin && r.y >= w.y + SLOT.margin && r.x + r.width <= w.x + w.width - SLOT.margin && r.y + r.height <= w.y + w.height - SLOT.margin
  const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

  it('자리가 있으면 placeSlot 그대로(바닥 펫은 위, 꼭대기가 화면 위쪽이면 옆)', () => {
    const box = petBox({ x: 960, y: 1040 }, 56)
    const window = petWindowRect(box, MAIN)
    expect(bubbleSlot({ box, window, bounds: MAIN, hop: 12 })).toEqual(placeSlot({ size: BUBBLE, box, window, bounds: MAIN, hop: 12 }))
    const top: Rect = { x: 1864, y: 69.25, width: 56, height: 56 }
    const topWindow: Rect = { x: 1600, y: 0, width: 320, height: 240 }
    const r = bubbleSlot({ box: top, window: topWindow, bounds: MAIN, hop: 12 })
    expect(r).toEqual({ side: 'left', rect: { x: 1656, y: 49.25, width: 200, height: 96 } })
    expect(inside(r.rect, topWindow)).toBe(true)
  })

  it('(Task 4 이월) 양옆 모두 200 + 8이 안 되면(화면 위쪽 가운데) 여유 쪽 폭으로 줄이고 높이를 늘려 창 안에 둔다', () => {
    // 창이 펫 가운데에 있다: 양옆 여유 132 < 208. placeSlot은 오른쪽 76 DIP를 창 밖에 둔다
    const box: Rect = { x: 932, y: 20, width: 56, height: 56 }
    const window: Rect = { x: 800, y: 0, width: 320, height: 240 }
    const raw = placeSlot({ size: BUBBLE, box, window, bounds: MAIN, hop: 12 })
    expect(raw.rect.x + raw.rect.width).toBeGreaterThan(window.x + window.width)
    const r = bubbleSlot({ box, window, bounds: MAIN, hop: 12 })
    expect(r.side).toBe('right')
    expect(r.rect).toEqual({ x: 996, y: 8, width: 116, height: 166 })
    expect(inside(r.rect, window)).toBe(true)
    expect(overlaps(r.rect, box)).toBe(false)
    // 면적은 기본 자리만큼(글이 4줄 대신 8줄까지 들어간다)
    expect(r.rect.width * r.rect.height).toBeGreaterThanOrEqual(SLOT.bubbleWidth * SLOT.bubbleMaxHeight)
  })

  it('(Task 4 이월) 왼쪽 여유가 더 크면 왼쪽으로 줄이고, 펫 상자와 겹치지 않는다', () => {
    const box: Rect = { x: 950, y: 30, width: 56, height: 56 }
    const window: Rect = { x: 800, y: 0, width: 320, height: 240 }
    const r = bubbleSlot({ box, window, bounds: MAIN, hop: 12 })
    expect(r.side).toBe('left')
    expect(r.rect.x).toBe(window.x + SLOT.margin)
    expect(r.rect.x + r.rect.width).toBe(box.x - SLOT.gap)
    expect(inside(r.rect, window)).toBe(true)
    expect(overlaps(r.rect, box)).toBe(false)
  })

  it('크기 72·40에서도 창 안(화면 위쪽 가운데)', () => {
    for (const size of [40, 72]) {
      const box = petBox({ x: 960, y: 0.9 * size }, size)
      const window = petWindowRect(box, MAIN)
      const r = bubbleSlot({ box, window, bounds: MAIN, hop: hopRoom(size) })
      expect(inside(r.rect, window), String(size)).toBe(true)
      expect(overlaps(r.rect, box), String(size)).toBe(false)
    }
  })
})

describe('hitShape', () => {
  const unit: Rect = { x: 0, y: 0, width: 64, height: 64 }
  it('body only', () => {
    const s = hitShape('stand', unit, false)
    expect(isOver({ x: 32, y: 40 }, s)).toBe(true)
    expect(isOver({ x: 32, y: 20 }, s)).toBe(true)
    expect(isOver({ x: 4, y: 4 }, s)).toBe(false)
    expect(isOver({ x: 60, y: 58 }, s)).toBe(false)
  })
  it('scales to the box', () => {
    expect(isOver({ x: 116, y: 120 }, hitShape('stand', { x: 100, y: 100, width: 32, height: 32 }, false))).toBe(true)
  })
  it('mirrors', () => {
    expect(hitShape('climb', unit, true)).toEqual([{ x: 20, y: 7, width: 33, height: 52 }])
  })
  it('isOver skips null', () => {
    expect(isOver({ x: 1, y: 1 }, [null, { x: 0, y: 0, width: 5, height: 5 }])).toBe(true)
    expect(isOver({ x: 1, y: 1 }, [null])).toBe(false)
  })
})
