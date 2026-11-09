import { describe, expect, it } from 'vitest'
import type { MonitorInfo } from '../types'
import { petWorld } from './pet-world'

const mon = (workArea = { x: 0, y: 0, width: 1920, height: 1040 }): MonitorInfo => ({
  id: '1',
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea,
  scaleFactor: 1,
  isPrimary: true,
  isInternal: false
})
const right = { rect: { x: 1864, y: 292, width: 56, height: 456 }, edge: 'right' as const }

describe('petWorld', () => {
  it('오른쪽 띠', () => {
    const w = petWorld(mon(), right, 56)
    expect(w.floorY).toBe(1040)
    expect(w.minX).toBe(28)
    expect(w.maxX).toBe(1892)
    expect(w.topY).toBe(50.75)
    expect(w.side).toEqual({ x: 1853.5, top: 292, bottom: 748, wall: 'right' })
    expect(w.ledge).toEqual({ y: 292, x1: 1864, x2: 1920, cx: 1892 })
  })
  it('왼쪽 띠', () => {
    const w = petWorld(mon(), { rect: { x: 0, y: 292, width: 56, height: 456 }, edge: 'left' }, 56)
    expect(w.side).toEqual({ x: 66.5, top: 292, bottom: 748, wall: 'left' })
  })
  it('오른쪽 캡슐', () => {
    const w = petWorld(mon(), { rect: { x: 1864, y: 306, width: 44, height: 428 }, edge: 'right' }, 56)
    expect(w.side?.x).toBe(1853.5)
    expect(w.ledge?.cx).toBe(1886)
  })
  it('작업 표시줄 위치별 바닥과 벽', () => {
    const left = petWorld(mon({ x: 48, y: 0, width: 1872, height: 1080 }), null, 56)
    expect(left.floorY).toBe(1080)
    expect(left.minX).toBe(76)
    expect(petWorld(mon({ x: 0, y: 40, width: 1920, height: 1040 }), null, 56).floorY).toBe(1080)
    expect(petWorld(mon({ x: 0, y: 0, width: 1920, height: 1080 }), null, 56).floorY).toBe(1080)
  })
  it('다른 모니터 좌표의 바는 쓰지 않는다', () => {
    const w = petWorld(mon(), { rect: { x: -1280, y: 292, width: 56, height: 456 }, edge: 'right' }, 56)
    expect(w.bar).toBeNull()
    expect(w.side).toBeNull()
    expect(w.ledge).toBeNull()
  })
  it('꼭대기 위에 자리가 없으면 오르지 않는다', () => {
    const w = petWorld(mon(), { rect: { x: 1864, y: 12, width: 56, height: 456 }, edge: 'right' }, 56)
    expect(w.side).toBeNull()
    expect(w.ledge).toBeNull()
  })
})
