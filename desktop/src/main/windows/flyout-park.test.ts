import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Rect } from '../../shared/types'
import { createFlyoutParker, PARK, PARK_DELAY_MS, type ParkTarget } from './flyout-park'

function fakeTarget(): ParkTarget & { bounds: Rect; ignore: boolean; visible: boolean; calls: string[] } {
  const t = {
    bounds: { x: 1500, y: 200, width: 360, height: 180 } as Rect,
    ignore: false,
    visible: false,
    calls: [] as string[],
    getBounds: () => t.bounds,
    setBounds: (r: Rect) => {
      t.calls.push('setBounds')
      t.bounds = { ...r }
    },
    setIgnoreMouseEvents: (v: boolean) => {
      t.calls.push(`ignore:${v}`)
      t.ignore = v
    },
    isVisible: () => t.visible,
    showInactive: () => {
      t.calls.push('showInactive')
      t.visible = true
    }
  }
  return t
}

describe('createFlyoutParker: 펼침 창을 hide() 없이 화면 밖에 둔다', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('숨기면 PARK_DELAY_MS 뒤에 클릭 통과로 바꾸고 크기를 지킨 채 -8000, -8000으로 옮긴다', () => {
    const t = fakeTarget()
    const p = createFlyoutParker(t)
    p.showInactive()
    p.hide()
    vi.advanceTimersByTime(PARK_DELAY_MS - 1)
    expect(t.ignore).toBe(false)
    expect(p.isParked()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(t.ignore).toBe(true)
    expect(t.bounds).toEqual({ x: PARK, y: PARK, width: 360, height: 180 })
    expect(p.isParked()).toBe(true)
    expect(PARK).toBe(-8000)
    expect(PARK_DELAY_MS).toBe(300)
  })

  it('처음 한 번만 실제로 띄우고, 그 뒤에는 보이는 채 자리만 바뀐다(hide를 부르지 않는다)', () => {
    const t = fakeTarget()
    const p = createFlyoutParker(t)
    p.showInactive()
    p.hide()
    vi.advanceTimersByTime(PARK_DELAY_MS)
    t.calls.length = 0
    p.setBounds({ x: 1400, y: 300, width: 360, height: 200 })
    p.showInactive()
    expect(t.calls).toEqual(['setBounds', 'ignore:false'])
    expect(t.bounds).toEqual({ x: 1400, y: 300, width: 360, height: 200 })
    expect(t.ignore).toBe(false)
    expect(p.isParked()).toBe(false)
  })

  it('옮기기 전에 setBounds가 오면 옮기기를 취소한다', () => {
    const t = fakeTarget()
    const p = createFlyoutParker(t)
    p.showInactive()
    p.hide()
    vi.advanceTimersByTime(100)
    p.setBounds({ x: 1400, y: 300, width: 360, height: 200 })
    vi.advanceTimersByTime(1000)
    expect(t.bounds.x).toBe(1400)
    expect(t.ignore).toBe(false)
  })

  it('옮기기 전에 showInactive가 와도 취소한다', () => {
    const t = fakeTarget()
    const p = createFlyoutParker(t)
    p.showInactive()
    p.hide()
    vi.advanceTimersByTime(100)
    p.showInactive()
    vi.advanceTimersByTime(1000)
    expect(t.bounds.x).toBe(1500)
    expect(p.isParked()).toBe(false)
  })

  it('숨기기를 거듭하면 시간을 다시 잰다(앞 타이머가 일찍 옮기지 않는다)', () => {
    const t = fakeTarget()
    const p = createFlyoutParker(t)
    p.showInactive()
    p.hide()
    vi.advanceTimersByTime(200)
    p.hide()
    vi.advanceTimersByTime(200)
    expect(p.isParked()).toBe(false)
    vi.advanceTimersByTime(100)
    expect(p.isParked()).toBe(true)
  })

  it('옮겨 둔 동안 Windows가 창을 안으로 옮기면(move) 다시 내보낸다', () => {
    const t = fakeTarget()
    const p = createFlyoutParker(t)
    p.showInactive()
    p.hide()
    vi.advanceTimersByTime(PARK_DELAY_MS)
    t.bounds = { x: 0, y: 0, width: 360, height: 180 }
    p.onMove()
    expect(t.bounds).toEqual({ x: PARK, y: PARK, width: 360, height: 180 })
  })

  it('배율 반올림으로 1~2 DIP 어긋난 자리는 다시 옮기지 않는다(move 되먹임 방지)', () => {
    const t = fakeTarget()
    const p = createFlyoutParker(t)
    p.showInactive()
    p.hide()
    vi.advanceTimersByTime(PARK_DELAY_MS)
    t.bounds = { x: PARK + 1, y: PARK - 1, width: 360, height: 180 }
    t.calls.length = 0
    p.onMove()
    expect(t.calls).toEqual([])
  })

  it('옮겨 두지 않은 동안의 move는 건드리지 않는다', () => {
    const t = fakeTarget()
    const p = createFlyoutParker(t)
    p.showInactive()
    t.calls.length = 0
    p.onMove()
    expect(t.calls).toEqual([])
  })

  it('dispose는 대기 중인 옮기기를 취소한다', () => {
    const t = fakeTarget()
    const p = createFlyoutParker(t)
    p.showInactive()
    p.hide()
    p.dispose()
    vi.advanceTimersByTime(1000)
    expect(p.isParked()).toBe(false)
    expect(t.bounds.x).toBe(1500)
  })
})
