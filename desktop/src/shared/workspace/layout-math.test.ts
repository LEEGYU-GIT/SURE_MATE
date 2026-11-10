import { describe, expect, it } from 'vitest'
import { fromRatio, keepOnScreen, toRatio } from './layout-math'
import { L, P } from './test-monitors'

describe('layout-math', () => {
  it('toRatio·fromRatio', () => {
    expect(toRatio({ x: 960, y: 0, width: 960, height: 1040 }, P.workArea)).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 })
    const r = toRatio({ x: 100, y: 50, width: 333, height: 777 }, P.workArea)
    expect(r).toEqual({ x: 0.0521, y: 0.0481, w: 0.1734, h: 0.7471 })
    expect(fromRatio(r, P.workArea)).toEqual({ x: 100, y: 50, width: 333, height: 777 })
    expect(toRatio({ x: -1920, y: 0, width: 960, height: 576 }, L.workArea)).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 })
  })
  it('keepOnScreen', () => {
    const wa = P.workArea
    expect(keepOnScreen({ x: 1900, y: -30, width: 800, height: 600 }, wa)).toEqual({ x: 1872, y: 0, width: 800, height: 600 })
    expect(keepOnScreen({ x: -900, y: 100, width: 800, height: 600 }, wa)).toEqual({ x: -752, y: 100, width: 800, height: 600 })
    expect(keepOnScreen({ x: -100, y: 0, width: 2500, height: 900 }, wa)).toEqual({ x: 0, y: 0, width: 1920, height: 900 })
    expect(keepOnScreen({ x: 0, y: 1030, width: 400, height: 300 }, wa).y).toBe(992)
  })
})
