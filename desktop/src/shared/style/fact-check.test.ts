import { expect, it } from 'vitest'
import { dateContext, unsupportedFacts } from './fact-check'

const SOURCE =
  '11월 16일 회의. 브레이크 제어기 MC/DC 92%. HIL 2번 장비 고장. REQ-BRK-010 확인. 결과는 10.0.3.15 서버, 14:00 재시험'

it('원문에 있는 날짜·비율·번호·IP·시각은 모양이 달라도 같은 것으로 본다', () => {
  const out =
    '- 11/16(월) 회의\n- MC/DC 92 → 100% 목표\n- REQ-BRK-010 확인\n- 10.0.3.15 서버에 결과\n- 14:00 재시험'
  expect(unsupportedFacts(out, SOURCE)).toEqual(['100%'])
})

it('원문에 없는 날짜·수·번호를 답에 나온 모양으로, 처음 나온 순서대로 알린다', () => {
  const out = '- 11/20(금)까지 수리\n- 커버리지 95%\n- REQ-BRK-011 추가\n- 3,500건 검토'
  expect(unsupportedFacts(out, SOURCE)).toEqual(['11/20', '95%', 'REQ-BRK-011', '3,500'])
})

it('목록 번호·한 자리 수·가명 표시는 보지 않는다', () => {
  const out = '1. 장비 2대 점검\n2. IP_1 서버 확인\n3. PATH_2 정리'
  expect(unsupportedFacts(out, SOURCE)).toEqual([])
})

it('오늘 날짜(연도 포함)를 원문에 더하면 AI가 붙인 오늘 날짜·연도는 알리지 않는다', () => {
  const now = new Date(2026, 10, 16)
  expect(unsupportedFacts('2026년 11월 16일 회의록', `회의 메모\n${dateContext(now)}`)).toEqual([])
  expect(unsupportedFacts('2025년 회의록', `회의 메모\n${dateContext(now)}`)).toEqual(['2025년'])
})

it('limit개까지만', () => {
  expect(unsupportedFacts('11 22 33 44 55 66', '', 3)).toEqual(['11', '22', '33'])
})
