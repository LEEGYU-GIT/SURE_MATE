import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { WikiCardEntry, WikiCardView } from '../../../shared/flyout/flyout-content'
import { cardReducer, COPIED_MS, flashCopied, initialCardState } from './wiki-card-state'

const e = (id: string): WikiCardEntry => ({ id, term: id.toUpperCase(), aliases: [], definition: `${id} 설명`, source: 'builtin' })
const best: WikiCardView = { kind: 'best', source: 'selection', best: e('a'), others: [e('b'), e('c')] }
const found: WikiCardView = { kind: 'found', source: 'selection', entries: [e('a'), e('b')], more: 3 }

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

it('후보를 고르면 본문이 그 용어로 바뀌고 이전 본문은 후보로 간다', () => {
  let s = initialCardState(best)
  expect(s.current?.id).toBe('a')
  s = cardReducer(s, { type: 'pick-other', id: 'c' })
  expect(s.current?.id).toBe('c')
  expect(s.others.map((x) => x.id)).toEqual(['a', 'b'])
})

it('목록 카드: 행을 열면 그 용어 상세, 뒤로 가면 목록', () => {
  let s = initialCardState(found)
  expect(s.current).toBeNull()
  s = cardReducer(s, { type: 'open-entry', id: 'b' })
  expect(s.current?.id).toBe('b')
  s = cardReducer(s, { type: 'back' })
  expect(s.current).toBeNull()
})

it('복사 표시는 1.5초 뒤 사라진다', () => {
  let s = initialCardState(best)
  const dispatch = (a: Parameters<typeof cardReducer>[1]): void => {
    s = cardReducer(s, a)
  }
  flashCopied(dispatch)
  expect(s.copied).toBe(true)
  vi.advanceTimersByTime(COPIED_MS - 1)
  expect(s.copied).toBe(true)
  vi.advanceTimersByTime(1)
  expect(s.copied).toBe(false)
})
