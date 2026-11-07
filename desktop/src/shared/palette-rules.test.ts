import { expect, it } from 'vitest'
import { needsResize, palettePosition, shouldHideOnBlur } from './palette-rules'

it('팔레트 위치', () => {
  expect(palettePosition({ x: 0, y: 0, width: 1920, height: 1040 }, { width: 720, height: 460 })).toEqual({
    x: 600,
    y: 229,
    width: 720,
    height: 460
  })
})

it('크기 재조정 필요 여부', () => {
  expect(needsResize({ width: 1080, height: 690 }, { width: 720, height: 460 }, 2)).toBe(true)
  expect(needsResize({ width: 721, height: 460 }, { width: 720, height: 460 }, 2)).toBe(false)
})

it('blur로 숨길지', () => {
  expect(shouldHideOnBlur(1000, 1100, false)).toBe(false)
  expect(shouldHideOnBlur(1000, 1150, false)).toBe(true)
  expect(shouldHideOnBlur(1000, 5000, true)).toBe(false)
})
