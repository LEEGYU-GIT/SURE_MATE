import { describe, expect, it } from 'vitest'
import { petMenuRows } from './pet-copy'
import { parsePetBool, parsePetKey, parsePetMenuAction, parsePetRect, PET_KEYS, PET_RECT_MAX } from './pet-ipc'
import { PET_WINDOW } from './pet-view'

it('parsePetBool: boolean만(펫 위 누름·뗌)', () => {
  expect(parsePetBool(true)).toBe(true)
  expect(parsePetBool(false)).toBe(false)
  expect(parsePetBool('true')).toBeNull()
  expect(parsePetBool(1)).toBeNull()
  expect(parsePetBool(0)).toBeNull()
  expect(parsePetBool(null)).toBeNull()
  expect(parsePetBool(undefined)).toBeNull()
})

describe('parsePetMenuAction: 펫 메뉴 동작 다섯 가지만', () => {
  it('메뉴가 보내는 동작(잠들었을 때와 깨어 있을 때의 행 모두)은 통과한다', () => {
    const actions = new Set([...petMenuRows({ sleeping: false }), ...petMenuRows({ sleeping: true })].map((r) => r.action))
    expect([...actions].sort()).toEqual(['control', 'hide', 'settings', 'sleep', 'wake'])
    for (const a of actions) expect(parsePetMenuAction(a)).toBe(a)
    expect(parsePetMenuAction('hide')).toBe('hide')
  })

  it('그 밖의 값은 null(객체의 기본 속성 이름도)', () => {
    for (const bad of ['eval', '', 'HIDE', ' hide', 'constructor', 'toString', '__proto__', null, undefined, 1, true, { action: 'hide' }, ['hide']]) {
      expect(parsePetMenuAction(bad)).toBeNull()
    }
  })
})

describe('parsePetKey: 조종 키 여섯 가지와 누름·뗌(boolean)을 함께 검사한다', () => {
  it('맞는 키와 boolean은 통과한다', () => {
    expect(PET_KEYS).toEqual(['left', 'right', 'up', 'down', 'jump', 'end'])
    expect(parsePetKey('left', true)).toEqual({ key: 'left', down: true })
    expect(parsePetKey('end', false)).toEqual({ key: 'end', down: false })
    for (const k of PET_KEYS) expect(parsePetKey(k, false)).toEqual({ key: k, down: false })
  })

  it('렌더러의 e.code 이름·틀린 키·boolean이 아닌 누름은 null', () => {
    expect(parsePetKey('ArrowLeft', true)).toBeNull()
    expect(parsePetKey('Space', true)).toBeNull()
    expect(parsePetKey('constructor', true)).toBeNull()
    expect(parsePetKey(undefined, true)).toBeNull()
    expect(parsePetKey(1, true)).toBeNull()
    expect(parsePetKey('left', 'yes')).toBeNull()
    expect(parsePetKey('left', 1)).toBeNull()
    expect(parsePetKey('left', 'true')).toBeNull()
    expect(parsePetKey('left', undefined)).toBeNull()
    expect(parsePetKey('jump', null)).toBeNull()
  })
})

describe('parsePetRect: 말풍선 사각형(펫 창 좌표, DIP). null = 말풍선 없음, undefined = 틀린 값', () => {
  it('null은 null(말풍선이 사라짐)', () => {
    expect(parsePetRect(null)).toBeNull()
  })

  it('맞는 사각형은 네 값만 새 객체로 옮긴다(소수 좌표 포함)', () => {
    expect(parsePetRect({ x: 1, y: 2, width: 3, height: 4 })).toEqual({ x: 1, y: 2, width: 3, height: 4 })
    const raw = { x: 60.5, y: 8.25, width: 200, height: 54.75, extra: 'x' }
    const r = parsePetRect(raw)
    expect(r).toEqual({ x: 60.5, y: 8.25, width: 200, height: 54.75 })
    expect(r).not.toBe(raw)
    expect(Object.keys(r ?? {})).toEqual(['x', 'y', 'width', 'height'])
  })

  it('상한은 펫 창 너비의 두 배(창 밖까지 넉넉히, 컨트롤러가 창 안으로 자른다)', () => {
    expect(PET_RECT_MAX).toBe(2 * PET_WINDOW.width)
    expect(parsePetRect({ x: -PET_RECT_MAX, y: PET_RECT_MAX, width: PET_RECT_MAX, height: PET_RECT_MAX })).toEqual({
      x: -PET_RECT_MAX,
      y: PET_RECT_MAX,
      width: PET_RECT_MAX,
      height: PET_RECT_MAX
    })
  })

  it('유한하지 않은 값·0 이하·상한을 넘는 크기·숫자가 아닌 값·빠진 값은 undefined', () => {
    const ok = { x: 1, y: 2, width: 3, height: 4 }
    for (const bad of [
      { ...ok, x: Number.NaN },
      { ...ok, y: Number.POSITIVE_INFINITY },
      { ...ok, width: 0 },
      { ...ok, height: -4 },
      { ...ok, width: 5000 },
      { ...ok, height: PET_RECT_MAX + 1 },
      { ...ok, x: -PET_RECT_MAX - 1 },
      { ...ok, y: 5000 },
      { ...ok, x: '1' },
      { x: 1, y: 2, width: 3 },
      undefined,
      0,
      'rect',
      [1, 2, 3, 4]
    ]) {
      expect(parsePetRect(bad)).toBeUndefined()
    }
  })
})
