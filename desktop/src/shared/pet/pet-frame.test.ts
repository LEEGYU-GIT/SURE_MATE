import { describe, expect, it } from 'vitest'
import { hitShape, hopRoom, isOver, menuSize, petBox, petWindowRect, placeSlot } from './pet-frame'
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
