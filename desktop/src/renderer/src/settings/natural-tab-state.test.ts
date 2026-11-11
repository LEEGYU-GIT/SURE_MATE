import { describe, expect, it } from 'vitest'
import type { NaturalView } from '../../../shared/natural/natural-ipc'
import { focusAfterRemove, intentFileNotice, NATURAL_COPY, newerView, phraseTarget, targetText } from './natural-tab-state'

const view = (rev: number, keys: string[] = []): NaturalView => ({
  rev,
  phrases: keys.map((key) => ({ key, item: null })),
  phraseMax: 300,
  usageCount: 0,
  intents: { source: 'builtin', errors: [], endings: 0, particles: 0, fillers: 0, rules: [] }
})

describe('보기 받기', () => {
  it('처음이거나 rev가 같거나 크면 새 보기, 작으면(지우기 전에 만든 바뀜 알림) 지금 보기를 둔다', () => {
    const a = view(3, ['출근세팅해줘'])
    const b = view(4)
    expect(newerView(null, a)).toBe(a)
    expect(newerView(a, b)).toBe(b)
    expect(newerView(b, a)).toBe(b)
    const same = view(4, ['주간보고띄워줘'])
    expect(newerView(b, same)).toBe(same)
  })
})

describe('줄을 지운 뒤 포커스(키보드만으로 사용, §16)', () => {
  const before = ['가', '나', '다']
  it('지운 줄 자리에 온 다음 줄, 마지막 줄이었으면 그 앞 줄', () => {
    expect(focusAfterRemove(before, '가', ['나', '다'])).toBe('나')
    expect(focusAfterRemove(before, '나', ['가', '다'])).toBe('다')
    expect(focusAfterRemove(before, '다', ['가', '나'])).toBe('나')
  })
  it('남은 줄이 없으면 null(빈 화면으로), 그사이 다른 곳에서 바뀌었으면 남은 줄 가운데 가까운 것', () => {
    expect(focusAfterRemove(['가'], '가', [])).toBeNull()
    expect(focusAfterRemove(before, '나', ['가'])).toBe('가')
    expect(focusAfterRemove(before, '가', ['라'])).toBe('라')
  })
})

describe('화면 글', () => {
  it('기억한 문장이 여는 항목: 이름 · 구역, 지금 없으면 그렇다고', () => {
    expect(phraseTarget({ key: '출근세팅해줘', item: { title: 'QA 모드', group: 'workspace' } })).toBe('QA 모드 · 워크스페이스')
    expect(phraseTarget({ key: '주간보고띄워줘', item: { title: '주간 보고 초안', group: 'prompt' } })).toBe('주간 보고 초안 · 프롬프트')
    expect(phraseTarget({ key: '지난달보고서열어줘', item: null })).toBe(NATURAL_COPY.missing)
  })

  it('의도 규칙 대상: 구역은 ‘… 구역’, 항목은 이름, 여럿이면 처음 아는 것 외 N개, 아는 것이 없으면 없는 항목', () => {
    expect(targetText([{ group: 'prompt' }])).toBe('프롬프트 구역')
    expect(targetText([{ title: '지금 배치 저장' }])).toBe('지금 배치 저장')
    expect(targetText([{ title: '가명 되돌리기' }, { title: null }, { title: '가명 사전 열기' }])).toBe('가명 되돌리기 외 2개')
    expect(targetText([{ title: null }, { title: '가명 사전 열기' }])).toBe('가명 사전 열기 외 1개')
    expect(targetText([{ title: null }])).toBe(NATURAL_COPY.missingTarget)
    expect(targetText([])).toBe('')
  })

  it('단어 목록 파일 문제: 없으면 null, 못 읽었으면 기본 목록을 쓴다고, 일부만 뺐으면 그 건수. 자세히는 앞 세 건과 남은 건수', () => {
    const intents = view(1).intents
    expect(intentFileNotice(intents)).toBeNull()
    expect(intentFileNotice({ ...intents, source: 'builtin', errors: ['읽지 못함(PARSE)'] })).toEqual({ text: NATURAL_COPY.fileBroken, details: '읽지 못함(PARSE)' })
    const errors = ['군말 2번째: 중복', '어미 2번째: 문자열이 아님', '어미 3번째: 20자 초과', '조사 1번째: 빈 값', '규칙 mine: 대상이 없어 제외']
    expect(intentFileNotice({ ...intents, source: 'user', errors })).toEqual({
      text: NATURAL_COPY.filePartial(5),
      details: '군말 2번째: 중복 · 어미 2번째: 문자열이 아님 · 어미 3번째: 20자 초과 외 2건'
    })
  })

  it('건수 글', () => {
    expect(NATURAL_COPY.phrasesTitle(3, 300)).toBe('기억한 문장 (3개, 최대 300개)')
    expect(NATURAL_COPY.usageLabel(23)).toBe('사용 기록 23개')
    expect(NATURAL_COPY.usageLabel(0)).toBe('사용 기록 없음')
    expect(NATURAL_COPY.stripCounts(69, 44, 4)).toBe('어미 69개 · 조사 44개 · 군말 4개')
    expect(NATURAL_COPY.path).toBe('%APPDATA%\\Sure-Mate\\intents.json')
  })
})
