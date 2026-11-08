import { expect, it } from 'vitest'
import { exportPack, mergeImport, packFileName, previewImport } from './merge'
import { parseGlossaryPack } from './pack'
import type { GlossaryEntry } from './types'

const e = (id: string, term: string, updatedAt = '2026-11-01T00:00:00.000Z', source: GlossaryEntry['source'] = 'user'): GlossaryEntry => ({
  id,
  term,
  aliases: [],
  definition: `${term} 설명`,
  links: [],
  tags: [],
  source,
  updatedAt,
  version: 1
})

const builtin = [e('mcdc', 'MC/DC', '2026-11-01T00:00:00.000Z', 'builtin'), e('sa', '정적분석', '2026-11-01T00:00:00.000Z', 'builtin')]
const mine = [e('u1', '우리 팀 용어')]
const current = [...builtin, ...mine]
const incoming = [
  e('new1', '새 용어 하나'),
  e('new2', '새 용어 둘'),
  e('sa', '정적분석', '2026-11-05T00:00:00.000Z'), // 같은 id, 더 새로움 → 바뀜
  e('u1', '우리 팀 용어', '2026-10-01T00:00:00.000Z'), // 같은 id, 더 오래됨 → 그대로
  e('other', 'mc dc') // 다른 id, 같은 이름 → 둘 다 둠
]

it('미리 보기: 새 용어·바뀐 용어·이름이 겹치는 용어·그대로를 센다', () => {
  expect(previewImport(current, incoming)).toEqual({ added: 2, changed: 1, sameName: 1, unchanged: 1 })
})

it('합친 결과가 미리 보기 숫자와 맞는다(같은 id는 새로운 쪽, 이름만 같으면 둘 다, 가져온 것은 imported)', () => {
  const next = mergeImport(mine, current, incoming)
  expect(next.map((x) => [x.id, x.source])).toEqual([
    ['u1', 'user'],
    ['new1', 'imported'],
    ['new2', 'imported'],
    ['sa', 'imported'],
    ['other', 'imported']
  ])
  expect(next.find((x) => x.id === 'sa')?.updatedAt).toBe('2026-11-05T00:00:00.000Z')
  expect(next.find((x) => x.id === 'u1')?.updatedAt).toBe('2026-11-01T00:00:00.000Z')
})

it('내보낸 글을 다시 읽으면 같은 항목이고, 기본 용어는 넣지 않는다', () => {
  const text = exportPack([...builtin, ...mine], '2026-11-09T10:00:00.000Z')
  const back = parseGlossaryPack(JSON.parse(text), 'imported')
  expect(back.errors).toEqual([])
  expect(back.entries.map((x) => x.id)).toEqual(['u1'])
  expect(JSON.parse(text).exportedAt).toBe('2026-11-09T10:00:00.000Z')
})

it('파일 이름은 sure-mate-용어팩-YYYYMMDD.json(설계 §9)', () => {
  expect(packFileName(new Date(2026, 10, 9, 23, 59))).toBe('sure-mate-용어팩-20261109.json')
})
