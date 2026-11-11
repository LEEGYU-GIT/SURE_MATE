import { expect, it } from 'vitest'
import { recentIds, USAGE_HALF_LIFE_DAYS, usageScore, type UsageRecord } from './usage'

const now = Date.parse('2026-11-11T09:00:00.000Z')
const daysAgo = (d: number): string => new Date(now - d * 86_400_000).toISOString()

it('usageScore = 횟수 × 0.5^(지난 날 / 14), 기록이 없으면 0', () => {
  expect(USAGE_HALF_LIFE_DAYS).toBe(14)
  expect(usageScore({ count: 4, lastAt: daysAgo(0) }, now)).toBe(4)
  expect(usageScore({ count: 4, lastAt: daysAgo(14) }, now)).toBe(2)
  expect(usageScore({ count: 4, lastAt: daysAgo(28) }, now)).toBe(1)
  expect(usageScore(undefined, now)).toBe(0)
})

it('usageScore: 시각을 읽을 수 없으면 0, 시계가 거꾸로 가도(앞날 기록) 횟수보다 커지지 않는다', () => {
  expect(usageScore({ count: 4, lastAt: 'not a date' }, now)).toBe(0)
  expect(usageScore({ count: 4, lastAt: daysAgo(-3) }, now)).toBe(4)
})

it('recentIds: 마지막 시각이 최근인 순서로 n개', () => {
  const usage = new Map<string, UsageRecord>([
    ['a', { count: 9, lastAt: daysAgo(3) }],
    ['b', { count: 1, lastAt: daysAgo(1) }],
    ['broken', { count: 5, lastAt: '?' }],
    ['c', { count: 2, lastAt: daysAgo(2) }]
  ])
  expect(recentIds(usage, 2)).toEqual(['b', 'c'])
  // 시각을 읽을 수 없는 기록은 가장 오래된 것으로
  expect(recentIds(usage, 10)).toEqual(['b', 'c', 'a', 'broken'])
  expect(recentIds(usage, 0)).toEqual([])
  expect(recentIds(new Map(), 3)).toEqual([])
})
