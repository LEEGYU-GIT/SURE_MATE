import type { PetActivity } from './pet-settings'
import type { PetWorld } from './pet-world'

export type PetPlan = { kind: 'idle'; ms: number } | { kind: 'walk'; x: number } | { kind: 'bar' }

/** 시간은 ms, minWalk는 DIP. 가만히·쉼 범위는 [최소, 최대]. */
export const PET_TIMING = {
  firstIdleMs: 3000,
  idleMs: [5000, 20000],
  sitMs: [30000, 90000],
  barEveryMs: 45000,
  minWalk: 120
} as const

/** 활발함별 가만히·걷기·바 가중치(설계에 없는 값). */
export const ACTIVITY_WEIGHTS: Record<PetActivity, { idle: number; walk: number; bar: number }> = {
  calm: { idle: 0.6, walk: 0.3, bar: 0.1 },
  normal: { idle: 0.4, walk: 0.4, bar: 0.2 },
  lively: { idle: 0.2, walk: 0.5, bar: 0.3 }
}

export function pickMs(range: readonly [number, number], r: number): number {
  return Math.round(range[0] + r * (range[1] - range[0]))
}

export interface PlanContext {
  activity: PetActivity
  world: PetWorld
  footX: number
  /** 바에 마지막으로 다녀온 뒤 ms. 시작·깬 뒤 아직 가지 않았으면 null */
  sinceBarMs: number | null
  random: () => number
}

function destination(world: PetWorld, footX: number, r: number): number {
  const { minX, maxX } = world
  const raw = minX + r * (maxX - minX)
  let x = raw
  if (Math.abs(raw - footX) < PET_TIMING.minWalk) {
    const dir = raw >= footX ? 1 : -1
    x = footX + dir * PET_TIMING.minWalk
    if (x < minX || x > maxX) x = footX - dir * PET_TIMING.minWalk
  }
  return Math.min(maxX, Math.max(minX, x))
}

/** 다음 계획 하나. random은 종류에 한 번, 목적지·시간에 한 번 부른다(바 보장은 0회). */
export function choosePlan(c: PlanContext): PetPlan {
  const hasBar = c.world.side !== null
  if (hasBar && (c.sinceBarMs === null || c.sinceBarMs >= PET_TIMING.barEveryMs)) return { kind: 'bar' }
  const w = ACTIVITY_WEIGHTS[c.activity]
  const bar = hasBar ? w.bar : 0
  const pick = c.random() * (w.idle + w.walk + bar)
  if (pick < w.idle) return { kind: 'idle', ms: pickMs(PET_TIMING.idleMs, c.random()) }
  if (pick < w.idle + w.walk) return { kind: 'walk', x: destination(c.world, c.footX, c.random()) }
  return hasBar ? { kind: 'bar' } : { kind: 'walk', x: destination(c.world, c.footX, c.random()) }
}
