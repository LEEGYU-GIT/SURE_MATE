import { describe, expect, it } from 'vitest'
import type { BarEdge } from '../../../shared/bar/bar-settings'
import type { FlyoutContent, FlyoutMessage, FlyoutPad } from '../../../shared/flyout/flyout-content'
import { flyoutReducer, initialFlyoutState, LABEL_CHAIN_MS, type FlyoutViewState } from './flyout-state'

const PAD: FlyoutPad = { top: 16, right: 0, bottom: 32, left: 24 }
const msg = (seq: number, content: FlyoutContent, pad: FlyoutPad = PAD, edge: BarEdge = 'right'): FlyoutMessage => ({ seq, content, pad, edge })
const label = (text: string): FlyoutContent => ({ kind: 'label', text })
const masking: FlyoutContent = { kind: 'masking-menu', mode: 'restore' }
const card = (pinned: boolean): FlyoutContent => ({
  kind: 'wiki-card',
  pinned,
  width: 360,
  view: { kind: 'none', source: 'selection', query: 'mcdc' }
})

/** 메시지를 받고 shown까지 받은 상태 */
function shownState(m: FlyoutMessage, at = 0): FlyoutViewState {
  const s = flyoutReducer(initialFlyoutState, { type: 'content', message: m, at })
  return flyoutReducer(s, { type: 'shown', seq: m.seq, at })
}

describe('그림자 여백(pad) 계약: 같은 seq로 다시 오면 여백만 바뀐 것', () => {
  it('main이 창을 작업 영역 안으로 맞춰 여백을 줄여 같은 seq로 다시 보내면, 내용은 두고 pad만 바꾼다', () => {
    const first = msg(4, masking)
    const s1 = flyoutReducer(initialFlyoutState, { type: 'content', message: first, at: 0 })
    const clamped: FlyoutPad = { top: 0, right: 0, bottom: 12, left: 24 }
    // 내용이 달라 보여도 같은 seq면 내용은 바꾸지 않는다(내용 갱신만 seq로 거른다)
    const s2 = flyoutReducer(s1, { type: 'content', message: msg(4, { kind: 'bar-menu', shape: 'edge' }, clamped), at: 5 })
    expect(s2.message?.pad).toEqual(clamped)
    expect(s2.message?.content).toBe(first.content)
    expect(s2.message?.seq).toBe(4)
  })

  it('이미 열린 뒤에 여백만 바뀌어도 열린 채로 두고 다시 움직이지 않는다', () => {
    const s1 = shownState(msg(2, masking))
    const s2 = flyoutReducer(s1, { type: 'content', message: msg(2, masking, { ...PAD, bottom: 8 }), at: 10 })
    expect(s2.open).toBe(true)
    expect(s2.message?.pad.bottom).toBe(8)
  })

  it('같은 seq·같은 여백이면 상태를 그대로 돌려준다(다시 그리지 않음)', () => {
    const s1 = shownState(msg(2, masking))
    expect(flyoutReducer(s1, { type: 'content', message: msg(2, masking, { ...PAD }), at: 10 })).toBe(s1)
  })
})

describe('바 쪽(edge)은 main이 보낸 값을 쓴다(여백에서 짐작하지 않는다)', () => {
  it('왼쪽 바면 여백이 모두 0이어도 바 쪽은 왼쪽이다', () => {
    const zero: FlyoutPad = { top: 0, right: 0, bottom: 0, left: 0 }
    const s = shownState(msg(1, masking, zero, 'left'))
    expect(s.message?.edge).toBe('left')
  })

  it('같은 seq로 바 쪽이 바뀌어 오면(띄우기 전에 바가 반대쪽으로 옮김) 여백과 바 쪽을 함께 바꾸고 내용은 둔다', () => {
    const s1 = flyoutReducer(initialFlyoutState, { type: 'content', message: msg(4, masking), at: 0 })
    const leftPad: FlyoutPad = { top: 16, right: 24, bottom: 32, left: 0 }
    const s2 = flyoutReducer(s1, { type: 'content', message: msg(4, masking, leftPad, 'left'), at: 5 })
    expect(s2.message).toMatchObject({ seq: 4, pad: leftPad, edge: 'left' })
    expect(s2.message?.content).toBe(s1.message?.content)
    // 여백이 같아도 바 쪽이 다르면 바꾼다
    const s3 = flyoutReducer(s2, { type: 'content', message: msg(4, masking, leftPad, 'right'), at: 6 })
    expect(s3).not.toBe(s2)
    expect(s3.message?.edge).toBe('right')
  })
})

describe('들어오는 움직임', () => {
  it('새 seq는 shown(seq)을 받을 때까지 감춘다(이전 내용이 새 자리에, 새 내용이 옛 자리에 비치지 않게)', () => {
    const s1 = shownState(msg(1, label('설정')))
    const s2 = flyoutReducer(s1, { type: 'content', message: msg(2, masking), at: 5000 })
    expect(s2.open).toBe(false)
    expect(s2.message?.seq).toBe(2)
    const s3 = flyoutReducer(s2, { type: 'shown', seq: 2, at: 5100 })
    expect(s3.open).toBe(true)
    expect(s3.instant).toBe(false)
  })

  it('다른 seq의 shown은 무시한다(늦게 온 옛 shown)', () => {
    const s1 = flyoutReducer(initialFlyoutState, { type: 'content', message: msg(3, masking), at: 0 })
    expect(flyoutReducer(s1, { type: 'shown', seq: 2, at: 1 })).toBe(s1)
    expect(flyoutReducer(initialFlyoutState, { type: 'shown', seq: 1, at: 1 })).toBe(initialFlyoutState)
  })

  it('창이 뜬 뒤 처음 물어 받은 내용(getFlyoutContent)은 움직임 없이 바로 보이고, 이미 받은 내용은 덮지 않는다', () => {
    const s1 = flyoutReducer(initialFlyoutState, { type: 'initial', message: msg(7, masking) })
    expect(s1).toMatchObject({ open: true, instant: true })
    expect(s1.message?.seq).toBe(7)
    const pushed = flyoutReducer(initialFlyoutState, { type: 'content', message: msg(8, label('설정')), at: 0 })
    expect(flyoutReducer(pushed, { type: 'initial', message: msg(7, masking) })).toBe(pushed)
  })

  it('위키 카드 고정만 바뀐 새 seq는 열린 채 둔다(main이 창을 다시 띄우지 않아 shown이 오지 않는다)', () => {
    const s1 = shownState(msg(5, card(false)))
    const s2 = flyoutReducer(s1, { type: 'content', message: msg(6, card(true)), at: 100 })
    expect(s2).toMatchObject({ open: true, instant: true })
    expect(s2.message?.content).toEqual(card(true))
    // 다른 카드로 바뀌면 새로 띄우는 것이라 shown을 기다린다
    const other: FlyoutContent = { kind: 'wiki-card', pinned: false, width: 360, view: { kind: 'none', source: 'selection', query: 'sil' } }
    expect(flyoutReducer(s1, { type: 'content', message: msg(6, other), at: 100 }).open).toBe(false)
  })

  it('앞 이름표가 보인 지 얼마 안 돼 이어지는 이름표는 움직임 없이 바로 보인다(바를 훑을 때)', () => {
    const s1 = shownState(msg(1, label('팔레트 열기')), 1000)
    const s2 = flyoutReducer(s1, { type: 'content', message: msg(2, label('가명 처리: 끔')), at: 1000 + LABEL_CHAIN_MS })
    expect(s2).toMatchObject({ open: false, instant: true })
    const s3 = flyoutReducer(s2, { type: 'shown', seq: 2, at: 1000 + LABEL_CHAIN_MS + 20 })
    expect(s3).toMatchObject({ open: true, instant: true })
  })

  it('오래 머문 뒤의 이름표, 메뉴 뒤의 이름표, 첫 이름표는 120ms 투명도로 들어온다', () => {
    const s1 = shownState(msg(1, label('팔레트 열기')), 1000)
    expect(flyoutReducer(s1, { type: 'content', message: msg(2, label('설정')), at: 1001 + LABEL_CHAIN_MS }).instant).toBe(false)
    const menu = shownState(msg(3, masking), 1000)
    expect(flyoutReducer(menu, { type: 'content', message: msg(4, label('설정')), at: 1010 }).instant).toBe(false)
    expect(flyoutReducer(initialFlyoutState, { type: 'content', message: msg(1, label('설정')), at: 0 }).instant).toBe(false)
  })

  it('메뉴는 이름표 바로 뒤라도 움직임과 함께 들어온다', () => {
    const s1 = shownState(msg(1, label('가명 처리: 가명 후 되돌리기')), 1000)
    expect(flyoutReducer(s1, { type: 'content', message: msg(2, masking), at: 1100 }).instant).toBe(false)
  })
})
