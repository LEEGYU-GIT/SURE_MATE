import { describe, expect, it } from 'vitest'
import { edgeCardRect, flyoutCardRect, flyoutWindowRect } from './flyout-placement'

const WA = { x: 0, y: 0, width: 1920, height: 1040 }
const bar = { x: 1864, y: 292, width: 56, height: 456 }
const item = { x: 1864, y: 344, width: 56, height: 40 }

describe('flyoutCardRect', () => {
  it('오른쪽 바: 바 안쪽 8 DIP, 항목 위쪽에 맞춤', () => {
    const card = flyoutCardRect({ size: { width: 260, height: 160 }, anchor: item, bar, edge: 'right', workArea: WA, align: 'top' })
    expect(card).toEqual({ x: 1596, y: 344, width: 260, height: 160 })
    const w = flyoutWindowRect(card, 'right')
    expect(w.window).toEqual({ x: 1572, y: 328, width: 284, height: 208 })
    expect(w.pad).toEqual({ top: 16, right: 0, bottom: 32, left: 24 })
  })

  it('이름표는 항목 세로 가운데', () => {
    expect(flyoutCardRect({ size: { width: 120, height: 24 }, anchor: item, bar, edge: 'right', workArea: WA, align: 'center' })).toEqual({
      x: 1736, y: 352, width: 120, height: 24
    })
  })

  it('왼쪽 바: 바 오른쪽 8 DIP, 여백은 오른쪽', () => {
    const lbar = { x: 0, y: 292, width: 56, height: 456 }
    const card = flyoutCardRect({ size: { width: 260, height: 160 }, anchor: { ...item, x: 0 }, bar: lbar, edge: 'left', workArea: WA, align: 'top' })
    expect(card.x).toBe(64)
    const w = flyoutWindowRect(card, 'left')
    expect(w.pad).toEqual({ top: 16, right: 24, bottom: 32, left: 0 })
    expect(w.window.x).toBe(64)
  })

  it('아래쪽 항목은 작업 영역 안으로 올리고, 너무 큰 높이는 560으로 줄인다', () => {
    const low = { ...item, y: 1000 }
    expect(flyoutCardRect({ size: { width: 260, height: 300 }, anchor: low, bar, edge: 'right', workArea: WA, align: 'top' }).y).toBe(732)
    const tall = flyoutCardRect({ size: { width: 260, height: 900 }, anchor: low, bar, edge: 'right', workArea: WA, align: 'top' })
    expect(tall.height).toBe(560)
    expect(tall.y + tall.height).toBeLessThanOrEqual(1040 - 8)
  })

  it('위쪽에서도 가장자리 8 DIP 안쪽', () => {
    const top = { ...item, y: 0 }
    expect(flyoutCardRect({ size: { width: 120, height: 24 }, anchor: top, bar, edge: 'right', workArea: WA, align: 'center' }).y).toBe(8)
  })
})

describe('edgeCardRect', () => {
  it('바 쪽 가장자리 위쪽, 12 DIP 안쪽', () => {
    expect(edgeCardRect({ size: { width: 360, height: 200 }, workArea: WA, edge: 'right' })).toEqual({ x: 1548, y: 12, width: 360, height: 200 })
    expect(edgeCardRect({ size: { width: 360, height: 200 }, workArea: WA, edge: 'left' }).x).toBe(12)
  })

  it('작업 영역 원점이 0이 아닌 모니터', () => {
    expect(edgeCardRect({ size: { width: 360, height: 200 }, workArea: { x: 1920, y: 0, width: 1920, height: 1040 }, edge: 'right' }).x).toBe(3468)
  })
})

describe('작업 영역 안의 창 사각형', () => {
  const inside = (w: { x: number; y: number; width: number; height: number }, wa: typeof WA): boolean =>
    w.x >= wa.x && w.y >= wa.y && w.x + w.width <= wa.x + wa.width && w.y + w.height <= wa.y + wa.height

  for (const edge of ['left', 'right'] as const) {
    const b = edge === 'right' ? bar : { x: 0, y: 292, width: 56, height: 456 }
    for (const [name, y] of [['위쪽', 0], ['아래쪽', 1040]] as const) {
      it(`${edge} 바 ${name} 끝: 창과 여백이 작업 영역 안, 카드 위치는 그대로`, () => {
        const card = flyoutCardRect({ size: { width: 260, height: 160 }, anchor: { ...b, y, height: 40 }, bar: b, edge, workArea: WA, align: 'top' })
        const w = flyoutWindowRect(card, edge, WA)
        expect(inside(w.window, WA)).toBe(true)
        expect(w.window.x + w.pad.left).toBe(card.x)
        expect(w.window.y + w.pad.top).toBe(card.y)
        expect(w.window.width - w.pad.left - w.pad.right).toBe(card.width)
        expect(w.window.height - w.pad.top - w.pad.bottom).toBe(card.height)
        if (y === 0) expect(w.pad.top).toBe(8)
        else expect(w.pad.bottom).toBe(8)
      })
    }
  }

  it('여유가 있으면 여백을 줄이지 않는다', () => {
    const card = { x: 1596, y: 344, width: 260, height: 160 }
    expect(flyoutWindowRect(card, 'right', WA).pad).toEqual({ top: 16, right: 0, bottom: 32, left: 24 })
  })
})

describe('작업 영역 원점이 0이 아닌 모니터', () => {
  for (const ox of [-1920, 1920]) {
    it(`원점 x=${ox}`, () => {
      const wa = { x: ox, y: 0, width: 1920, height: 1040 }
      const b = { x: ox + 1864, y: 292, width: 56, height: 456 }
      const card = flyoutCardRect({ size: { width: 260, height: 160 }, anchor: { ...b, y: 344, height: 40 }, bar: b, edge: 'right', workArea: wa, align: 'top' })
      expect(card.x).toBe(ox + 1596)
      const lb = { x: ox, y: 292, width: 56, height: 456 }
      expect(flyoutCardRect({ size: { width: 260, height: 160 }, anchor: { ...lb, y: 344, height: 40 }, bar: lb, edge: 'left', workArea: wa, align: 'top' }).x).toBe(ox + 64)
      // 바 위치가 어긋나도 카드는 이 모니터의 작업 영역 안으로 들어온다
      const far = flyoutCardRect({ size: { width: 260, height: 160 }, anchor: b, bar: { ...b, x: ox - 500 }, edge: 'right', workArea: wa, align: 'top' })
      expect(far.x).toBe(ox + 8)
    })
  }
})
