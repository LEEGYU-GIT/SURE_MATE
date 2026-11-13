import { describe, expect, it } from 'vitest'
import { MATE_STAGE, walkMs, walkTrack } from './mate-walk'

describe('준비 완료 화면의 말랑 메이트 무대: 걷는 길과 걷는 시간(설계 §14-2 걷는 속도)', () => {
  it('걷는 길은 왼쪽 여백부터 오른쪽 바 앞까지(펫 몸 너비를 뺀다)', () => {
    const t = walkTrack({ width: 200, size: 56 })
    expect(t.from).toBe(MATE_STAGE.inset)
    expect(t.to).toBe(200 - MATE_STAGE.barWidth - MATE_STAGE.barGap - 56)
  })

  it('무대가 펫보다 좁으면 걷지 않는다(길이 0)', () => {
    const t = walkTrack({ width: 60, size: 56 })
    expect(t.to).toBe(t.from)
  })

  it('걷는 시간은 거리 ÷ 활발함 속도(차분 40·보통 60·활발 90 DIP/초)', () => {
    expect(walkMs(120, 'normal')).toBe(2000)
    expect(walkMs(-120, 'normal')).toBe(2000)
    expect(walkMs(120, 'calm')).toBe(3000)
    expect(walkMs(90, 'lively')).toBe(1000)
    expect(walkMs(0, 'normal')).toBe(0)
  })
})
