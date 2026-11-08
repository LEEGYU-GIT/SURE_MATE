import { expect, it } from 'vitest'
import { buildSearchIndex, rank, type SearchDoc } from './ranker'

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

it('오타는 앞 단계 결과가 5개 미만일 때만, 자모 4~7개면 거리 1까지', () => {
  expect(scoreOf('정적분삭', 'static')).toBe(200)
  expect(scoreOf('정적분삭', 'dynamic')).toBeUndefined()
})

it('같은 점수면 제목이 짧은 것이 먼저, 그다음 넣은 순서. 빈 검색어는 결과 없음', () => {
  const i = buildSearchIndex([
    { id: 'long', title: '가나다라', aliases: [] },
    { id: 'short', title: '가나', aliases: [] },
    { id: 'short2', title: '가다', aliases: [] }
  ])
  expect(rank(i, '가').map((r) => r.id)).toEqual(['short', 'short2', 'long'])
  expect(rank(index, '   ')).toEqual([])
})
