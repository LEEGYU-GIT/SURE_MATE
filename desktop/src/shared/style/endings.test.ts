import { describe, expect, it } from 'vitest'
import { classifyEnding, gaejoWord, toGaejo } from './endings'

describe('classifyEnding: 줄 끝맺음 갈래', () => {
  it('개조식: 받침 ㅁ(함·됨·음·임)이나 흔한 끝말로 끝나는 줄', () => {
    expect(classifyEnding('- 장비 수리 요청함')).toBe('gaejo')
    expect(classifyEnding('결과 파일 서버에 있음.')).toBe('gaejo')
    expect(classifyEnding('11/18(수)까지 수리 예정')).toBe('gaejo')
    expect(classifyEnding('MC/DC 보강 필요')).toBe('gaejo')
  })

  it('~습니다·ㅂ니다는 hamnida, ~요는 haeyo, ~다는 plain', () => {
    expect(classifyEnding('회의를 진행했습니다.')).toBe('hamnida')
    expect(classifyEnding('다음 주에 공유합니다')).toBe('hamnida')
    expect(classifyEnding('결과를 확인했어요.')).toBe('haeyo')
    expect(classifyEnding('내일 공유할게요')).toBe('haeyo')
    expect(classifyEnding('이미 확인했죠')).toBe('haeyo')
    // 요로 끝나는 명사(필요·중요·개요)는 ~요 끝맺음이 아니다
    expect(classifyEnding('일정 조율이 중요')).not.toBe('haeyo')
    expect(classifyEnding('결과를 확인했다.')).toBe('plain')
    expect(classifyEnding('그건 문제가 아니다')).toBe('plain')
  })

  it('짧거나 숫자·영문으로 끝나 알 수 없는 줄은 null', () => {
    expect(classifyEnding('참석')).toBeNull()
    expect(classifyEnding('버전 1.2.3')).toBeNull()
    expect(classifyEnding('담당: QA Team')).toBeNull()
  })
})

describe('gaejoWord: 끝맺음 한 낱말을 개조식으로', () => {
  it.each([
    ['논의했습니다', '논의함'],
    ['진행하였습니다', '진행함'],
    ['완료되었습니다', '완료됨'],
    ['결정됐습니다', '결정됨'],
    ['공유하겠습니다', '공유할 예정'],
    ['있습니다', '있음'],
    ['늘었습니다', '늘었음'],
    ['필요합니다', '필요함'],
    ['반영됩니다', '반영됨'],
    ['예정입니다', '예정임'],
    ['아닙니다', '아님'],
    ['요청드립니다', '요청드림'],
    ['확인했어요', '확인함'],
    ['정해요', '정함'],
    ['바뀌었어요', '바뀌었음'],
    ['없어요', '없음'],
    ['예정이에요', '예정임']
  ])('%s → %s', (from, to) => {
    expect(gaejoWord(from)).toBe(to)
  })

  it('끝맺음이 아니거나 인사·사과는 그대로(null)', () => {
    expect(gaejoWord('필요')).toBeNull()
    expect(gaejoWord('회의')).toBeNull()
    expect(gaejoWord('감사합니다')).toBeNull()
    expect(gaejoWord('죄송합니다')).toBeNull()
  })
})

describe('toGaejo: 글 전체의 끝맺음을 개조식으로', () => {
  it('줄 끝 문장은 마침표를 떼고, 한 줄에 이어지는 문장은 마침표를 남긴다', () => {
    const r = toGaejo(
      '- 브레이크 시험 결과를 논의했습니다.\n- 장비를 점검했습니다. 내일 다시 확인하겠습니다.'
    )
    expect(r.text).toBe('- 브레이크 시험 결과를 논의함\n- 장비를 점검함. 내일 다시 확인할 예정')
    expect(r.count).toBe(3)
  })

  it('명사 뒤 임은 뗀다(예정입니다 → 예정)', () => {
    expect(toGaejo('11/18까지 수리 완료 예정입니다.').text).toBe('11/18까지 수리 완료 예정')
  })

  it('문장 중간의 ~습니다만, 인사, 개조식 줄은 건드리지 않는다', () => {
    const text = '확인했습니다만 결과가 다릅니다\n감사합니다.\n- 이미 개조식임'
    expect(toGaejo(text).text).toBe('확인했습니다만 결과가 다름\n감사합니다.\n- 이미 개조식임')
  })
})
