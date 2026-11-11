import { describe, expect, it } from 'vitest'
import { LOG_KEEP_DAYS, logsToDelete, shouldCleanNow } from './log-retention'

describe('logsToDelete: 오늘과 앞 7일은 남기고 그보다 오래된 YYYY-MM-DD.log만 고른다', () => {
  it('경계: 7일 전은 남기고 8일 전은 지운다', () => {
    expect(LOG_KEEP_DAYS).toBe(7)
    const names = ['2026-11-04.log', '2026-11-03.log', '2026-11-11.log']
    expect(logsToDelete(names, '2026-11-11')).toEqual(['2026-11-03.log'])
  })

  it('오늘·어제·미래 날짜는 지우지 않는다', () => {
    const names = ['2026-11-11.log', '2026-11-10.log', '2026-11-12.log', '2027-01-01.log']
    expect(logsToDelete(names, '2026-11-11')).toEqual([])
  })

  it('월 경계: 3월 1일 기준 2월 22일은 남기고 2월 21일은 지운다(윤년 아님)', () => {
    expect(logsToDelete(['2026-02-22.log', '2026-02-21.log'], '2026-03-01')).toEqual(['2026-02-21.log'])
  })

  it('윤년 월 경계: 2028-03-01 기준 2월 23일은 남기고 2월 22일은 지운다', () => {
    expect(logsToDelete(['2028-02-23.log', '2028-02-22.log'], '2028-03-01')).toEqual(['2028-02-22.log'])
  })

  it('연 경계: 1월 3일 기준 12월 27일은 남기고 12월 26일은 지운다', () => {
    expect(logsToDelete(['2025-12-27.log', '2025-12-26.log'], '2026-01-03')).toEqual(['2025-12-26.log'])
  })

  it('이름이 정확히 YYYY-MM-DD.log가 아니면 아무리 오래되어도 지우지 않는다', () => {
    const names = [
      '2020-01-01.txt',
      '2020-01-01.log.bak',
      '2020-01-01.LOG',
      'x2020-01-01.log',
      '2020-01-01.log ',
      '2020-1-1.log',
      '20200101.log',
      'main.log',
      '.log',
      '',
      '../2020-01-01.log',
      'sub/2020-01-01.log',
      'sub\\2020-01-01.log',
    ]
    expect(logsToDelete(names, '2026-11-11')).toEqual([])
  })

  it('없는 날짜(13월·40일·2월 30일·평년 2월 29일)는 지우지 않는다', () => {
    const names = ['2026-13-40.log', '2020-00-10.log', '2020-01-00.log', '2020-02-30.log', '2021-02-29.log']
    expect(logsToDelete(names, '2026-11-11')).toEqual([])
  })

  it('오늘 날짜가 올바르지 않으면 아무것도 지우지 않는다', () => {
    expect(logsToDelete(['2020-01-01.log'], '2026-13-40')).toEqual([])
    expect(logsToDelete(['2020-01-01.log'], 'today')).toEqual([])
  })

  it('입력 순서를 유지하고 입력 배열을 바꾸지 않는다', () => {
    const names = ['2026-01-02.log', 'a.txt', '2026-01-01.log']
    expect(logsToDelete(names, '2026-11-11')).toEqual(['2026-01-02.log', '2026-01-01.log'])
    expect(names).toEqual(['2026-01-02.log', 'a.txt', '2026-01-01.log'])
  })
})

describe('shouldCleanNow: 정리는 로컬 날짜가 바뀔 때마다 한 번', () => {
  it('아직 정리한 적이 없으면 한다', () => {
    expect(shouldCleanNow(null, '2026-11-11')).toBe(true)
  })

  it('같은 날에는 다시 하지 않는다', () => {
    expect(shouldCleanNow('2026-11-11', '2026-11-11')).toBe(false)
  })

  it('날이 바뀌면 한다', () => {
    expect(shouldCleanNow('2026-11-11', '2026-11-12')).toBe(true)
  })

  it('시계가 뒤로 가도 날짜가 다르면 한다(한 번뿐이므로 해롭지 않다)', () => {
    expect(shouldCleanNow('2026-11-12', '2026-11-11')).toBe(true)
  })
})
