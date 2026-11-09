import { expect, it } from 'vitest'
import type { FlyoutAction } from './flyout-content'
import { parseFlyoutAction, parseFlyoutReady } from './flyout-action'

it('종류마다 올바른 값은 통과한다', () => {
  const ok: FlyoutAction[] = [
    { type: 'set-masking', mode: 'off' },
    { type: 'set-masking', mode: 'restore' },
    { type: 'set-masking', mode: 'remove' },
    { type: 'set-bar-shape', shape: 'edge' },
    { type: 'set-bar-shape', shape: 'capsule' },
    { type: 'set-bar-shape', shape: 'off' },
    { type: 'snooze-bar' },
    { type: 'open-settings' },
    { type: 'wiki-copy', id: 'mcdc' },
    { type: 'wiki-copy', id: 'x'.repeat(200) },
    { type: 'wiki-pin', pinned: true },
    { type: 'wiki-pin', pinned: false },
    { type: 'wiki-open', id: 'static-analysis' },
    { type: 'wiki-search', query: 'mc' },
    { type: 'wiki-clipboard' },
    { type: 'close' }
  ]
  for (const a of ok) expect(parseFlyoutAction(a), a.type).toEqual(a)
})

it('정해진 값이 아니면 null', () => {
  for (const bad of [
    { type: 'set-masking', mode: 'loud' },
    { type: 'set-masking' },
    { type: 'set-bar-shape', shape: 'floating' },
    { type: 'wiki-copy', id: 'x'.repeat(201) },
    { type: 'wiki-copy', id: '' },
    { type: 'wiki-open', id: 3 },
    { type: 'wiki-pin', pinned: 'yes' },
    { type: 'wiki-search', query: 7 },
    null,
    undefined,
    'close',
    ['close'],
    { type: 'eval' },
    { type: 'constructor' },
    {}
  ]) {
    expect(parseFlyoutAction(bad), JSON.stringify(bad) ?? String(bad)).toBeNull()
  }
})

it('검색어는 앞뒤 공백을 지우고 60자까지 자른다', () => {
  expect(parseFlyoutAction({ type: 'wiki-search', query: '  mc ' })).toEqual({ type: 'wiki-search', query: 'mc' })
  expect(parseFlyoutAction({ type: 'wiki-search', query: 'a'.repeat(70) })).toEqual({ type: 'wiki-search', query: 'a'.repeat(60) })
  // 글자(코드 포인트) 단위로 잘라 이모지 반쪽이 남지 않는다
  const cut = parseFlyoutAction({ type: 'wiki-search', query: '가'.repeat(59) + '😀😀' })
  expect(cut).toEqual({ type: 'wiki-search', query: '가'.repeat(59) + '😀' })
})

it('동작에 쓰지 않는 값은 버린다(main에 그대로 넘기지 않음)', () => {
  expect(parseFlyoutAction({ type: 'close', extra: 'x' })).toEqual({ type: 'close' })
  expect(parseFlyoutAction({ type: 'set-masking', mode: 'off', run: true })).toEqual({ type: 'set-masking', mode: 'off' })
})

it('parseFlyoutReady: seq는 0 이상 정수, 크기는 1~4000 유한수', () => {
  expect(parseFlyoutReady(1, 120, 24)).toEqual({ seq: 1, width: 120, height: 24 })
  expect(parseFlyoutReady(0, 1, 4000)).toEqual({ seq: 0, width: 1, height: 4000 })
  expect(parseFlyoutReady(3, 183.5, 52.25)).toEqual({ seq: 3, width: 183.5, height: 52.25 })
  expect(parseFlyoutReady(1.5, 10, 10)).toBeNull()
  expect(parseFlyoutReady(-1, 10, 10)).toBeNull()
  expect(parseFlyoutReady('1', 10, 10)).toBeNull()
  expect(parseFlyoutReady(1, 0, 10)).toBeNull()
  expect(parseFlyoutReady(1, 10, 5000)).toBeNull()
  expect(parseFlyoutReady(1, Number.NaN, 10)).toBeNull()
  expect(parseFlyoutReady(1, 10, Number.POSITIVE_INFINITY)).toBeNull()
  expect(parseFlyoutReady(Number.MAX_SAFE_INTEGER + 1, 10, 10)).toBeNull()
})
