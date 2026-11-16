import { expect, it } from 'vitest'
import { BAR_ID_MAX, parseBarContextY, parseBarDrag, parseBarHover, parseBarId, parseBarPress, parsePointer } from './bar-ipc'

it('parseBarPress: 정해진 실행 방식만 받고, 그 밖의 값은 null', () => {
  expect(parseBarPress('up')).toBe('up')
  expect(parseBarPress('up-only')).toBe('up-only')
  expect(parseBarPress('click')).toBe('click')
  for (const bad of [undefined, null, '', 'UP', 1, { how: 'up' }]) expect(parseBarPress(bad)).toBeNull()
})

it('parseBarDrag: 정해진 단계와 유한한 화면 y만 받는다', () => {
  expect(parseBarDrag('move', 12.5)).toEqual({ phase: 'move', screenY: 12.5 })
  expect(parseBarDrag('start', 300)).toEqual({ phase: 'start', screenY: 300 })
  expect(parseBarDrag('end', 0)).toEqual({ phase: 'end', screenY: 0 })
  // 주 모니터 위쪽 모니터는 화면 y가 음수다
  expect(parseBarDrag('move', -420)).toEqual({ phase: 'move', screenY: -420 })
  expect(parseBarDrag('jump', 1)).toBeNull()
  expect(parseBarDrag('move', Number.NaN)).toBeNull()
  expect(parseBarDrag('move', Number.POSITIVE_INFINITY)).toBeNull()
  expect(parseBarDrag('move', '12')).toBeNull()
  expect(parseBarDrag(undefined, 1)).toBeNull()
  expect(parseBarDrag('constructor', 1)).toBeNull()
})

it('parseBarId: 1~200자 문자열만', () => {
  expect(BAR_ID_MAX).toBe(200)
  expect(parseBarId('logo')).toBe('logo')
  expect(parseBarId('prompt:meeting-notes')).toBe('prompt:meeting-notes')
  expect(parseBarId('x'.repeat(200))).toBe('x'.repeat(200))
  expect(parseBarId('x'.repeat(201))).toBeNull()
  expect(parseBarId('')).toBeNull()
  expect(parseBarId(3)).toBeNull()
  expect(parseBarId(null)).toBeNull()
  expect(parseBarId({ id: 'logo' })).toBeNull()
})

it('parseBarHover: 항목 id(1~200자) 또는 나감(null), 그 밖은 null', () => {
  expect(parseBarHover('masking')).toEqual({ id: 'masking' })
  expect(parseBarHover(null)).toEqual({ id: null })
  expect(parseBarHover(undefined)).toBeNull()
  expect(parseBarHover('')).toBeNull()
  expect(parseBarHover('x'.repeat(201))).toBeNull()
  expect(parseBarHover(1)).toBeNull()
})

it('parsePointer: boolean만', () => {
  expect(parsePointer(true)).toBe(true)
  expect(parsePointer(false)).toBe(false)
  expect(parsePointer('true')).toBeNull()
  expect(parsePointer(1)).toBeNull()
  expect(parsePointer(undefined)).toBeNull()
})

it('parseBarContextY: 0 이상 유한수(바 창 안 세로 위치, DIP)', () => {
  expect(parseBarContextY(0)).toBe(0)
  expect(parseBarContextY(212.5)).toBe(212.5)
  expect(parseBarContextY(-1)).toBeNull()
  expect(parseBarContextY(Number.NaN)).toBeNull()
  expect(parseBarContextY(Number.POSITIVE_INFINITY)).toBeNull()
  expect(parseBarContextY('5')).toBeNull()
})
