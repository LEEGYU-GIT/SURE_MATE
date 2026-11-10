import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseIntentPack } from './intent-pack'
import { MAX_PHRASE, understand } from './understand'

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
