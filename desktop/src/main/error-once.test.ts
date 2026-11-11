import { describe, expect, it } from 'vitest'
import { createErrorOnce, ERROR_KINDS_MAX } from './error-once'

describe('createErrorOnce: 같은 곳의 같은 오류는 한 번만 기록한다(M6 최종 검토 Task 9 #4)', () => {
  it('처음 보는 종류(곳 + 오류 글)만 true: 같은 곳의 다른 오류, 다른 곳의 같은 오류는 따로 한 번씩', () => {
    const once = createErrorOnce()
    expect(once('react', 'boom')).toBe(true)
    expect(once('react', 'boom')).toBe(false)
    expect(once('react', 'other')).toBe(true)
    expect(once('timer', 'boom')).toBe(true)
    expect(once('timer', 'boom')).toBe(false)
  })

  it(`종류는 ${ERROR_KINDS_MAX}개까지만 기억하고 그 뒤의 새 종류는 기록하지 않는다(오류 글이 매번 달라도 로그가 끝없이 늘지 않게)`, () => {
    expect(ERROR_KINDS_MAX).toBe(20)
    const once = createErrorOnce()
    let logged = 0
    for (let i = 0; i < 100; i++) if (once('react', `boom ${i}`)) logged += 1
    expect(logged).toBe(ERROR_KINDS_MAX)
    expect(once('react', 'boom 0')).toBe(false)
  })

  it('곳과 오류 글의 경계를 섞지 않는다', () => {
    const once = createErrorOnce()
    expect(once('a:b', 'c')).toBe(true)
    expect(once('a', 'b:c')).toBe(true)
  })

  it('만들 때마다 따로 센다', () => {
    expect(createErrorOnce()('react', 'boom')).toBe(true)
    expect(createErrorOnce()('react', 'boom')).toBe(true)
  })
})
