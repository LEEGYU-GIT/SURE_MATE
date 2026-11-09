import { expect, it } from 'vitest'
import { buildSearchIndex, rank, rankStages, TYPO_LONG_JAMO, type SearchDoc } from './ranker'

const docs: SearchDoc[] = [
  { id: 'dynamic', title: '동적분석', aliases: [] },
  { id: 'jeongjeok', title: '정적', aliases: [] },
  { id: 'static', title: '정적분석', aliases: ['static analysis', 'SA'] },
  { id: 'mcdc', title: 'MC/DC', aliases: ['MCDC', '변경 조건/결정 커버리지'] },
  { id: 'statement', title: '구문 커버리지', aliases: ['statement coverage'] },
  { id: 'sil', title: 'SIL', aliases: ['Safety Integrity Level'] },
  { id: 'search', title: '검색', aliases: [] },
  { id: 'ganada', title: '가나다', aliases: [] },
  { id: 'cpp', title: 'C++', aliases: [] },
  { id: 'meeting', title: '회의록 정리', aliases: ['회의 정리'] },
  { id: 'iso', title: 'ISO 26262', aliases: ['기능 안전 표준'], body: '자동차 전기·전자 시스템의 기능 안전 국제 표준' }
]
const index = buildSearchIndex(docs)
const top = (q: string): string | undefined => rank(index, q)[0]?.id
const scoreOf = (q: string, id: string): number | undefined => rank(index, q).find((r) => r.id === id)?.score

it('설계 §9 완료 기준: 초성·오타·영문 자판·약어로 맨 위를 찾는다', () => {
  expect(top('ㅈㅈㅂㅅ')).toBe('static')
  expect(top('정적분삭')).toBe('static')
  expect(top('wjdwjrqnstjr')).toBe('static')
  expect(top('mcdc')).toBe('mcdc')
  expect(top('MC/DC')).toBe('mcdc')
})

it('점수 단계: 제목 일치 1000 > 별칭 일치 950 > 제목 앞부분 900 > 별칭 앞부분 850', () => {
  const i = buildSearchIndex([
    { id: 'alias', title: 'X', aliases: ['ABC'] },
    { id: 'title', title: 'ABC', aliases: [] },
    { id: 'prefix', title: 'ABCD', aliases: [] },
    { id: 'aliasPrefix', title: 'Y', aliases: ['ABCDE'] }
  ])
  expect(rank(i, 'abc')).toEqual([
    { id: 'title', score: 1000 },
    { id: 'alias', score: 950 },
    { id: 'prefix', score: 900 },
    { id: 'aliasPrefix', score: 850 }
  ])
})

it('토큰 앞부분, 초성, 치는 중인 음절, 한영 오입력, 포함, 본문 순으로 점수가 낮아진다', () => {
  expect(scoreOf('정리', 'meeting')).toBe(800)
  expect(scoreOf('ㅎㅇㄹㅈㄹ', 'meeting')).toBe(750)
  expect(scoreOf('ㅎㅇㄹ', 'meeting')).toBe(700)
  expect(scoreOf('간', 'ganada')).toBe(650)
  expect(scoreOf('rjator', 'search')).toBe(600)
  expect(scoreOf('분석', 'static')).toBe(500)
  expect(scoreOf('국제 표준', 'iso')).toBe(100)
})

it('C++처럼 기호를 빼면 한 글자가 되는 이름은 원형으로 맞춘다', () => {
  expect(top('c++')).toBe('cpp')
  expect(scoreOf('c++', 'cpp')).toBe(1000)
})

it('오타: 검색어 자모 4~7개면 거리 1까지, 8개 이상이면 거리 2까지(300−100×거리)', () => {
  // '검삭'은 자모 6개(ㄱㅓㅁㅅㅏㄱ): '검색'과 거리 1이면 찾고, 거리 2인 '겸삭'은 찾지 않는다
  expect(scoreOf('검삭', 'search')).toBe(200)
  expect(scoreOf('겸삭', 'search')).toBeUndefined()
  // '정적분삭'·'종적분삭'은 자모 12개: 거리 1은 200, 거리 2는 100, 거리 3인 '동적분석'은 찾지 않는다
  expect(scoreOf('정적분삭', 'static')).toBe(200)
  expect(scoreOf('종적분삭', 'static')).toBe(100)
  expect(scoreOf('정적분삭', 'dynamic')).toBeUndefined()
})

it('오타는 앞 단계(300점 넘는) 결과가 5개 미만일 때만 본다', () => {
  const withPrefixHits = (n: number): ReturnType<typeof buildSearchIndex> =>
    buildSearchIndex([{ id: 'typo', title: '검색', aliases: [] }, ...Array.from({ length: n }, (_, i) => ({ id: `p${i}`, title: `검삭${i}`, aliases: [] }))])
  expect(rank(withPrefixHits(4), '검삭').find((r) => r.id === 'typo')?.score).toBe(200)
  expect(rank(withPrefixHits(5), '검삭').find((r) => r.id === 'typo')).toBeUndefined()
})

it('Windows IME가 받침 없이 친 겹자음(ㄳ·ㅄ)을 한 글자로 보내도 초성으로 찾는다', () => {
  const i = buildSearchIndex([...docs, { id: 'regression', title: '회귀 시험', aliases: [] }])
  expect(rank(i, 'ㅈㅈㅄ')[0]?.id).toBe('static')
  expect(rank(i, 'ㅎㄳㅎ')[0]?.id).toBe('regression')
  expect(rank(i, 'ㅎㄱㅅㅎ')[0]?.id).toBe('regression')
})

it('같은 점수면 제목에서 맞은 것이 별칭에서 맞은 것보다 먼저(제목이 더 길어도)', () => {
  const i = buildSearchIndex([
    { id: 'alias', title: '오탐', aliases: ['정적분석'] },
    { id: 'title', title: '정적분석', aliases: [] }
  ])
  // 초성 일치(750)와 치는 중인 음절(650)에서 둘 다 같은 점수
  expect(rank(i, 'ㅈㅈㅂㅅ')).toEqual([
    { id: 'title', score: 750 },
    { id: 'alias', score: 750 }
  ])
  expect(rank(i, '정ㅈ').map((r) => r.id)).toEqual(['title', 'alias'])
})

it('같은 점수·같은 자리(제목)면 제목이 짧은 것이 먼저, 그다음 넣은 순서. 빈 검색어는 결과 없음', () => {
  const i = buildSearchIndex([
    { id: 'long', title: '가나다라', aliases: [] },
    { id: 'short', title: '가나', aliases: [] },
    { id: 'short2', title: '가다', aliases: [] }
  ])
  expect(rank(i, '가').map((r) => r.id)).toEqual(['short', 'short2', 'long'])
  expect(rank(index, '   ')).toEqual([])
})

it('rankStages: 점수가 나온 단계(이름·별칭 / 자모 오타 / 설명 본문)와 검색어 자모 수를 함께 준다. rank는 거기서 단계만 뺀 것', () => {
  const stageOf = (q: string, id: string): string | undefined => rankStages(index, q).hits.find((h) => h.id === id)?.stage
  expect(stageOf('ㅈㅈㅂㅅ', 'static')).toBe('name')
  expect(stageOf('static', 'static')).toBe('name')
  expect(stageOf('정적분삭', 'static')).toBe('typo')
  // 거리 2인 오타도 100점이라 본문과 점수가 같지만 단계는 오타
  expect(stageOf('종적분삭', 'static')).toBe('typo')
  expect(stageOf('국제', 'iso')).toBe('body')
  // 자모 수는 랭커가 세는 그대로(공백을 뺀 이름 키의 자모)
  expect(rankStages(index, '정적분삭').jamoLength).toBe(12)
  expect(rankStages(index, '서버').jamoLength).toBe(4)
  expect(rankStages(index, '   ')).toEqual({ jamoLength: 0, hits: [] })
  // 자모 8개부터 오타를 2개까지 봐준다
  expect(TYPO_LONG_JAMO).toBe(8)
  for (const q of ['ㅈㅈㅂㅅ', '정적분삭', '종적분삭', '국제', 'mcdc', '검삭']) {
    expect(rank(index, q)).toEqual(rankStages(index, q).hits.map(({ id, score }) => ({ id, score })))
  }
})
