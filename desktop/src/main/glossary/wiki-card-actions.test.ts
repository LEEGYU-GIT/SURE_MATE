import { expect, it, vi } from 'vitest'
import type { FlyoutAction } from '../../shared/flyout/flyout-content'
import { createWikiCardActions } from './wiki-card-actions'

function fake(copied = true) {
  const calls: string[] = []
  const d = {
    copy: vi.fn(async (id: string) => {
      calls.push(`copy:${id}`)
      return copied
    }),
    pin: vi.fn((p: boolean) => void calls.push(`pin:${p}`)),
    close: vi.fn((reason: string) => void calls.push(`close:${reason}`)),
    showPalette: vi.fn((p: unknown) => void calls.push(`palette:${JSON.stringify(p)}`)),
    lookupClipboard: vi.fn(async () => void calls.push('clipboard'))
  }
  return { run: createWikiCardActions(d), d, calls }
}

it('설명 복사: 카드는 그대로 두고 복사 결과를 돌려준다', async () => {
  const f = fake()
  expect(await f.run({ type: 'wiki-copy', id: 'mcdc' })).toBe(true)
  expect(f.calls).toEqual(['copy:mcdc'])
  expect(await fake(false).run({ type: 'wiki-copy', id: 'gone' })).toBe(false)
})

it('고정·클립보드 글로 찾기', async () => {
  const f = fake()
  expect(await f.run({ type: 'wiki-pin', pinned: true })).toBe(true)
  expect(await f.run({ type: 'wiki-clipboard' })).toBe(true)
  expect(f.calls).toEqual(['pin:true', 'clipboard'])
})

it('팔레트에서 열기: 카드를 닫은 뒤 그 용어 상세로 팔레트를 연다', async () => {
  const f = fake()
  expect(await f.run({ type: 'wiki-open', id: 'mcdc' })).toBe(true)
  expect(f.calls).toEqual(['close:open-palette', 'palette:{"mode":"wiki","id":"mcdc"}'])
})

it('팔레트에서 찾기: 카드를 닫고 위키 접두어(?)를 붙인 검색어로 연다', async () => {
  const f = fake()
  await f.run({ type: 'wiki-search', query: '정적분삭' })
  await f.run({ type: 'wiki-search', query: '' })
  expect(f.calls).toEqual(['close:open-palette', 'palette:{"mode":"search","query":"?정적분삭"}', 'close:open-palette', 'palette:{"mode":"search","query":"?"}'])
})

it('위키 카드 동작이 아니면 null(다른 처리기가 맡는다)', () => {
  const f = fake()
  const others: FlyoutAction[] = [{ type: 'close' }, { type: 'snooze-bar' }, { type: 'set-masking', mode: 'off' }]
  for (const a of others) expect(f.run(a)).toBeNull()
  expect(f.calls).toEqual([])
})
