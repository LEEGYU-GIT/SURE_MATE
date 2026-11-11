import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseIntentPack } from './intent-pack'
import { ENGLISH_WORDS, ENGLISH_WORDS_STILL_CONVERTED } from './test-english-words'
import { MAX_PHRASE, QWERTY_PENALTY, understand } from './understand'

const pack = parseIntentPack(JSON.parse(readFileSync(join(__dirname, '../../../resources/intents.json'), 'utf8'))).pack!

const v = (text: string, penalty: number, typo = false) => ({ text, penalty, typo })
const texts = (s: string) => understand(s, pack).variants.map((x) => [x.text, x.penalty])

describe('understand', () => {
  it('회의록 정리', () => {
    expect(understand('회의록 좀 정리해 주세요', pack)).toEqual({
      variants: [v('회의록', 0, true)],
      intents: ['prompt'],
      key: '회의록정리해주세요',
      natural: true
    })
  })

  it('영문 뒤 조사와 끝 기호', () => {
    expect(understand('MC/DC가 뭐야?', pack)).toEqual({
      variants: [v('mc/dc가', 0, true), v('mc/dc', 1)],
      intents: ['wiki'],
      key: 'mc/dc가뭐야',
      natural: true
    })
  })

  it('모드 전환 문장', () => {
    expect(texts('보고서 모드로 바꿔줘')).toEqual([['보고서 모드로', 0], ['보고서 모드', 1], ['보고서', 2]])
    expect(understand('보고서 모드로 바꿔줘', pack).intents).toEqual(['workspace'])
    expect(texts('회의모드로바꿔줘')).toEqual([['회의모드로', 0], ['회의모드', 1]])
    expect(understand('회의모드로바꿔줘', pack).intents).toEqual(['workspace'])
  })

  it('가명·요약', () => {
    expect(texts('가명 되돌려줘')).toEqual([['가명', 0]])
    expect(understand('가명 되돌려줘', pack).intents).toEqual(['masking', 'unmask'])
    expect(texts('요약해줘')).toEqual([['요약', 0]])
    expect(understand('요약해줘', pack).intents).toEqual(['prompt'])
  })

  it('그 밖의 문장', () => {
    expect(texts('qa로 전환')).toEqual([['qa로 전환', 0], ['qa 전환', 1], ['qa', 2]])
    expect(understand('qa로 전환', pack).intents).toEqual(['workspace'])
    expect(texts('이슈 양식')).toEqual([['이슈 양식', 0], ['이슈', 2]])
    expect(understand('이슈 양식', pack).intents).toEqual(['snippet'])
    expect(texts('현재 배치 기억해줘')).toEqual([['현재 배치 기억', 0]])
    expect(understand('현재 배치 기억해줘', pack).intents).toEqual(['workspace', 'workspace-save'])
    expect(texts('ISO26262는')).toEqual([['iso26262는', 0], ['iso26262', 1]])
  })

  it('조사는 2음절 이상 남을 때만, 낱말 속 의도는 의도가 아니다', () => {
    const a = understand('정확도', pack)
    expect(a.variants.map((x) => [x.text, x.penalty])).toEqual([['정확도', 0], ['정확', 1]])
    expect(a.natural).toBe(false)
    for (const s of ['평가', '결과']) {
      const r = understand(s, pack)
      expect(r.variants).toHaveLength(1)
      expect(r.natural).toBe(false)
    }
    expect(understand('정적분석', pack).intents).toEqual([])
    expect(texts('뭐야')).toEqual([['뭐야', 0]])
    expect(understand('뭐야', pack).intents).toEqual(['wiki'])
    expect(texts('그룹 정리')).toEqual([['그룹 정리', 0], ['그룹', 2]])
  })

  it('영문 자판', () => {
    expect(understand('ghldmlfhr wjdflgownj', pack)).toEqual({
      variants: [v('ghldmlfhr wjdflgownj', 0, true), v('회의록', 50, true)],
      intents: ['prompt'],
      key: '회의록정리해줘',
      natural: true
    })
    expect(understand('mail', pack).variants).toHaveLength(1)
    expect(understand('test', pack).variants).toHaveLength(1)
  })

  it('빈 입력·짧은 입력·긴 입력', () => {
    for (const s of ['', '  ']) {
      const r = understand(s, pack)
      expect(r.variants).toEqual([])
      expect(r.key).toBeNull()
    }
    const one = understand('회', pack)
    expect(one.variants.map((x) => x.text)).toEqual(['회'])
    expect(one.key).toBeNull()
    const long = understand('가'.repeat(150) + '나'.repeat(150), pack)
    expect(long.variants[0].text).toBe('가'.repeat(150) + '나'.repeat(50))
    expect(MAX_PHRASE).toBe(200)
  })
})

/** 영문 자판에서 바꾼 한글 변형 검색어(감점 QWERTY_PENALTY 이상)가 있는지 */
const converted = (s: string): boolean => understand(s, pack).variants.some((x) => x.penalty >= QWERTY_PENALTY)

describe('영문 자판 바꾸기: 바꾼 글이 모두 완성 음절(끝의 치는 중인 자음 하나 허용)이고 2음절 이상일 때만', () => {
  it('ISO와 iso는 같은 키 iso이고 바꾼 글(ㅑ내·ㅑ냬)을 검색하지 않는다', () => {
    expect(understand('ISO', pack).key).toBe('iso')
    expect(understand('iso', pack).key).toBe('iso')
    expect(texts('ISO')).toEqual([['iso', 0]])
    expect(texts('iso')).toEqual([['iso', 0]])
  })

  it('바꾸면 한 음절인 낱말(ai·gpt·git·db·fix·sort)은 키를 잃지 않는다', () => {
    for (const w of ['ai', 'gpt', 'git', 'db', 'fix', 'sort']) {
      expect(understand(w, pack).key, w).toBe(w)
      expect(converted(w), w).toBe(false)
    }
  })

  it('자모가 섞이는 낱말(word→잭ㅇ, api→메ㅑ, sql→ㄴ비, code→챙ㄷ)은 바꾸지 않고 키는 입력 그대로', () => {
    for (const w of ['word', 'api', 'sql', 'code', 'email', 'autosar', 'fmea']) {
      expect(converted(w), w).toBe(false)
      expect(understand(w, pack).key, w).toBe(w)
    }
  })

  it('흔한 영어 낱말·약어 109개 중 바꾸는 것은 완성 음절 두 개로 바뀌는 5개뿐이다', () => {
    expect(ENGLISH_WORDS).toHaveLength(109)
    expect(ENGLISH_WORDS.filter(converted)).toEqual(ENGLISH_WORDS_STILL_CONVERTED)
  })

  it('치는 중인 끝 자음 하나는 완성 음절로 보지 않되 바꾸기를 막지 않는다(낱말 사이의 자음은 막는다)', () => {
    expect(texts('wjdwjrqnst')).toEqual([['wjdwjrqnst', 0], ['정적분ㅅ', 50]])
    expect(understand('wjdwjrqnst', pack).key).toBe('정적분ㅅ')
    expect(texts('qhrhtj a')).toEqual([['qhrhtj a', 0], ['보고서 ㅁ', 50]])
    // 끝 기호는 세지 않는다
    expect(texts('wjdwjrqnstjr?')).toEqual([['wjdwjrqnstjr', 0], ['정적분석', 50]])
    // 자음이 낱말 가운데·끝에 둘이면 바꾸지 않는다
    expect(converted('wjdwjrqnst ghldml')).toBe(false)
    expect(converted('rkssr')).toBe(false)
    // 한 음절 + 끝 자음은 2음절이 아니다
    expect(converted('rkr')).toBe(false)
    expect(converted('rkrk')).toBe(true)
  })

  it('바꾼 글에서 키를 만들지 못하면(군말뿐) 입력 그대로의 키를 쓴다', () => {
    // 'wha rm' → '좀 그'(군말 두 개): 바꾼 글의 키가 없으므로 입력 그대로
    expect(understand('wha rm', pack).key).toBe('wharm')
  })
})

describe('요청 어미는 두 글자 이상 남을 때만 뗀다(1음절 어간을 만들지 않는다)', () => {
  it('이란·자란·불켜·혼란·파란·전란·반란·켜켜는 입력 그대로 하나', () => {
    for (const s of ['이란', '자란', '불켜', '혼란', '파란', '전란', '반란', '켜켜']) expect(texts(s), s).toEqual([[s, 0]])
  })

  it('두 글자 이상 남으면 그대로 뗀다', () => {
    expect(texts('ASIL이란')).toEqual([['asil', 0]])
    expect(texts('요약해줘')).toEqual([['요약', 0]])
    expect(texts('qa 켜')).toEqual([['qa', 0]])
  })
})

/**
 * 의도 단어 맞추기를 같은 낱말 수의 이어진 낱말만 비교하도록 바꾸기 전(M7 최종 검토 시점)의 understand 결과.
 * [문장, 의도, 키, natural, [변형 검색어, 감점, 오타 단계][]]. 문장 표(natural-search.test.ts) 51개 그대로다.
 */
const BEFORE: [string, string[], string | null, boolean, [string, number, boolean][]][] = [
  ['회의록 정리해줘', ['prompt'], '회의록정리해줘', true, [['회의록', 0, true]]],
  ['회의록 좀 정리해 주세요', ['prompt'], '회의록정리해주세요', true, [['회의록', 0, true]]],
  ['회의록 정리해줘!!', ['prompt'], '회의록정리해줘', true, [['회의록', 0, true]]],
  ['회의록을', [], '회의록을', false, [['회의록을', 0, true], ['회의록', 1, false]]],
  ['클로드로 회의록 정리', ['prompt'], '클로드로회의록정리', true, [['클로드로 회의록 정리', 0, true], ['클로드 회의록 정리', 1, false], ['회의록', 2, false]]],
  ['주간보고 초안 작성해줘', ['prompt'], '주간보고초안작성해줘', true, [['주간보고 초안', 0, true], ['주간보고', 2, false]]],
  ['메일 회신 초안 써줘', ['prompt'], '메일회신초안써줘', true, [['메일 회신 초안', 0, true], ['메일 회신', 2, false]]],
  ['문장 다듬기 해줘', ['prompt'], '문장다듬기해줘', true, [['문장 다듬기', 0, true], ['문장', 2, false]]],
  ['요구사항으로 테스트 케이스 만들어줘', ['prompt'], '요구사항으로테스트케이스만들어줘', true, [['요구사항으로 테스트 케이스', 0, true], ['요구사항 테스트 케이스', 1, false], ['요구사항', 2, false]]],
  ['정적분석 소명 초안', ['prompt'], '정적분석소명초안', true, [['정적분석 소명 초안', 0, true], ['정적분석', 2, false]]],
  ['ISO 26262 조항 찾아줘', ['prompt'], 'iso26262조항찾아줘', true, [['iso 26262 조항', 0, true], ['iso 26262', 2, false]]],
  ['협업 문서 요약해줘', ['prompt'], '협업문서요약해줘', true, [['협업 문서', 0, true]]],
  ['요약해줘', ['prompt'], '요약해줘', true, [['요약', 0, true]]],
  ['mcdc 뭐야', ['wiki'], 'mcdc뭐야', true, [['mcdc', 0, true]]],
  ['MC/DC가 뭐야?', ['wiki'], 'mc/dc가뭐야', true, [['mc/dc가', 0, true], ['mc/dc', 1, false]]],
  ['ISO26262는', [], 'iso26262는', false, [['iso26262는', 0, true], ['iso26262', 1, false]]],
  ['ASIL이란', ['wiki'], 'asil이란', true, [['asil', 0, true]]],
  ['오탐 뜻 알려줘', ['wiki'], '오탐뜻알려줘', true, [['오탐 뜻', 0, true], ['오탐', 2, false]]],
  ['정적분석이 뭐야', ['wiki'], '정적분석이뭐야', true, [['정적분석이', 0, true], ['정적분석', 1, false]]],
  ['ㅈㅈㅂㅅ', [], 'ㅈㅈㅂㅅ', false, [['ㅈㅈㅂㅅ', 0, true]]],
  ['정적분삭', [], '정적분삭', false, [['정적분삭', 0, true]]],
  ['wjdwjrqnstjr', [], '정적분석', true, [['wjdwjrqnstjr', 0, true], ['정적분석', 50, true]]],
  ['HARA 풀네임', ['wiki'], 'hara풀네임', true, [['hara 풀네임', 0, true], ['hara', 2, false]]],
  ['커버리지가 뭐지', [], '커버리지가뭐지', true, [['커버리지가', 0, true], ['커버리지', 1, false]]],
  ['혹시 커버리지 뜻 좀 알려주세요', ['wiki'], '커버리지뜻알려주세요', true, [['커버리지 뜻', 0, true], ['커버리지', 2, false]]],
  ['보고서 모드로 바꿔줘', ['workspace'], '보고서모드로바꿔줘', true, [['보고서 모드로', 0, true], ['보고서 모드', 1, false], ['보고서', 2, false]]],
  ['qhrhtj ahemfh qkRnjwnj', ['workspace'], '보고서모드로바꿔줘', true, [['qhrhtj ahemfh qkrnjwnj', 0, true], ['보고서 모드로', 50, true], ['보고서 모드', 51, false], ['보고서', 52, false]]],
  ['회의모드로바꿔줘', ['workspace'], '회의모드로바꿔줘', true, [['회의모드로', 0, true], ['회의모드', 1, false]]],
  ['회의 화면 불러와줘', ['workspace'], '회의화면불러와줘', true, [['회의 화면', 0, true], ['회의', 2, false]]],
  ['QA 모드 켜줘', ['workspace'], 'qa모드켜줘', true, [['qa 모드', 0, true], ['qa', 2, false]]],
  ['qa로 전환', ['workspace'], 'qa로전환', true, [['qa로 전환', 0, true], ['qa 전환', 1, false], ['qa', 2, false]]],
  ['시험 배치로 복원', ['workspace'], '시험배치로복원', true, [['시험 배치로 복원', 0, true], ['시험 배치 복원', 1, false], ['시험', 2, false]]],
  ['지금 배치 저장해줘', ['workspace', 'workspace-save'], '지금배치저장해줘', true, [['지금 배치', 0, true], ['지금', 2, false]]],
  ['현재 배치 기억해줘', ['workspace', 'workspace-save'], '현재배치기억해줘', true, [['현재 배치 기억', 0, true]]],
  ['배치 저장', ['workspace', 'workspace-save'], '배치저장', true, [['배치 저장', 0, true]]],
  ['이슈 양식', ['snippet'], '이슈양식', true, [['이슈 양식', 0, true], ['이슈', 2, false]]],
  ['결함 리포트 붙여줘', ['snippet'], '결함리포트붙여줘', true, [['결함 리포트', 0, true]]],
  ['메일 서명', [], '메일서명', false, [['메일 서명', 0, true]]],
  ['서명 붙여넣어줘', ['snippet'], '서명붙여넣어줘', true, [['서명', 0, true]]],
  ['가명 되돌려줘', ['masking', 'unmask'], '가명되돌려줘', true, [['가명', 0, true]]],
  ['원래 이름으로 돌려줘', ['masking', 'unmask'], '원래이름으로돌려줘', true, [['원래 이름으로 돌려', 0, true], ['원래 이름 돌려', 1, false], ['돌려', 2, false]]],
  ['rkaud ehlehffuwnj', ['masking', 'unmask'], '가명되돌려줘', true, [['rkaud ehlehffuwnj', 0, true], ['가명', 50, true]]],
  ['선택한 글 가려줘', ['masking', 'mask-selection'], '선택한글가려줘', true, [['선택한 글', 0, true]]],
  ['가명 처리 꺼줘', ['masking'], '가명처리꺼줘', true, [['가명 처리', 0, true], ['처리', 2, false]]],
  ['마스킹 사전 열어줘', ['masking'], '마스킹사전열어줘', true, [['마스킹 사전', 0, true], ['사전', 2, false]]],
  ['용어 팩 내보내기', ['wiki', 'settings'], '용어팩내보내기', true, [['용어 팩 내보내기', 0, true], ['팩', 2, false]]],
  ['바 모양 바꿔줘', ['workspace'], '바모양바꿔줘', true, [['바 모양', 0, true]]],
  ['정확도', [], '정확도', false, [['정확도', 0, true], ['정확', 1, false]]],
  ['평가', [], '평가', false, [['평가', 0, true]]],
  ['결과', [], '결과', false, [['결과', 0, true]]],
  ['ghldmlfhr wjdflgownj', ['prompt'], '회의록정리해줘', true, [['ghldmlfhr wjdflgownj', 0, true], ['회의록', 50, true]]]
]

describe('의도 단어 맞추기는 같은 낱말 수의 이어진 낱말만 비교한다(결과는 바꾸기 전과 같다)', () => {
  it.each(BEFORE)('%s', (sentence, intents, key, natural, variants) => {
    expect(understand(sentence, pack)).toEqual({ variants: variants.map(([text, penalty, typo]) => ({ text, penalty, typo })), intents, key, natural })
  })

  it('긴 문장(200자)도 바꾸기 전과 같다: 조사를 뗀 "초안"만 의도 단어로 빠진다', () => {
    const sentence = '회의록 좀 정리해 주세요 그리고 주간보고 초안도 작성해 주시고 메일 회신 초안도 써 주세요 '.repeat(5).slice(0, 200)
    // 200자에서 잘린 네 번째 되풀이는 '써'로 끝난다
    const repeated = (draft: string): string => `회의록 정리해 주세요 그리고 주간보고 ${draft}작성해 주시고 메일 회신 ${draft}써 주세요 `.repeat(4).trim().slice(0, -' 주세요'.length)
    const u = understand(sentence, pack)
    expect(u.intents).toEqual(['prompt'])
    expect(u.natural).toBe(true)
    expect(u.key).toHaveLength(141)
    expect(u.variants).toEqual([
      { text: repeated('초안도 '), penalty: 0, typo: true },
      { text: repeated('초안 '), penalty: 1, typo: false },
      { text: repeated(''), penalty: 2, typo: false }
    ])
  })

  it('여러 낱말 의도 단어는 이어진 같은 수의 낱말에만 맞는다(사이에 다른 낱말이 끼면 아니다)', () => {
    expect(understand('테스트 케이스 만들어줘', pack).intents).toEqual(['prompt'])
    expect(understand('테스트 시험 케이스', pack).intents).toEqual([])
    expect(understand('원래 이름', pack).intents).toEqual(['masking', 'unmask'])
    expect(understand('원래이름', pack).intents).toEqual([])
  })
})
