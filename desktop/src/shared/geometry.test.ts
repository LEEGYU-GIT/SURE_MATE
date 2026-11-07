import { expect, it } from 'vitest'
import { applyFrameInsets, frameInsets, leftHalf, pickOtherMonitor, rectDiff } from './geometry'
import type { MonitorInfo } from './types'

it('왼쪽 절반', () => {
  expect(leftHalf({ x: 1920, y: 0, width: 2560, height: 1400 })).toEqual({ x: 1920, y: 0, width: 1280, height: 1400 })
  expect(leftHalf({ x: 0, y: 0, width: 1365, height: 720 })).toEqual({ x: 0, y: 0, width: 682, height: 720 })
})

it('보이지 않는 테두리 보정', () => {
  const insets = frameInsets({ x: 93, y: 100, width: 814, height: 607 }, { x: 100, y: 100, width: 800, height: 600 })
  expect(insets).toEqual({ left: 7, top: 0, right: 7, bottom: 7 })
  expect(applyFrameInsets({ x: 0, y: 0, width: 960, height: 1040 }, insets)).toEqual({ x: -7, y: 0, width: 974, height: 1047 })
})

it('다른 모니터 고르기', () => {
  const m = (id: string, isPrimary: boolean): MonitorInfo => ({
    id,
    isPrimary,
    isInternal: false,
    scaleFactor: 1,
    bounds: { x: 0, y: 0, width: 1, height: 1 },
    workArea: { x: 0, y: 0, width: 1, height: 1 }
  })
  expect(pickOtherMonitor([m('1', true), m('2', false)], '1')?.id).toBe('2')
  expect(pickOtherMonitor([m('1', true)], '1')).toBeNull()
})

it('rectDiff', () => {
  expect(rectDiff({ x: 0, y: 0, width: 100, height: 100 }, { x: 3, y: -2, width: 100, height: 108 })).toBe(8)
})
