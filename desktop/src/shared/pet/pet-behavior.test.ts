import { describe, expect, it, vi } from 'vitest'
import type { MonitorInfo } from '../types'
import { choosePlan, pickMs, PET_TIMING } from './pet-behavior'
import type { PetActivity } from './pet-settings'
import { petWorld } from './pet-world'

const mon: MonitorInfo = {
  id: '1',
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  scaleFactor: 1,
  isPrimary: true,
  isInternal: false
}
const withBar = petWorld(mon, { rect: { x: 1864, y: 292, width: 56, height: 456 }, edge: 'right' }, 56)
const noBar = petWorld(mon, null, 56)

const seq = (...v: number[]): (() => number) => {
  let i = 0
  return vi.fn(() => v[i++])
}
const plan = (o: { activity?: PetActivity; world?: typeof withBar; footX?: number; sinceBarMs?: number | null; random: () => number }) =>
  choosePlan({ activity: 'normal', world: withBar, footX: 1000, sinceBarMs: 44999, ...o })

describe('choosePlan 바 방문 보장', () => {
  it('아직 바에 가지 않았으면 random 없이 bar', () => {
    const random = vi.fn(() => 0)
    expect(plan({ sinceBarMs: null, random })).toEqual({ kind: 'bar' })
    expect(random).toHaveBeenCalledTimes(0)
  })
  it('45,000ms 이상이면 bar', () => {
    expect(plan({ sinceBarMs: 45000, random: () => 0 })).toEqual({ kind: 'bar' })
  })
  it('바 없는 세계에서는 bar가 아니다', () => {
    expect(plan({ world: noBar, sinceBarMs: null, random: seq(0, 0) }).kind).not.toBe('bar')
  })
})

describe('choosePlan 가중치', () => {
  it('보통: 가만히 12.5초, random 2회', () => {
    const random = seq(0.0, 0.5)
    expect(plan({ random })).toEqual({ kind: 'idle', ms: 12500 })
    expect(random).toHaveBeenCalledTimes(2)
  })
  it('보통: 걷기·바', () => {
    expect(plan({ random: seq(0.5, 0.5) }).kind).toBe('walk')
    const random = seq(0.9)
    expect(plan({ random })).toEqual({ kind: 'bar' })
    expect(random).toHaveBeenCalledTimes(1)
  })
  it('차분·활발', () => {
    expect(plan({ activity: 'calm', random: seq(0.65, 0.5) }).kind).toBe('walk')
    expect(plan({ activity: 'calm', random: seq(0.95) }).kind).toBe('bar')
    expect(plan({ activity: 'lively', random: seq(0.15, 0.5) }).kind).toBe('idle')
  })
  it('바 없음: 나머지 비율 유지', () => {
    expect(plan({ world: noBar, random: seq(0.45, 0.5) }).kind).toBe('idle')
    expect(plan({ world: noBar, random: seq(0.55, 0.5) }).kind).toBe('walk')
    expect(plan({ world: noBar, random: seq(0.99, 0.5) }).kind).toBe('walk')
  })
})

describe('걷기 목적지', () => {
  it('가까우면 같은 방향으로 120', () => {
    expect(plan({ random: seq(0.5, 0.5) })).toEqual({ kind: 'walk', x: 880 })
    expect(plan({ footX: 60, random: seq(0.5, 0.02) })).toEqual({ kind: 'walk', x: 180 })
  })
  it('범위를 넘으면 반대 방향', () => {
    expect(plan({ footX: 1850, random: seq(0.5, 0.99) })).toEqual({ kind: 'walk', x: 1730 })
  })
  it('항상 범위 안, 폭 0이어도 NaN 없음', () => {
    const w = { ...noBar, minX: 500, maxX: 500 }
    const p = plan({ world: w, footX: 500, random: seq(0.5, 0.5) })
    expect(p).toEqual({ kind: 'walk', x: 500 })
  })
})

describe('pickMs', () => {
  it('끝값', () => {
    expect(pickMs([5000, 20000], 0)).toBe(5000)
    expect(pickMs([5000, 20000], 0.999999)).toBe(20000)
    expect(PET_TIMING.minWalk).toBe(120)
  })
})
