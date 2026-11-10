import { describe, expect, it } from 'vitest'
import { bubbleHop, bubbleSlot, hitShape, hopRoom, isOver, menuSize, menuSlot, petBox, petWindowRect, placeSlot } from './pet-frame'
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

describe('bubbleHop: 말풍선이 비켜야 하는 높이', () => {
  it('평소에는 폴짝 높이(hopRoom), 조종 중에는 머리 위 조종 표시(격자 −14)가 떠오르고(6) 폴짝하는(14) 만큼 더한다', () => {
    expect(bubbleHop(56, false)).toBe(hopRoom(56))
    expect(bubbleHop(56, true)).toBe(12 + 18) // 20 / 64 × 56 = 17.5 → 18
    expect(bubbleHop(40, true)).toBe(9 + 13)
    expect(bubbleHop(72, true)).toBe(16 + 23)
  })

  it('조종 중 말풍선 꼬리 끝(말풍선 아래 + 7)이 폴짝·떠오른 조종 표시 꼭대기(격자 −13.5 − 14 − 6)보다 위', () => {
    for (const size of [40, 56, 72]) {
      const k = size / 64
      const tailTip = -(bubbleHop(size, true) + SLOT.gap) + 7
      expect(tailTip, String(size)).toBeLessThan((-13.5 - 14 - 6) * k)
    }
  })
})

describe('menuSlot: 오른쪽 클릭 메뉴 자리(placeSlot(menuSize(4)), 창 안)', () => {
  const inside = (r: Rect, w: Rect): boolean =>
    r.x >= w.x + SLOT.margin && r.y >= w.y + SLOT.margin && r.x + r.width <= w.x + w.width - SLOT.margin && r.y + r.height <= w.y + w.height - SLOT.margin

  it('바닥 펫은 위(메뉴 동안 폴짝하지 않으므로 펫 상자 위 8 DIP), placeSlot과 같은 자리', () => {
    const box = petBox({ x: 960, y: 1040 }, 56)
    const window = petWindowRect(box, MAIN)
    const r = menuSlot({ rows: 4, box, window, bounds: MAIN })
    expect(r).toEqual({ side: 'above', rect: { x: 872, y: 845.25, width: 176, height: 136 } })
    expect(r).toEqual(placeSlot({ size: menuSize(4), box, window, bounds: MAIN, hop: 0 }))
  })

  it('꼭대기가 화면 위쪽이면 옆(여유가 큰 쪽)', () => {
    const box: Rect = { x: 1864, y: 69.25, width: 56, height: 56 }
    const window: Rect = { x: 1600, y: 0, width: 320, height: 240 }
    const r = menuSlot({ rows: 4, box, window, bounds: MAIN })
    expect(r).toEqual({ side: 'left', rect: { x: 1680, y: 29.25, width: 176, height: 136 } })
    expect(inside(r.rect, window)).toBe(true)
  })

  it('(Task 4 이월) 옆자리가 창을 넘으면 창 안으로 자른다(메뉴는 줄일 수 없다)', () => {
    const box: Rect = { x: 932, y: 20, width: 56, height: 56 }
    const window: Rect = { x: 800, y: 0, width: 320, height: 240 }
    const raw = placeSlot({ size: menuSize(4), box, window, bounds: MAIN, hop: 0 })
    expect(raw.rect.x + raw.rect.width).toBeGreaterThan(window.x + window.width)
    const r = menuSlot({ rows: 4, box, window, bounds: MAIN })
    expect(r.side).toBe('right')
    expect(r.rect).toEqual({ x: 920, y: 16, width: 176, height: 136 })
    expect(inside(r.rect, window)).toBe(true)
  })

  it('그림자(--shadow-flyout: 아래로 8, 흐림 24)가 투명 창에서 잘리지 않게 창 가장자리에서 위 16·옆 24·아래 32 떨어진다(말풍선은 그림자가 없어 8)', () => {
    expect(SLOT.menuMargin).toEqual({ top: 16, side: 24, bottom: 32 })
    const M = SLOT.menuMargin
    const window: Rect = { x: 1600, y: 0, width: 320, height: 240 }
    // 꼭대기가 화면 위에서 조금 내려온 바: 옆자리 아래 끝이 창 아래 32에서 멈춘다
    const low = menuSlot({ rows: 4, box: { x: 1864, y: 140, width: 56, height: 56 }, window, bounds: MAIN })
    expect(low).toEqual({ side: 'left', rect: { x: 1680, y: 72, width: 176, height: 136 } })
    expect(window.y + window.height - (low.rect.y + low.rect.height)).toBe(M.bottom)
    // 위쪽 자리는 창 위 16까지(16 안이면 옆으로)
    const above = menuSlot({ rows: 4, box: { x: 1864, y: 160, width: 56, height: 56 }, window, bounds: MAIN })
    expect(above).toMatchObject({ side: 'above', rect: { y: M.top } })
    const side = menuSlot({ rows: 4, box: { x: 1864, y: 159, width: 56, height: 56 }, window, bounds: MAIN })
    expect(side.side).toBe('left')
    // 옆은 24: 화면 왼쪽 끝 바닥 펫(창이 화면 끝에 멈춤)
    const edgeBox = petBox({ x: 40, y: 1040 }, 56)
    const edgeWin = petWindowRect(edgeBox, MAIN)
    expect(menuSlot({ rows: 4, box: edgeBox, window: edgeWin, bounds: MAIN }).rect.x).toBe(edgeWin.x + M.side)
    // 크기 40·56·72 바닥 펫은 모두 위쪽 자리
    for (const size of [40, 56, 72]) {
      const box = petBox({ x: 960, y: 1040 }, size)
      const w = petWindowRect(box, MAIN)
      const r = menuSlot({ rows: 4, box, window: w, bounds: MAIN })
      expect(r.side, String(size)).toBe('above')
      expect(r.rect.y - w.y, String(size)).toBeGreaterThanOrEqual(M.top)
      expect(r.rect.x - w.x, String(size)).toBeGreaterThanOrEqual(M.side)
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
