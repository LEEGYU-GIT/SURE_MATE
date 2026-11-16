import { describe, expect, it } from 'vitest'
import { cleanAiTells, phrasesUsedIn } from './ai-tells'

const ANSWER = [
  '네, 회의록을 정리해 드리겠습니다.',
  '',
  '## 📌 회의 개요',
  '**일시**: 11/16(월)',
  '---',
  '* 다양한 이슈에 대해 논의함',
  '* 또한, 원활한 진행을 위해 일정을 다시 잡음',
  '',
  '추가로 궁금한 점이 있으시면 언제든지 말씀해 주세요!'
].join('\n')

describe('cleanAiTells: AI 티를 지운다', () => {
  it('첫 줄 인사·맺음말·마크다운·이모지·접속어·꾸밈말을 지우고 목록 기호를 내 기호로 바꾼다', () => {
    const r = cleanAiTells(ANSWER, { bullet: '- ' })
    expect(r.text).toBe(
      ['회의 개요', '일시: 11/16(월)', '- 이슈 논의함', '- 진행을 위해 일정을 다시 잡음'].join('\n')
    )
    expect(r.counts.preamble).toBe(true)
    expect(r.counts.closing).toBe(1)
    // 제목 기호, 이모지, 굵게, 구분선, 목록 기호 두 개
    expect(r.counts.markdown).toBe(6)
    // 또한, 다양한, 원활한, ~에 대해 논의
    expect(r.counts.phrases).toBe(4)
  })

  it('내 견본에 나온 표현(keep)은 지우지 않는다', () => {
    const r = cleanAiTells('또한 다양한 의견을 들음', { keep: new Set(['또한', '다양한']) })
    expect(r.text).toBe('또한 다양한 의견을 들음')
    expect(r.counts.phrases).toBe(0)
  })

  it('제목처럼 보이는 첫 줄과 내용인 마지막 줄은 빼지 않는다', () => {
    const r = cleanAiTells('다음은 회의 안건\n- 고객사 문의 사항 정리 필요')
    expect(r.text).toBe('다음은 회의 안건\n- 고객사 문의 사항 정리 필요')
    expect(r.counts.preamble).toBe(false)
    expect(r.counts.closing).toBe(0)
  })

  it('뜻이 바뀔 수 있는 표현은 고치지 않고 알려만 준다', () => {
    const r = cleanAiTells('회의를 통해 결정함\n일정을 지키는 것이 중요함')
    expect(r.text).toBe('회의를 통해 결정함\n일정을 지키는 것이 중요함')
    expect(r.flags).toEqual([
      { label: '~을 통해', count: 1 },
      { label: '~하는 것이 중요', count: 1 }
    ])
  })

  it('빈 줄이 세 줄 넘게 겹치지 않고 앞뒤 빈 줄은 지운다', () => {
    expect(cleanAiTells('\n\n가\n\n\n\n나\n\n').text).toBe('가\n\n나')
  })
})

it('phrasesUsedIn: 견본에 나온 AI 티 표현', () => {
  expect(phrasesUsedIn(['또한 일정에 대해 논의함', '회의를 통해 정함'])).toEqual([
    '또한',
    '에 대해',
    '~을 통해'
  ])
})
