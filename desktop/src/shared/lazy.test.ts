import { expect, it } from 'vitest'
import { lazyLoad } from './lazy'

it('불러오기가 실패하면 null과 이유를 남기고 다시 시도하지 않는다', () => {
  let calls = 0
  const native = lazyLoad(() => {
    calls++
    throw new Error('koffi.node 차단됨')
  })
  expect(native.get()).toBeNull()
  expect(native.get()).toBeNull()
  expect(native.error()).toContain('koffi.node 차단됨')
  expect(calls).toBe(1)
})

it('성공하면 처음 한 번만 불러온다', () => {
  let calls = 0
  const native = lazyLoad(() => {
    calls++
    return { ok: true }
  })
  expect(native.get()).toEqual({ ok: true })
  native.get()
  expect(calls).toBe(1)
  expect(native.error()).toBeNull()
})
