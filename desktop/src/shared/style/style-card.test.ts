import { describe, expect, it } from 'vitest'
import { polishAnswer, polishSummary } from './polish'
import { analyzeStyle, describeStyle } from './style-card'
import { renderStylePrompt } from './style-prompt'

const MINUTES = [
  [
    '[주간 회의] 11/9(월)',
    '- HIL 2번 장비 고장 → 수리 요청함',
    '- MC/DC 92% 확인됨',
    '- 결과 파일 서버 공유 예정',
    '- 다음 주 재시험 필요'
  ].join('\n'),
  [
    '[주간 회의] 11/16(월)',
    '- 장비 수리 완료됨',
    '- REQ-BRK-010 재확인 필요',
    '- 소명 초안 공유 예정',
    '- 일정 논의함'
  ].join('\n')
]

describe('analyzeStyle: 견본에서 말투 카드를 센다', () => {
  it('끝맺음·줄 길이·목록 기호·날짜·화살표·자주 쓰는 끝말', () => {
    const card = analyzeStyle(MINUTES)
    expect(card.samples).toBe(2)
    expect(card.dominant).toBe('gaejo')
    expect(card.endings.gaejo).toBe(8)
    expect(card.bullet).toBe('- ')
    expect(card.dateStyle).toBe('M/D(요일)')
    expect(card.arrow).toBe(false)
    expect(card.closers).toEqual(['예정', '필요'])
    expect(card.lineLength).not.toBeNull()
  })

  it('견본이 없으면 비어 있고, 끝맺음이 섞이면 dominant는 null', () => {
    expect(analyzeStyle([]).dominant).toBeNull()
    expect(describeStyle(analyzeStyle([]))).toEqual([])
    const mixed = analyzeStyle(['확인했습니다\n공유했어요\n정리함\n보냈다'])
    expect(mixed.dominant).toBeNull()
    expect(describeStyle(mixed)[0]).toBe('끝맺음: 섞어 씀')
  })

  it('describeStyle: 사람이 읽는 줄', () => {
    expect(describeStyle(analyzeStyle(MINUTES))).toEqual([
      '끝맺음: 개조식(~함, ~예정) 100%',
      expect.stringMatching(/^한 줄: \d+자 안팎$/),
      "목록 기호: '-'",
      '날짜: M/D(요일)',
      '자주 쓰는 끝말: 예정, 필요'
    ])
  })
})

describe('renderStylePrompt: {{style:종류}}에 넣는 내 말투 안내', () => {
  it('견본 글은 넣지 않고 카드 규칙만 넣는다', () => {
    const text = renderStylePrompt('회의록', analyzeStyle(MINUTES))!
    expect(text.split('\n')[0]).toBe('[내 말투] 제가 쓴 것처럼 써 주세요. 평소 제 회의록 말투예요.')
    expect(text).toContain('끝맺음은 개조식으로')
    expect(text).toContain("목록은 '-'로 시작")
    expect(text).toContain('날짜는 11/18(수)처럼')
    expect(text).toContain('쓰지 말 것: 다양한')
    for (const line of MINUTES.join('\n').split('\n').slice(1))
      expect(text).not.toContain(line.slice(2))
  })

  it('견본이 없으면 null', () => {
    expect(renderStylePrompt('회의록', analyzeStyle([]))).toBeNull()
  })
})

describe('polishAnswer: AI 답을 내 말투로', () => {
  const answer =
    '다음은 회의록입니다:\n\n* **장비 수리**를 다양한 방법으로 검토했습니다.\n* 11/20까지 수리를 완료하겠습니다.\n\n도움이 되었길 바랍니다!'

  it('개조식 말투면 AI 티를 지우고 끝맺음을 바꾼다', () => {
    const r = polishAnswer(answer, analyzeStyle(MINUTES))
    expect(r.text).toBe('- 장비 수리를 방법으로 검토함\n- 11/20까지 수리를 완료할 예정')
    expect(polishSummary(r.counts)).toBe('끝맺음 2 · 군더더기 3 · 꾸밈 기호 3')
  })

  it('견본이 없으면 AI 티만 지우고 끝맺음은 그대로', () => {
    const r = polishAnswer(answer, null)
    expect(r.text).toBe('- 장비 수리를 방법으로 검토했습니다.\n- 11/20까지 수리를 완료하겠습니다.')
    expect(r.counts.endings).toBe(0)
  })
})
