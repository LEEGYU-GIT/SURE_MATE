import { expect, it } from 'vitest'
import { parseBarDrag } from './bar-ipc'

it('바 끌기 값은 단계 셋 중 하나와 유한한 화면 y만 받는다', () => {
  expect(parseBarDrag('move', 12.5)).toEqual({ phase: 'move', screenY: 12.5 })
  expect(parseBarDrag('start', -300)).toEqual({ phase: 'start', screenY: -300 })
  expect(parseBarDrag('jump', 1)).toBeNull()
  expect(parseBarDrag('move', Number.NaN)).toBeNull()
  expect(parseBarDrag('end', Number.POSITIVE_INFINITY)).toBeNull()
  expect(parseBarDrag('end', '3')).toBeNull()
})
