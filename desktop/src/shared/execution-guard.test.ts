import { expect, it } from 'vitest'
import { createExecutionGuard, createRepeatFilter } from './execution-guard'

it('같은 키는 300ms 안에 다시 실행하지 않는다', () => {
  let t = 1000
  const guard = createExecutionGuard(300, () => t)
  expect(guard('a')).toBe(true)
  t = 1299
  expect(guard('a')).toBe(false)
  t = 1300
  expect(guard('a')).toBe(true)
  expect(guard('b')).toBe(true)
})

it('자동 반복은 마지막 수신 뒤 250ms가 지나야 다시 통과한다', () => {
  let t = 0
  const pass = createRepeatFilter(250, () => t)
  const seen = [0, 100, 200, 449, 700].map((ms) => {
    t = ms
    return pass()
  })
  expect(seen).toEqual([true, false, false, false, true])
})
