import { expect, it } from 'vitest'
import type { MaskTerm } from '../../shared/masking/dictionary'
import { maskPreamble } from '../../shared/masking/mask'
import { ALL_CATEGORIES, type MaskCategory } from '../../shared/masking/types'
import type { Settings } from '../settings/settings-store'
import { createMaskingService } from './masking-service'

const allOn = Object.fromEntries(ALL_CATEGORIES.map((c) => [c, true])) as Record<MaskCategory, boolean>
const terms: MaskTerm[] = [{ id: 'g', category: 'client', canonical: '가상자동차', aliases: [] }]
const svc = (over: Partial<Settings['masking']> = {}): ReturnType<typeof createMaskingService> =>
  createMaskingService({
    loadTerms: async () => terms,
    settings: () => ({ mode: 'restore', categories: allOn, internalDomains: [], ttlHours: 8, ...over }),
    now: () => 0
  })

it('미리 보기(dryRun)는 대응표를 늘리지 않고, 실행은 토큰을 확정한다', async () => {
  const s = svc()
  for (let i = 0; i < 3; i++) await s.mask('가상자동차 회의', { mode: 'restore', disabledKeys: [], dryRun: true })
  expect(s.tableSize()).toBe(0)
  const r = await s.mask('가상자동차 회의', { mode: 'restore', disabledKeys: [], dryRun: false })
  expect(r.text).toBe(`${maskPreamble('restore')}\n\nCLIENT_A 회의`)
  expect(s.tableSize()).toBe(1)
  expect(s.unmask('CLIENT_A가 좋다')).toEqual({ text: '가상자동차가 좋다', restored: 1, unknownTokens: [] })
})

it('끔이면 원문 그대로, 머리말 없음, 찾은 것은 목록에만 꺼진 채로', async () => {
  const r = await svc().mask('가상자동차 회의', { mode: 'off', disabledKeys: [], dryRun: false })
  expect(r.text).toBe('가상자동차 회의')
  expect(r.preamble).toBeNull()
  expect(r.items).toEqual([{ key: 'client:g', category: 'client', original: '가상자동차', replacement: null, count: 1, enabled: false }])
})

it('가린 것이 없으면 머리말도 없다', async () => {
  const r = await svc().mask('평범한 글', { mode: 'restore', disabledKeys: [], dryRun: false })
  expect(r.text).toBe('평범한 글')
  expect(r.preamble).toBeNull()
})

it('이번 실행에서 끈 항목은 목록에 enabled:false로 남고, 가린 자리는 머리말만큼 밀린다', async () => {
  const r = await svc().mask('가상자동차 10.0.3.15', { mode: 'restore', disabledKeys: ['client:g'], dryRun: true })
  expect(r.text).toBe(`${maskPreamble('restore')}\n\n가상자동차 IP_1`)
  expect(r.items.map((i) => [i.key, i.enabled, i.replacement])).toEqual([
    ['client:g', false, null],
    ['ip:10.0.3.15', true, 'IP_1']
  ])
  expect(r.ranges.map(([s, e]) => r.text.slice(s, e))).toEqual(['IP_1'])
  expect(r.mapRanges([[0, 5]])).toEqual([[maskPreamble('restore').length + 2, maskPreamble('restore').length + 7]])
})

it('설정에서 끈 분류는 목록에도 없다', async () => {
  const r = await svc({ categories: { ...allOn, ip: false } }).mask('10.0.3.15 가상자동차', { mode: 'restore', disabledKeys: [], dryRun: true })
  expect(r.items.map((i) => i.category)).toEqual(['client'])
})
