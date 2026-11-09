import type { BarEdge } from '../../shared/bar/bar-settings'
import type { FlyoutContent, FlyoutMessage, FlyoutPad, MenuContent, WikiCardView } from '../../shared/flyout/flyout-content'
import { needsResize } from '../../shared/palette-rules'
import type { Rect } from '../../shared/types'
import type { BarAnchor } from '../bar/bar-controller'
import type { Timers } from '../timers'
import { edgeCardRect, flyoutCardRect, flyoutWindowRect } from './flyout-placement'

export const FLYOUT_TIMING = { labelDelayMs: 400, labelChainMs: 300, readyTimeoutMs: 300, dismissPollMs: 50, menuAwayMs: 1500 }

/**
 * renderer가 ready를 보내지 못했을 때 쓰는 종류별 기본 크기(위키 카드의 너비는 내용의 width를 쓴다).
 * 메뉴는 펼침 창 화면(renderer/src/flyout)의 실제 크기와 같다(너비 272, 높이는 행 수로 정해진다). 작으면 메뉴가 잘린다.
 */
export const FLYOUT_FALLBACK_SIZE: Record<FlyoutContent['kind'], { width: number; height: number }> = {
  label: { width: 120, height: 24 },
  'masking-menu': { width: 272, height: 192 },
  'workspace-menu': { width: 272, height: 152 },
  'bar-menu': { width: 272, height: 224 },
  'wiki-card': { width: 360, height: 200 }
}

export interface FlyoutWindowPort {
  setBounds(r: Rect): void
  getBounds(): Rect
  showInactive(): void
  hide(): void
  raise(): void
  send(m: FlyoutMessage): void
  shown(seq: number): void
}

export interface FlyoutController {
  hover(itemId: string | null): void
  toggleMenu(content: MenuContent, itemId: string | null, atY?: number): void
  showCard(view: WikiCardView, o: { width: number; autoHideMs: number }): void
  ready(seq: number, size: { width: number; height: number }): void
  pointer(inside: boolean): void
  pin(pinned: boolean): void
  close(reason: string): void
  barHidden(): void
  displaysChanged(): void
  message(): FlyoutMessage | null
  dispose(): void
}

type Deps = {
  window: FlyoutWindowPort
  barAnchor(itemId: string | null): BarAnchor | null
  barEdge(): BarEdge
  cursorWorkArea(): Rect
  cursor(): { x: number; y: number }
  mouseButtonDown(): boolean | null
  labelFor(itemId: string): string | null
  onOpenChange(open: boolean): void
  timers: Timers
  log(event: string, data: Record<string, unknown>): void
}

type Size = { width: number; height: number }
type Ctx = { itemId: string | null; atY?: number }
/** 창 사각형과 그 창에 맞춘 그림자 여백, 기준으로 삼은 바 쪽 */
type Placed = { window: Rect; pad: FlyoutPad; edge: BarEdge }

const inRect = (p: { x: number; y: number }, r: Rect): boolean => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height

export function createFlyoutController(d: Deps): FlyoutController {
  const T = FLYOUT_TIMING
  let seq = 0
  let content: FlyoutContent | null = null
  let ctx: Ctx = { itemId: null }
  let pad: FlyoutPad = { top: 0, right: 0, bottom: 0, left: 0 }
  let edge: BarEdge = 'right'
  let pending: { seq: number; reshow: boolean } | null = null
  let visible = false
  let open = false
  let chain = false
  let pinned = false
  let pointerInside = false
  let autoHideMs = 0
  let awayMs = 0
  let lastSize: Size | null = null
  let labelTimer: unknown = null
  let chainTimer: unknown = null
  let readyTimer: unknown = null
  let cardTimer: unknown = null
  let pollTimer: unknown = null

  const clearT = (h: unknown): null => {
    if (h !== null) d.timers.clearTimeout(h)
    return null
  }

  function stopPoll(): void {
    if (pollTimer !== null) d.timers.clearInterval(pollTimer)
    pollTimer = null
  }

  function anchorFor(c: FlyoutContent): BarAnchor | null {
    return d.barAnchor(c.kind === 'wiki-card' ? 'glossary' : ctx.itemId)
  }

  function edgeFor(c: FlyoutContent): BarEdge {
    return anchorFor(c)?.edge ?? d.barEdge()
  }

  /** 카드 사각형을 정해 창 사각형으로 바꾼다. 놓을 곳이 없으면 null */
  function windowFor(c: FlyoutContent, size: Size): Placed | null {
    const a = anchorFor(c)
    let card: Rect
    if (!a) {
      if (c.kind !== 'wiki-card') return null
      const wa = d.cursorWorkArea()
      const e = d.barEdge()
      card = edgeCardRect({ size, workArea: wa, edge: e })
      return { ...flyoutWindowRect(card, e, wa), edge: e }
    }
    let anchor: Rect
    if (c.kind === 'wiki-card') anchor = a.item ?? { x: a.bar.x, y: a.bar.y, width: a.bar.width, height: 0 }
    else anchor = a.item ?? { x: a.bar.x, y: ctx.atY ?? a.bar.y, width: a.bar.width, height: 0 }
    card = flyoutCardRect({ size, anchor, bar: a.bar, edge: a.edge, workArea: a.workArea, align: c.kind === 'label' ? 'center' : 'top' })
    return { ...flyoutWindowRect(card, a.edge, a.workArea), edge: a.edge }
  }

  /**
   * 작업 영역 때문에 여백이 줄었거나 띄우기 전에 바가 반대쪽으로 옮겨졌으면
   * 같은 seq로 여백·바 쪽만 바꿔 다시 보낸다(내용은 같음)
   */
  function applyBounds(placed: Placed): void {
    const win = placed.window
    const p = placed.pad
    if (content && (p.top !== pad.top || p.right !== pad.right || p.bottom !== pad.bottom || p.left !== pad.left || placed.edge !== edge)) {
      pad = p
      edge = placed.edge
      d.window.send({ seq, content, pad, edge })
    }
    d.window.setBounds(win)
    const actual = d.window.getBounds()
    if (needsResize(actual, win, 1) || actual.x !== win.x || actual.y !== win.y) d.window.setBounds(win)
  }

  function finish(size: Size, reshow: boolean): void {
    readyTimer = clearT(readyTimer)
    const c = content
    const mySeq = pending?.seq ?? seq
    pending = null
    if (!c) return
    lastSize = size
    const win = windowFor(c, size)
    if (!win) {
      hide('no-anchor')
      return
    }
    applyBounds(win)
    if (!reshow) return
    d.window.showInactive()
    d.window.raise()
    visible = true
    d.window.shown(mySeq)
    d.log('flyout.show', { kind: c.kind, seq: mySeq, bounds: win.window })
  }

  function hide(reason: string): void {
    labelTimer = clearT(labelTimer)
    readyTimer = clearT(readyTimer)
    cardTimer = clearT(cardTimer)
    stopPoll()
    const c = content
    if (!c) return
    d.log('flyout.hide', { kind: c.kind, reason })
    if (c.kind === 'label') {
      chainTimer = clearT(chainTimer)
      chain = true
      chainTimer = d.timers.setTimeout(() => {
        chain = false
        chainTimer = null
      }, T.labelChainMs)
    }
    content = null
    pending = null
    visible = false
    pinned = false
    pointerInside = false
    d.window.hide()
    if (open) {
      open = false
      d.onOpenChange(false)
    }
  }

  function present(next: FlyoutContent, nextCtx: Ctx, reshow = true): void {
    readyTimer = clearT(readyTimer)
    seq += 1
    content = next
    ctx = nextCtx
    pending = { seq, reshow }
    edge = edgeFor(next)
    pad = flyoutWindowRect({ x: 0, y: 0, width: 0, height: 0 }, edge).pad
    const isOpen = next.kind !== 'label'
    if (isOpen && !open) {
      open = true
      d.onOpenChange(true)
    } else if (!isOpen && open) {
      open = false
      d.onOpenChange(false)
    }
    d.window.send({ seq, content: next, pad, edge })
    const fallback = !reshow && lastSize ? lastSize : next.kind === 'wiki-card' ? { width: next.width, height: FLYOUT_FALLBACK_SIZE['wiki-card'].height } : FLYOUT_FALLBACK_SIZE[next.kind]
    readyTimer = d.timers.setTimeout(() => {
      readyTimer = null
      finish(fallback, reshow)
    }, T.readyTimeoutMs)
  }

  function startPoll(): void {
    stopPoll()
    awayMs = 0
    pollTimer = d.timers.setInterval(() => {
      if (!content) return
      const cur = d.cursor()
      const bar = d.barAnchor(null)?.bar
      const inside = (bar !== undefined && inRect(cur, bar)) || inRect(cur, d.window.getBounds())
      if (!inside && d.mouseButtonDown() === true) {
        hide('outside-click')
        return
      }
      awayMs = inside ? 0 : awayMs + T.dismissPollMs
      if (awayMs >= T.menuAwayMs) hide('away')
    }, T.dismissPollMs)
  }

  function startCardTimer(): void {
    cardTimer = clearT(cardTimer)
    if (pinned || pointerInside || content?.kind !== 'wiki-card') return
    cardTimer = d.timers.setTimeout(() => {
      cardTimer = null
      hide('timeout')
    }, autoHideMs)
  }

  function replace(): void {
    if (!content || pending || !visible) return
    const win = windowFor(content, lastSize ?? FLYOUT_FALLBACK_SIZE[content.kind])
    if (!win) hide('no-anchor')
    else applyBounds(win)
  }

  return {
    hover(itemId) {
      labelTimer = clearT(labelTimer)
      if (content && content.kind !== 'label') return
      if (itemId === null) {
        if (content) hide('hover-end')
        return
      }
      const show = (): void => {
        labelTimer = null
        const text = d.labelFor(itemId)
        if (text !== null) present({ kind: 'label', text }, { itemId })
      }
      if (content || chain) show()
      else labelTimer = d.timers.setTimeout(show, T.labelDelayMs)
    },
    toggleMenu(menu, itemId, atY) {
      labelTimer = clearT(labelTimer)
      if (content?.kind === menu.kind) {
        hide('toggle')
        return
      }
      cardTimer = clearT(cardTimer)
      pinned = false
      pointerInside = false
      present(menu, { itemId, atY })
      startPoll()
    },
    showCard(view, o) {
      labelTimer = clearT(labelTimer)
      stopPoll()
      pinned = false
      pointerInside = false
      autoHideMs = o.autoHideMs
      present({ kind: 'wiki-card', view, pinned: false, width: o.width }, { itemId: 'glossary' })
      startCardTimer()
    },
    ready(s, size) {
      if (!pending || pending.seq !== s) return
      finish(size, pending.reshow)
    },
    pointer(inside) {
      pointerInside = inside
      if (content?.kind !== 'wiki-card') return
      if (inside) cardTimer = clearT(cardTimer)
      else startCardTimer()
    },
    pin(p) {
      if (content?.kind !== 'wiki-card') return
      pinned = p
      present({ ...content, pinned: p }, ctx, false)
      if (p) cardTimer = clearT(cardTimer)
      else startCardTimer()
    },
    close(reason) {
      hide(reason)
    },
    barHidden() {
      labelTimer = clearT(labelTimer)
      if (!content) return
      if (content.kind === 'wiki-card') replace()
      else hide('bar-hidden')
    },
    displaysChanged() {
      replace()
    },
    message() {
      return content ? { seq, content, pad, edge } : null
    },
    dispose() {
      hide('dispose')
      chainTimer = clearT(chainTimer)
      chain = false
    }
  }
}
