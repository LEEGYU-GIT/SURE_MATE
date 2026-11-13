import { expect, it } from 'vitest'
import { nextSelection, selectionUpdater } from './selection'

const items = [{ id: 'a' }, { id: 'b' }]

it('검색어가 바뀌면 맨 위 항목을 고른다', () => {
  expect(nextSelection({ selected: 'b', prevQuery: '', query: 'm', items })).toBe('a')
})

it('검색어가 같고 고른 항목이 목록에 있으면 그대로 둔다', () => {
  expect(nextSelection({ selected: 'b', prevQuery: 'm', query: 'm', items })).toBe('b')
})

it('고른 항목이 목록에서 사라지면 맨 위 항목을 고른다', () => {
  expect(nextSelection({ selected: 'x', prevQuery: 'm', query: 'm', items })).toBe('a')
})

it('목록이 비면 빈 값', () => {
  expect(nextSelection({ selected: 'a', prevQuery: '', query: 'zz', items: [] })).toBe('')
})

it('갱신 함수는 만들 때의 지난 검색어를 쓴다: React가 다음 렌더에서 부를 때 ref가 새 검색어로 바뀌어 있어도 맨 위를 고른다', () => {
  const lastQuery = { current: 'Ttree 기록으로 주간보고 써' }
  const update = selectionUpdater({ prevQuery: lastQuery.current, query: 'Ttree 기록으로 주간보고 써줘', items })
  lastQuery.current = 'Ttree 기록으로 주간보고 써줘'
  expect(update('b')).toBe('a')
  // 검색어가 같으면(항목·문맥만 다시 받음) 고른 항목을 그대로 둔다
  expect(selectionUpdater({ prevQuery: 'm', query: 'm', items })('b')).toBe('b')
})
