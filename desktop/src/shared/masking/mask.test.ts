import { expect, it } from 'vitest'
import { findTerms, type MaskTerm } from './dictionary'
import { MappingTable } from './mapping-table'
import { mapRanges, maskPreamble, maskText, type MaskOptions } from './mask'
import { findPatterns } from './patterns'
import { ALL_CATEGORIES, type MaskCategory } from './types'

const allOn = Object.fromEntries(ALL_CATEGORIES.map((c) => [c, true])) as Record<MaskCategory, boolean>
const terms: MaskTerm[] = [
  { id: 'gasang', category: 'client', canonical: '가상자동차', aliases: [] },
  { id: 'xy', category: 'client', canonical: 'XY방산', aliases: [] }
]
/** 설계 문서 §8 완료 기준 예시(이름은 가상) */
const SAMPLE = '가상자동차에서 받은 SRS를 XY방산는 10.0.3.15의 \\\\fs01\\proj 폴더에 올림'
const detect = (text: string): ReturnType<typeof findTerms> => [...findTerms(text, terms), ...findPatterns(text, { internalDomains: [] })]
const table = (): MappingTable => new MappingTable({ now: () => 0, ttlMs: 8 * 3600_000 })
const restore = (over: Partial<MaskOptions> = {}): MaskOptions => ({ mode: 'restore', categories: allOn, disabledKeys: [], ...over })

it('가명 후 되돌리기: 이름·IP·경로를 토큰으로', () => {
  expect(maskText(SAMPLE, detect(SAMPLE), restore(), table()).text).toBe('CLIENT_A에서 받은 SRS를 CLIENT_B는 IP_1의 PATH_1 폴더에 올림')
})

it('결과에서 빼기: 읽기 쉬운 표기를 쓰고 대응표에 남기지 않는다', () => {
  const t = table()
  const r = maskText(SAMPLE, detect(SAMPLE), restore({ mode: 'remove' }), t)
  expect(r.text).toBe('고객사A에서 받은 SRS를 고객사B는 [IP 주소]의 [파일 경로] 폴더에 올림')
  expect(t.size()).toBe(0)
})

it('분류 하나를 끄면 그 분류만 원문', () => {
  const r = maskText(SAMPLE, detect(SAMPLE), restore({ categories: { ...allOn, ip: false } }), table())
  expect(r.text).toBe('CLIENT_A에서 받은 SRS를 CLIENT_B는 10.0.3.15의 PATH_1 폴더에 올림')
})

it('항목 하나를 끄면 그 이름의 모든 자리가 원문', () => {
  const text = '가상자동차와 XY방산, 다시 가상자동차'
  const r = maskText(text, detect(text), restore({ disabledKeys: ['client:gasang'] }), table())
  expect(r.text).toBe('가상자동차와 CLIENT_A, 다시 가상자동차')
})

it('같은 이름은 다음 글에서도 같은 토큰, 원문에 이미 있는 토큰 모양은 건너뛴다', () => {
  const t = table()
  expect(maskText('XY방산', detect('XY방산'), restore(), t).text).toBe('CLIENT_A')
  expect(maskText('또 XY방산', detect('또 XY방산'), restore(), t).text).toBe('또 CLIENT_A')
  const text = 'CLIENT_B 담당은 가상자동차'
  expect(maskText(text, detect(text), restore(), t).text).toBe('CLIENT_B 담당은 CLIENT_C')
})

it('결과 글에서 가린 자리와, 키마다 한 번씩 적용 목록과 횟수', () => {
  const text = 'XY방산와 XY방산, 10.0.3.15'
  const r = maskText(text, detect(text), restore(), table())
  expect(r.ranges.map(([s, e]) => r.text.slice(s, e))).toEqual(['CLIENT_A', 'CLIENT_A', 'IP_1'])
  expect(r.applied).toEqual([
    { key: 'client:xy', category: 'client', original: 'XY방산', replacement: 'CLIENT_A', count: 2 },
    { key: 'ip:10.0.3.15', category: 'ip', original: '10.0.3.15', replacement: 'IP_1', count: 1 }
  ])
})

it('원문 위치를 가린 뒤 위치로 옮긴다(넣은 글 형광펜이 가린 뒤에도 맞게)', () => {
  const text = 'XY방산와 10.0.3.15 입력'
  const r = maskText(text, detect(text), restore(), table())
  expect(r.text).toBe('CLIENT_A와 IP_1 입력')
  expect(mapRanges([[text.indexOf('입력'), text.length]], r.edits, 0)).toEqual([[r.text.indexOf('입력'), r.text.length]])
  expect(mapRanges([[0, text.length]], r.edits, 10)).toEqual([[10, r.text.length + 10]])
  // 가린 자리 안쪽 위치는 가린 표시의 끝으로
  expect(mapRanges([[1, 2]], r.edits, 0)).toEqual([[0, 'CLIENT_A'.length]])
})

it('머리말(설계 문서 §8)', () => {
  expect(maskPreamble('restore')).toBe('CLIENT_A, IP_1 같은 표시는 가린 이름입니다. 바꾸거나 풀어 쓰지 말고 그대로 써 주세요.')
  expect(maskPreamble('remove')).toBe("'고객사A', '[IP 주소]' 같은 표시는 가린 정보입니다. 실제 이름을 추측하지 말고 표시 그대로 써 주세요.")
})
