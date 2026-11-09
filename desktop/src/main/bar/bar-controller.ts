import { buildBarItems, type BarItem, type BarViewState } from '../../shared/bar/bar-items'
import { BAR_METRICS, DEFAULT_BAR_RATIO, barRect, barSize, dragTop, fitBarItems, handleRect, itemOffsets, pickBarDisplay, ratioFromTop } from '../../shared/bar/bar-layout'
import type { BarEdge, BarSettings } from '../../shared/bar/bar-settings'
import { needsResize } from '../../shared/palette-rules'
import type { Template } from '../../shared/template/types'
import type { MaskingMode, MonitorInfo, Rect } from '../../shared/types'
import type { Timers } from '../timers'
import { createAutoHide } from './auto-hide'
import { createTopmostKeeper } from './topmost-keeper'

export const SNOOZE_MS = 30 * 60 * 1000
export const DISPLAY_SETTLE_MS = 200
export const DRAG_THRESHOLD = 4
const BOUNDS_TOLERANCE = 2

export interface BarInputs {
  bar: BarSettings
  maskingMode: MaskingMode
  petVisible: boolean
  paletteHotkey: string | null
  templates: Pick<Template, 'id' | 'name' | 'kind'>[]
}

export interface BarWindowPort {
  setBounds(r: Rect): void
  getBounds(): Rect
  showInactive(): void
  hide(): void
  send(state: BarViewState): void
}

export interface BarAnchor {
  bar: Rect
  item: Rect | null
  edge: BarEdge
  workArea: Rect
}

export interface BarController {
  start(): void
  refresh(): void
  displaysChanged(): void
  setFullscreen(on: boolean): void
  snooze(): void
  unsnooze(): void
  snoozed(): boolean
  pointer(inside: boolean): void
  holdOpen(hold: boolean): void
  drag(phase: 'start' | 'move' | 'end', screenY: number): void
  setBusy(itemId: string | null): void
  state(): BarViewState
  visible(): boolean
  hasItem(id: string): boolean
  anchor(itemId: string | null): BarAnchor | null
  dispose(): void
}

type Deps = {
  window: BarWindowPort
  displays(): MonitorInfo[]
  inputs(): BarInputs
  savePosition(display: string, ratio: number): Promise<void>
  raise(): void
  onVisibleChange(visible: boolean): void
  timers: Timers
  log(event: string, data: Record<string, unknown>): void
}

type Layout = {
  display: MonitorInfo
  shape: 'edge' | 'capsule'
  edge: BarEdge
  items: BarItem[]
  /** 펼친 바 사각형 */
  bar: Rect
}

type Reason = 'shape' | 'snooze' | 'fullscreen' | 'no-display'

const sameRect = (a: Rect, b: Rect): boolean => Math.abs(a.x - b.x) <= BOUNDS_TOLERANCE && Math.abs(a.y - b.y) <= BOUNDS_TOLERANCE && !needsResize(a, b, BOUNDS_TOLERANCE)

export function createBarController(d: Deps): BarController {
  let isVisible = false
  let fullscreen = false
  let snoozedFlag = false
  let snoozeTimer: unknown = null
  let settleTimer: unknown = null
  let busyItem: string | null = null
  let viewCollapsed = false
  let boundsCollapsed = false
  let lastInside = false
  let lastHold = false
  let placeKey: string | null = null
  let stateKey: string | null = null
  /** 끌어서 놓은 위치. 저장이 입력에 나타날 때까지 입력보다 우선한다 */
  let memo: { display: string; ratio: number } | null = null
  let dragging: { startY: number; startTop: number; active: boolean } | null = null

  const keeper = createTopmostKeeper({ raise: d.raise, timers: d.timers })
  const autoHide = createAutoHide({
    timers: d.timers,
    setCollapsedBounds(c) {
      boundsCollapsed = c
      if (isVisible) placeWindow(false)
    },
    setCollapsedView(c) {
      viewCollapsed = c
      if (isVisible) sendState()
    }
  })

  function layout(): Layout | null {
    const inp = d.inputs()
    const display = pickBarDisplay(d.displays(), inp.bar.monitor)
    if (!display || inp.bar.shape === 'off') return null
    const shape = inp.bar.shape
    const wa = display.workArea
    const all = buildBarItems({ pinned: inp.bar.pinnedPrompts, templates: inp.templates, maskingMode: inp.maskingMode, petVisible: inp.petVisible, paletteHotkey: inp.paletteHotkey })
    // 프롬프트가 없어져도 작업 영역보다 크면 barRect가 위 여백에 붙인다. 더 줄이지 않는다.
    const items = fitBarItems(all, shape, wa.height - 2 * BAR_METRICS.screenMargin)
    const saved = inp.bar.positions.find((p) => p.display === display.id)?.ratio
    const ratio = memo && memo.display === display.id ? memo.ratio : (saved ?? DEFAULT_BAR_RATIO)
    const bar = barRect({ workArea: wa, shape, edge: inp.bar.edge, size: barSize(items, shape), ratio })
    return { display, shape, edge: inp.bar.edge, items, bar }
  }

  function desired(): { visible: boolean; reason: Reason | null } {
    const inp = d.inputs()
    if (inp.bar.shape === 'off') return { visible: false, reason: 'shape' }
    if (snoozedFlag) return { visible: false, reason: 'snooze' }
    if (fullscreen) return { visible: false, reason: 'fullscreen' }
    if (d.displays().length === 0) return { visible: false, reason: 'no-display' }
    return { visible: true, reason: null }
  }

  function viewState(l: Layout | null): BarViewState {
    const inp = d.inputs()
    return {
      shape: l?.shape ?? 'edge',
      edge: inp.bar.edge,
      items: l?.items ?? [],
      opacity: inp.bar.opacity,
      collapsed: viewCollapsed,
      busyItem
    }
  }

  function applyBounds(target: Rect): Rect {
    d.window.setBounds(target)
    let actual = d.window.getBounds()
    if (!sameRect(actual, target)) {
      // 배율이 다른 모니터로 옮기면 크기가 어긋난다(electron#27651). 같은 사각형으로 한 번 더 놓는다.
      d.window.setBounds(target)
      actual = d.window.getBounds()
      if (!sameRect(actual, target)) d.log('bar.place.mismatch', { expected: target, actual })
    }
    return actual
  }

  function placeWindow(log: boolean): void {
    const l = layout()
    if (!l) return
    const target = boundsCollapsed ? handleRect(l.bar, l.edge, l.display.workArea) : l.bar
    const key = JSON.stringify([l.display.id, l.display.workArea, l.display.scaleFactor, l.shape, l.edge, target])
    if (key === placeKey) return
    placeKey = key
    const actual = applyBounds(target)
    if (log) d.log('bar.place', { display: l.display.id, scale: l.display.scaleFactor, shape: l.shape, edge: l.edge, bounds: actual, items: l.items.length })
  }

  function sendState(): void {
    const s = viewState(layout())
    const key = JSON.stringify(s)
    if (key === stateKey) return
    stateKey = key
    d.window.send(s)
  }

  function evaluate(force: boolean): void {
    const want = desired()
    if (force) {
      placeKey = null
      stateKey = null
    }
    if (want.visible && !isVisible) {
      isVisible = true
      placeKey = null
      stateKey = null
      viewCollapsed = false
      boundsCollapsed = false
      placeWindow(true)
      sendState()
      d.window.showInactive()
      keeper.setVisible(true)
      autoHide.setEnabled(d.inputs().bar.autoHide)
      d.log('bar.visibility', { visible: true, reason: null })
      d.onVisibleChange(true)
      return
    }
    if (!want.visible && isVisible) {
      isVisible = false
      // 끌던 중이면 저장되지 않은 위치를 버린다
      if (dragging?.active) memo = null
      dragging = null
      // 숨긴 사이 커서 상태를 잊어야 다시 나왔을 때 접힌다
      lastInside = false
      lastHold = false
      autoHide.pointer(false)
      autoHide.holdOpen(false)
      autoHide.setEnabled(false)
      keeper.setVisible(false)
      viewCollapsed = false
      boundsCollapsed = false
      d.window.hide()
      d.log('bar.visibility', { visible: false, reason: want.reason })
      d.onVisibleChange(false)
      return
    }
    if (!isVisible) return
    autoHide.setEnabled(d.inputs().bar.autoHide)
    placeWindow(true)
    sendState()
  }

  function syncMemo(): void {
    if (!memo || dragging?.active) return
    const m = memo
    const saved = d.inputs().bar.positions.find((p) => p.display === m.display)
    if (saved && Math.abs(saved.ratio - m.ratio) < 1e-9) memo = null
  }

  function startSnoozeTimer(): void {
    if (snoozeTimer !== null) d.timers.clearTimeout(snoozeTimer)
    snoozeTimer = d.timers.setTimeout(() => {
      snoozeTimer = null
      snoozedFlag = false
      evaluate(false)
    }, SNOOZE_MS)
  }

  return {
    start: () => evaluate(true),
    refresh() {
      syncMemo()
      evaluate(false)
    },
    displaysChanged() {
      if (settleTimer !== null) d.timers.clearTimeout(settleTimer)
      settleTimer = d.timers.setTimeout(() => {
        settleTimer = null
        evaluate(true)
      }, DISPLAY_SETTLE_MS)
    },
    setFullscreen(on) {
      if (on === fullscreen) return
      fullscreen = on
      evaluate(false)
    },
    snooze() {
      snoozedFlag = true
      startSnoozeTimer()
      evaluate(false)
    },
    unsnooze() {
      if (snoozeTimer !== null) d.timers.clearTimeout(snoozeTimer)
      snoozeTimer = null
      snoozedFlag = false
      evaluate(false)
    },
    snoozed: () => snoozedFlag,
    pointer(inside) {
      // 가장자리만 넘긴다. 매번 넘기면 손잡이의 300ms 타이머가 계속 다시 시작된다.
      if (inside === lastInside) return
      lastInside = inside
      autoHide.pointer(inside)
    },
    holdOpen(hold) {
      if (hold === lastHold) return
      lastHold = hold
      autoHide.holdOpen(hold)
    },
    drag(phase, screenY) {
      if (phase === 'start') {
        const l = isVisible && !boundsCollapsed ? layout() : null
        dragging = l ? { startY: screenY, startTop: l.bar.y, active: false } : null
        return
      }
      const g = dragging
      if (!g || !isVisible || boundsCollapsed) return
      const l = layout()
      if (!l) return
      if (phase === 'move') {
        if (!g.active && Math.abs(screenY - g.startY) <= DRAG_THRESHOLD) return
        g.active = true
        const top = dragTop({ startTop: g.startTop, startY: g.startY, y: screenY, height: l.bar.height, workArea: l.display.workArea })
        memo = { display: l.display.id, ratio: ratioFromTop(top, l.bar.height, l.display.workArea) }
        placeWindow(false)
        return
      }
      dragging = null
      if (!g.active || !memo) return
      const { display, ratio } = memo
      placeKey = null
      placeWindow(true)
      d.savePosition(display, ratio).catch((e: unknown) => d.log('bar.position.save-failed', { error: e instanceof Error ? e.message : String(e) }))
    },
    setBusy(itemId) {
      busyItem = itemId
      if (isVisible) sendState()
    },
    state: () => viewState(layout()),
    visible: () => isVisible,
    hasItem: (id) => (layout()?.items ?? []).some((i) => i.kind !== 'separator' && i.id === id),
    anchor(itemId) {
      if (!isVisible) return null
      const l = layout()
      if (!l) return null
      let item: Rect | null = null
      if (itemId !== null) {
        const o = itemOffsets(l.items, l.shape).find((x) => x.id === itemId)
        if (o) item = { x: l.bar.x, y: l.bar.y + o.top, width: l.bar.width, height: o.height }
      }
      return { bar: l.bar, item, edge: l.edge, workArea: l.display.workArea }
    },
    dispose() {
      if (snoozeTimer !== null) d.timers.clearTimeout(snoozeTimer)
      if (settleTimer !== null) d.timers.clearTimeout(settleTimer)
      snoozeTimer = settleTimer = null
      autoHide.dispose()
      keeper.stop()
    }
  }
}
