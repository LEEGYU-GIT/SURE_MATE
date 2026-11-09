import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BarEdge } from '../../shared/bar/bar-settings'
import type { FlyoutMessage, MenuContent, WikiCardView } from '../../shared/flyout/flyout-content'
import type { Rect } from '../../shared/types'
import { globalTimers } from '../bar/test-timers'
import { createFlyoutController } from './flyout-controller'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const WA: Rect = { x: 0, y: 0, width: 1920, height: 1040 }
const bar: Rect = { x: 1864, y: 292, width: 56, height: 456 }
const items: Record<string, Rect> = {
  masking: { x: 1864, y: 344, width: 56, height: 40 },
  logo: { x: 1864, y: 300, width: 56, height: 40 },
  glossary: { x: 1864, y: 600, width: 56, height: 40 }
}
const maskingMenu: MenuContent = { kind: 'masking-menu', mode: 'restore' }
const barMenu: MenuContent = { kind: 'bar-menu', shape: 'edge' }
const view: WikiCardView = { kind: 'none', source: 'selection', query: 'x' }

/** 왼쪽 바면 같은 자리를 화면 왼쪽 끝으로 옮긴다 */
const atEdge = (r: Rect, edge: BarEdge): Rect => (edge === 'right' ? r : { ...r, x: 0 })

function make(o: { barVisible?: boolean; edge?: BarEdge } = {}) {
  let last: Rect = { x: 0, y: 0, width: 0, height: 0 }
  let barVisible = o.barVisible ?? true
  let edge: BarEdge = o.edge ?? 'right'
  let cursor = { x: 1890, y: 360 }
  let button: boolean | null = false
  let drift: Rect | null = null
  const calls: string[] = []
  const sent: FlyoutMessage[] = []
  const window = {
    setBounds: vi.fn((r: Rect) => { calls.push('setBounds'); last = drift && calls.filter((c) => c === 'setBounds').length === 1 ? drift : r }),
    getBounds: vi.fn(() => last),
    showInactive: vi.fn(() => void calls.push('showInactive')),
    hide: vi.fn(() => void calls.push('hide')),
    raise: vi.fn(() => void calls.push('raise')),
    send: vi.fn((m: FlyoutMessage) => { calls.push('send'); sent.push(m) }),
    shown: vi.fn(() => void calls.push('shown'))
  }
  const log = vi.fn()
  const onOpenChange = vi.fn()
  const c = createFlyoutController({
    window,
    barAnchor: (id) => {
      if (!barVisible) return null
      const item = id ? items[id] ?? null : null
      return { bar: atEdge(bar, edge), item: item && atEdge(item, edge), edge, workArea: WA }
    },
    barEdge: () => edge,
    cursorWorkArea: () => WA,
    cursor: () => cursor,
    mouseButtonDown: () => button,
    labelFor: (id) => (id === 'none' ? null : `label-${id}`),
    onOpenChange,
    timers: globalTimers(),
    log
  })
  return {
    c, window, log, onOpenChange, calls, sent,
    setCursor: (p: { x: number; y: number }) => { cursor = p },
    setButton: (b: boolean | null) => { button = b },
    setBarVisible: (v: boolean) => { barVisible = v },
    setEdge: (e: BarEdge) => { edge = e },
    setDrift: (r: Rect | null) => { drift = r },
    lastBounds: () => window.setBounds.mock.calls.at(-1)![0] as Rect
  }
}

describe('이름표', () => {
  it('400ms 뒤 전송, ready 뒤 setBounds → showInactive → raise → shown', () => {
    const t = make()
    t.c.hover('masking')
    vi.advanceTimersByTime(399)
    expect(t.window.send).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(t.sent[0]).toMatchObject({ seq: 1, content: { kind: 'label', text: 'label-masking' }, pad: { top: 16, right: 0, bottom: 32, left: 24 } })
    expect(t.window.showInactive).not.toHaveBeenCalled()
    t.c.ready(1, { width: 120, height: 24 })
    expect(t.calls).toEqual(['send', 'setBounds', 'showInactive', 'raise', 'shown'])
    expect(t.lastBounds()).toEqual({ x: 1712, y: 336, width: 144, height: 72 })
    expect(t.window.shown).toHaveBeenCalledWith(1)
    expect(t.log).toHaveBeenCalledWith('flyout.show', expect.objectContaining({ kind: 'label', seq: 1 }))
  })

  it('hover(null)이면 숨김, 300ms 안에는 다음 이름표가 바로 뜬다', () => {
    const t = make()
    t.c.hover('masking'); vi.advanceTimersByTime(400); t.c.ready(1, { width: 120, height: 24 })
    t.c.hover(null)
    expect(t.window.hide).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(299)
    t.c.hover('logo')
    expect(t.sent.at(-1)?.seq).toBe(2)
  })

  it('300ms가 지나면 다시 400ms를 기다린다', () => {
    const t = make()
    t.c.hover('masking'); vi.advanceTimersByTime(400); t.c.ready(1, { width: 120, height: 24 })
    t.c.hover(null)
    vi.advanceTimersByTime(300)
    t.c.hover('logo')
    expect(t.sent).toHaveLength(1)
    vi.advanceTimersByTime(400)
    expect(t.sent).toHaveLength(2)
  })

  it('이름표가 떠 있는 채 다른 항목으로 옮기면 바로 전송', () => {
    const t = make()
    t.c.hover('masking'); vi.advanceTimersByTime(400); t.c.ready(1, { width: 120, height: 24 })
    t.c.hover('logo')
    expect(t.sent.at(-1)?.content).toEqual({ kind: 'label', text: 'label-logo' })
  })

  it('옛 seq의 ready는 무시', () => {
    const t = make()
    t.c.hover('masking'); vi.advanceTimersByTime(400)
    t.c.hover('logo'); expect(t.sent).toHaveLength(2)
    t.c.ready(1, { width: 120, height: 24 })
    expect(t.window.showInactive).not.toHaveBeenCalled()
    t.c.ready(2, { width: 120, height: 24 })
    expect(t.window.showInactive).toHaveBeenCalledTimes(1)
  })

  it('ready가 없으면 300ms 뒤 기본 크기로 표시', () => {
    const t = make()
    t.c.hover('masking'); vi.advanceTimersByTime(400)
    vi.advanceTimersByTime(299)
    expect(t.window.showInactive).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(t.window.showInactive).toHaveBeenCalledTimes(1)
  })

  it('실제 창 크기가 어긋나면 setBounds를 한 번 더', () => {
    const t = make()
    t.setDrift({ x: 0, y: 0, width: 10, height: 10 })
    t.c.hover('masking'); vi.advanceTimersByTime(400); t.c.ready(1, { width: 120, height: 24 })
    expect(t.window.setBounds).toHaveBeenCalledTimes(2)
  })

  it('이름 표시 대상이 없으면(labelFor null) 보내지 않는다', () => {
    const t = make()
    t.c.hover('none'); vi.advanceTimersByTime(400)
    expect(t.sent).toHaveLength(0)
  })
})

describe('메뉴', () => {
  const open = (t: ReturnType<typeof make>, m: MenuContent = maskingMenu) => {
    t.c.toggleMenu(m, 'masking'); t.c.ready(t.sent.at(-1)!.seq, { width: 200, height: 140 })
  }

  it('열고 같은 메뉴를 다시 누르면 닫는다', () => {
    const t = make()
    open(t)
    expect(t.onOpenChange).toHaveBeenLastCalledWith(true)
    expect(t.lastBounds()).toEqual({ x: 1632, y: 328, width: 224, height: 188 })
    t.c.toggleMenu(maskingMenu, 'masking')
    expect(t.window.hide).toHaveBeenCalled()
    expect(t.onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('가명 처리 메뉴가 열린 채 바 메뉴를 열면 교체, 열림 알림은 한 번', () => {
    const t = make()
    open(t)
    t.c.toggleMenu(barMenu, null, 400)
    expect(t.sent.at(-1)?.content).toEqual(barMenu)
    t.c.ready(t.sent.at(-1)!.seq, { width: 200, height: 150 })
    expect(t.lastBounds().y).toBe(400 - 16)
    expect(t.onOpenChange.mock.calls.filter((a) => a[0] === true)).toHaveLength(1)
    expect(t.window.hide).not.toHaveBeenCalled()
  })

  it('메뉴가 열려 있으면 이름표를 띄우지 않는다', () => {
    const t = make()
    open(t)
    const n = t.sent.length
    t.c.hover('logo'); vi.advanceTimersByTime(1000)
    expect(t.sent).toHaveLength(n)
  })

  it('바·펼침 창 밖에서 마우스 버튼이 눌리면 50ms 안에 닫는다', () => {
    const t = make()
    open(t)
    t.setCursor({ x: 100, y: 100 }); t.setButton(true)
    vi.advanceTimersByTime(50)
    expect(t.log).toHaveBeenCalledWith('flyout.hide', { kind: 'masking-menu', reason: 'outside-click' })
  })

  it('바 위에서 눌린 버튼은 닫지 않는다', () => {
    const t = make()
    open(t)
    t.setCursor({ x: 1890, y: 500 }); t.setButton(true)
    vi.advanceTimersByTime(500)
    expect(t.window.hide).not.toHaveBeenCalled()
  })

  it('버튼 정보가 null이어도 커서가 1.5초 밖에 있으면 닫는다', () => {
    const t = make()
    open(t)
    t.setCursor({ x: 100, y: 100 }); t.setButton(null)
    vi.advanceTimersByTime(1450)
    expect(t.window.hide).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(t.log).toHaveBeenCalledWith('flyout.hide', { kind: 'masking-menu', reason: 'away' })
  })

  it('커서가 중간에 돌아오면 밖에 있던 시간을 다시 센다', () => {
    const t = make()
    open(t)
    t.setButton(null)
    t.setCursor({ x: 100, y: 100 }); vi.advanceTimersByTime(1000)
    t.setCursor({ x: 1890, y: 360 }); vi.advanceTimersByTime(100)
    t.setCursor({ x: 100, y: 100 }); vi.advanceTimersByTime(1400)
    expect(t.window.hide).not.toHaveBeenCalled()
  })

  it('커서가 펼침 창 위면 닫지 않는다', () => {
    const t = make()
    open(t)
    t.setCursor({ x: 1700, y: 400 }); t.setButton(null)
    vi.advanceTimersByTime(5000)
    expect(t.window.hide).not.toHaveBeenCalled()
  })

  it('닫으면 확인 반복이 멈춘다', () => {
    const t = make()
    open(t)
    t.c.close('select')
    const n = vi.getTimerCount()
    expect(n).toBe(0)
  })
})

describe('작업 영역 가장자리', () => {
  it('아래 끝에서 여백이 줄면 같은 seq로 여백을 다시 보내고 창이 작업 영역 안에 있다', () => {
    const t = make()
    items.masking = { x: 1864, y: 1000, width: 56, height: 40 }
    t.c.toggleMenu(maskingMenu, 'masking'); t.c.ready(1, { width: 200, height: 140 })
    items.masking = { x: 1864, y: 344, width: 56, height: 40 }
    const r = t.lastBounds()
    expect(r.y + r.height).toBeLessThanOrEqual(1040)
    expect(t.sent.at(-1)).toMatchObject({ seq: 1, pad: { top: 16, right: 0, bottom: 8, left: 24 } })
    expect(t.c.message()?.pad.bottom).toBe(8)
    expect(t.calls.indexOf('showInactive')).toBeGreaterThan(t.calls.lastIndexOf('send'))
  })
})

describe('바 쪽(edge)을 메시지에 담는다(화면이 여백에서 짐작하지 않게)', () => {
  it('왼쪽 바: 보낸 메시지와 지금 내용 모두 edge left, 바 쪽 면(왼쪽)에는 여백이 없다', () => {
    const t = make({ edge: 'left' })
    t.c.toggleMenu(maskingMenu, 'masking')
    expect(t.sent[0]).toMatchObject({ seq: 1, edge: 'left', pad: { top: 16, right: 24, bottom: 32, left: 0 } })
    t.c.ready(1, { width: 200, height: 140 })
    expect(t.lastBounds()).toEqual({ x: 64, y: 328, width: 224, height: 188 })
    expect(t.c.message()).toMatchObject({ seq: 1, edge: 'left' })
  })

  it('오른쪽 바(기본)도 edge right를 담는다', () => {
    const t = make()
    t.c.hover('masking'); vi.advanceTimersByTime(400)
    expect(t.sent[0].edge).toBe('right')
  })

  it('띄우기 전에 바가 반대쪽으로 옮겨지면 같은 seq로 바 쪽과 여백을 다시 보낸다', () => {
    const t = make()
    t.c.toggleMenu(maskingMenu, 'masking')
    t.setEdge('left')
    t.c.ready(1, { width: 200, height: 140 })
    expect(t.sent).toHaveLength(2)
    expect(t.sent[1]).toMatchObject({ seq: 1, edge: 'left', pad: { right: 24, left: 0 } })
    expect(t.c.message()).toMatchObject({ seq: 1, edge: 'left', pad: { right: 24, left: 0 } })
    expect(t.calls.indexOf('showInactive')).toBeGreaterThan(t.calls.lastIndexOf('send'))
  })

  it('바가 없을 때의 카드는 설정의 바 쪽 가장자리를 담는다', () => {
    const t = make({ barVisible: false, edge: 'left' })
    t.c.showCard(view, { width: 360, autoHideMs: 8000 })
    expect(t.sent[0].edge).toBe('left')
  })
})

describe('위키 카드', () => {
  const show = (t: ReturnType<typeof make>) => {
    t.c.showCard(view, { width: 360, autoHideMs: 8000 })
    t.c.ready(t.sent.at(-1)!.seq, { width: 360, height: 200 })
  }

  it('8초 뒤 timeout으로 숨김', () => {
    const t = make()
    show(t)
    expect(t.onOpenChange).toHaveBeenCalledWith(true)
    expect(t.lastBounds()).toEqual({ x: 1472, y: 584, width: 384, height: 248 })
    vi.advanceTimersByTime(7999)
    expect(t.window.hide).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(t.log).toHaveBeenCalledWith('flyout.hide', { kind: 'wiki-card', reason: 'timeout' })
  })

  it('마우스를 올리면 유지, 내리면 8초 뒤 숨김', () => {
    const t = make()
    show(t)
    vi.advanceTimersByTime(7000)
    t.c.pointer(true)
    vi.advanceTimersByTime(20000)
    expect(t.window.hide).not.toHaveBeenCalled()
    t.c.pointer(false)
    vi.advanceTimersByTime(7999)
    expect(t.window.hide).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(t.window.hide).toHaveBeenCalled()
  })

  it('고정하면 숨지 않고, 해제하면 8초 뒤 숨김', () => {
    const t = make()
    show(t)
    t.c.pin(true)
    expect(t.sent.at(-1)?.content).toMatchObject({ kind: 'wiki-card', pinned: true, width: 360 })
    vi.advanceTimersByTime(30000)
    expect(t.window.hide).not.toHaveBeenCalled()
    t.c.pin(false)
    vi.advanceTimersByTime(8000)
    expect(t.window.hide).toHaveBeenCalled()
  })

  it('바가 없으면 커서 모니터 가장자리 위쪽에 둔다', () => {
    const t = make({ barVisible: false })
    show(t)
    expect(t.lastBounds()).toEqual({ x: 1548 - 24, y: 0, width: 384, height: 244 })
  })

  it('바깥 클릭으로는 닫지 않는다', () => {
    const t = make()
    show(t)
    t.setCursor({ x: 100, y: 100 }); t.setButton(true)
    vi.advanceTimersByTime(5000)
    expect(t.window.hide).not.toHaveBeenCalled()
  })

  it('barHidden: 이름표·메뉴는 닫고 카드는 유지(새 기준으로 재배치)', () => {
    const t = make()
    t.c.toggleMenu(maskingMenu, 'masking'); t.c.ready(1, { width: 200, height: 140 })
    t.c.barHidden()
    expect(t.window.hide).toHaveBeenCalledTimes(1)
    const t2 = make()
    show(t2)
    t2.setBarVisible(false)
    t2.c.barHidden()
    expect(t2.window.hide).not.toHaveBeenCalled()
    expect(t2.lastBounds().x).toBe(1548 - 24)
  })

  it('displaysChanged: 보이는 카드를 다시 배치', () => {
    const t = make()
    show(t)
    const n = t.window.setBounds.mock.calls.length
    t.setBarVisible(false)
    t.c.displaysChanged()
    expect(t.window.setBounds.mock.calls.length).toBeGreaterThan(n)
    expect(t.lastBounds().x).toBe(1548 - 24)
  })

  it('close와 dispose는 타이머를 남기지 않는다', () => {
    const t = make()
    show(t)
    t.c.close('x')
    expect(vi.getTimerCount()).toBe(0)
    show(t)
    t.c.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })
})
