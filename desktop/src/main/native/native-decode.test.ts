import { describe, expect, it } from 'vitest'
import { decodeNotificationState } from './windows'
import { anyMouseButtonDown, keyStateDown } from './input'

describe('decodeNotificationState', () => {
  it('HRESULT 0이면 상태값, 아니면 null', () => {
    expect(decodeNotificationState(0, 2)).toBe(2)
    expect(decodeNotificationState(0, 5)).toBe(5)
    expect(decodeNotificationState(-2147467259, 2)).toBeNull()
    expect(decodeNotificationState(1, 2)).toBeNull()
    expect(decodeNotificationState(0, undefined)).toBeNull()
  })
})

describe('GetAsyncKeyState 해석', () => {
  it('상위 비트가 눌림', () => {
    expect(keyStateDown(-32768)).toBe(true) // 0x8000을 SHORT로 읽은 값
    expect(keyStateDown(-32767)).toBe(true)
    expect(keyStateDown(1)).toBe(false) // 하위 비트만: 마지막 조회 이후 눌렸었음
    expect(keyStateDown(0)).toBe(false)
  })
  it('세 버튼 중 하나라도 눌리면 true', () => {
    const states: Record<number, number> = { 1: 0, 2: -32768, 4: 0 }
    expect(anyMouseButtonDown((vk) => states[vk])).toBe(true)
    expect(anyMouseButtonDown(() => 0)).toBe(false)
  })
})
