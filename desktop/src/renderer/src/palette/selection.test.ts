import { expect, it } from 'vitest'
import { nextSelection } from './selection'

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
