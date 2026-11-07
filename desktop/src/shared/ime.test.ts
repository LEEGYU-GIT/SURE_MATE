import { expect, it } from 'vitest'
import { isImeComposing } from './ime'

it('조합 중 판단', () => {
  expect(isImeComposing({ isComposing: true, keyCode: 13 })).toBe(true)
  expect(isImeComposing({ isComposing: false, keyCode: 229 })).toBe(true)
  expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false)
  expect(isImeComposing({})).toBe(false)
})
