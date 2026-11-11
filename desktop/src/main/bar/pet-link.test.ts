import { describe, expect, it, vi, type Mock } from 'vitest'
import type { BarViewState } from '../../shared/bar/bar-items'
import type { Rect } from '../../shared/types'
import type { BarWindowPort } from './bar-controller'
import { fullscreenInOrder, linkBarPort, raiseInOrder, safely } from './pet-link'

const R: Rect = { x: 1864, y: 292, width: 56, height: 456 }
const STATE = { collapsed: true } as unknown as BarViewState

/** 부른 순서를 남기는 바 창 포트 */
type FakePort = { [K in keyof BarWindowPort]: Mock<BarWindowPort[K]> }

describe('fullscreenInOrder: 전체 화면 시작·끝에서 펫과 바의 순서(설계 §14-2, Review Focus 2)', () => {
  it('켜질 때는 펫이 바보다 먼저 숨고, 꺼질 때는 바가 나온 다음 펫이 나온다(숨은 펫이 바 없는 중간 세계를 보지 않게)', () => {
    const calls: string[] = []
    const change = fullscreenInOrder({ bar: (on) => void calls.push(`bar ${on}`), pet: (on) => void calls.push(`pet ${on}`) })
    change(true)
    change(false)
    expect(calls).toEqual(['pet true', 'bar true', 'bar false', 'pet false'])
  })

  it('펫 쪽 오류가 바의 전체 화면 숨김·표시를 막지 않는다', () => {
    const bar = vi.fn()
    const change = fullscreenInOrder({
      bar,
      pet: () => {
        throw new Error('pet')
      }
    })
    expect(() => change(true)).not.toThrow()
    expect(() => change(false)).not.toThrow()
    expect(bar.mock.calls).toEqual([[true], [false]])
  })
})

describe('raiseInOrder: 맨 앞 순서는 바 → (보이면) 펼침 창 → 펫', () => {
  it('바 유지 주기마다 바, 보이는 펼침 창, 펫 순서로 올린다', () => {
    const calls: string[] = []
    let flyoutVisible = false
    const raise = raiseInOrder({
      bar: () => void calls.push('bar'),
      flyout: { visible: () => flyoutVisible, raise: () => void calls.push('flyout') },
      after: () => void calls.push('pet')
    })
    raise()
    flyoutVisible = true
    raise()
    expect(calls).toEqual(['bar', 'pet', 'bar', 'flyout', 'pet'])
  })

  it('펫 올리기가 던져도 바·펼침 창 올리기는 이미 끝났고 던지지 않는다', () => {
    const bar = vi.fn()
    const raise = raiseInOrder({
      bar,
      flyout: { visible: () => false, raise: vi.fn() },
      after: () => {
        throw new Error('pet')
      }
    })
    expect(() => raise()).not.toThrow()
    expect(bar).toHaveBeenCalledTimes(1)
  })
})

describe('linkBarPort: 바 창을 놓거나 보이거나 숨기거나 바 화면이 바뀐 뒤 펫에 알린다', () => {
  function port(): { p: FakePort; calls: string[] } {
    const calls: string[] = []
    const p: FakePort = {
      setBounds: vi.fn<BarWindowPort['setBounds']>((r) => void calls.push(`setBounds ${r.y}`)),
      getBounds: vi.fn<BarWindowPort['getBounds']>(() => R),
      showInactive: vi.fn<BarWindowPort['showInactive']>(() => void calls.push('showInactive')),
      hide: vi.fn<BarWindowPort['hide']>(() => void calls.push('hide')),
      send: vi.fn<BarWindowPort['send']>(() => void calls.push('send'))
    }
    return { p, calls }
  }

  it('끌기·자동 숨김(창 크기·화면 접힘)·모양 변경·잠시 숨김이 모두 지나는 네 곳 뒤에 알린다. getBounds는 알리지 않는다', () => {
    const { p, calls } = port()
    const linked = linkBarPort(p, () => void calls.push('changed'))
    linked.setBounds({ ...R, y: 300 })
    linked.showInactive()
    linked.send(STATE)
    linked.hide()
    expect(linked.getBounds()).toBe(R)
    expect(calls).toEqual(['setBounds 300', 'changed', 'showInactive', 'changed', 'send', 'changed', 'hide', 'changed'])
    expect(p.send).toHaveBeenCalledWith(STATE)
  })

  it('펫 쪽 오류가 바 창 동작을 막지 않는다', () => {
    const { p } = port()
    const linked = linkBarPort(p, () => {
      throw new Error('pet')
    })
    expect(() => linked.setBounds(R)).not.toThrow()
    expect(() => linked.hide()).not.toThrow()
    expect(p.setBounds).toHaveBeenCalledWith(R)
    expect(p.hide).toHaveBeenCalledTimes(1)
  })
})

it('safely: 던져도 삼킨다(펫 고리는 바를 멈추지 않는다)', () => {
  expect(() =>
    safely(() => {
      throw new Error('x')
    })
  ).not.toThrow()
  const fn = vi.fn()
  safely(fn)
  expect(fn).toHaveBeenCalledTimes(1)
})
