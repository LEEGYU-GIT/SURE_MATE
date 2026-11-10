import { describe, expect, it } from 'vitest'
import { monitorFingerprint, monitorKey, monitorOfRect, monitorRole, toSavedMonitor } from './monitors'
import { L, P } from './test-monitors'

describe('monitors', () => {
  it('키', () => {
    expect(monitorKey(P)).toBe('1920x1080@100:0,0')
    expect(monitorKey(L)).toBe('2880x1800@150i:-1920,0')
  })
  it('지문은 순서와 무관하고 구성이 바뀌면 달라진다', () => {
    const want = '2|1920x1080@100:0,0|2880x1800@150i:-1920,0'
    expect(monitorFingerprint([L, P])).toBe(want)
    expect(monitorFingerprint([P, L])).toBe(want)
    expect(monitorFingerprint([P])).toBe('1|1920x1080@100:0,0')
    expect(monitorFingerprint([P, { ...L, scaleFactor: 1.25 }])).not.toBe(want)
    const P2 = { ...P, isPrimary: false, bounds: { ...P.bounds, x: 1920 } }
    const L2 = { ...L, isPrimary: true, bounds: { ...L.bounds, x: 0 } }
    expect(monitorFingerprint([P2, L2])).not.toBe(want)
  })
  it('역할', () => {
    expect(monitorRole(P)).toBe('primary')
    expect(monitorRole(L)).toBe('internal')
    expect(monitorRole({ ...L, isInternal: false })).toBe('secondary')
  })
  it('toSavedMonitor', () => {
    expect(toSavedMonitor(L)).toEqual({
      key: '2880x1800@150i:-1920,0',
      role: 'internal',
      bounds: L.bounds,
      workArea: L.workArea,
      scaleFactor: 1.5
    })
  })
  it('monitorOfRect', () => {
    expect(monitorOfRect({ x: 1800, y: 0, width: 400, height: 400 }, [P, L])).toBe(0)
    expect(monitorOfRect({ x: -100, y: 0, width: 300, height: 300 }, [P, L])).toBe(0)
    expect(monitorOfRect({ x: 5000, y: 5000, width: 10, height: 10 }, [P, L])).toBe(-1)
  })
})
