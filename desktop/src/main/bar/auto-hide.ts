import type { Timers } from '../timers'

/** collapseDelayMs(바를 떠난 뒤 들어가기까지 1초)는 설계에 없는 값이다. Task 13에서 decisions.md에 기록한다. */
export const AUTO_HIDE_TIMING = { revealMs: 300, collapseDelayMs: 1000, slideMs: 300 } as const

export type AutoHideState = 'expanded' | 'collapsing' | 'collapsed' | 'expanding'

type Deps = {
  timers: Timers
  setCollapsedBounds(collapsed: boolean): void
  setCollapsedView(collapsed: boolean): void
}

export function createAutoHide(d: Deps) {
  let enabled = false
  let inside = false // 처음 켤 때 커서는 바깥으로 간주한다
  let hold = false
  let state: AutoHideState = 'expanded'
  let viewCollapsed = false
  let boundsCollapsed = false
  let timer: unknown = null

  const clear = (): void => {
    if (timer !== null) d.timers.clearTimeout(timer)
    timer = null
  }
  const later = (fn: () => void, ms: number): void => {
    clear()
    timer = d.timers.setTimeout(() => {
      timer = null
      fn()
    }, ms)
  }
  const view = (c: boolean): void => {
    viewCollapsed = c
    d.setCollapsedView(c)
  }
  const bounds = (c: boolean): void => {
    boundsCollapsed = c
    d.setCollapsedBounds(c)
  }

  function scheduleCollapse(): void {
    if (!enabled || inside || hold || state !== 'expanded') return
    later(() => {
      state = 'collapsing'
      view(true) // 화면이 먼저 미끄러져 들어간 뒤 창을 줄인다
      later(() => {
        bounds(true)
        state = 'collapsed'
      }, AUTO_HIDE_TIMING.slideMs)
    }, AUTO_HIDE_TIMING.collapseDelayMs)
  }

  function expandNow(): void {
    // 들어가는 중이었으면 창은 아직 줄지 않았다
    clear()
    state = 'expanded'
    if (viewCollapsed) view(false)
  }

  function reveal(): void {
    later(() => {
      state = 'expanding'
      bounds(false) // 창을 먼저 키운 뒤 화면이 미끄러져 나온다
      view(false)
      later(() => {
        state = 'expanded'
        scheduleCollapse()
      }, AUTO_HIDE_TIMING.slideMs)
    }, AUTO_HIDE_TIMING.revealMs)
  }

  /** 커서가 올라가 있거나 펼침 창이 열려 있어 접으면 안 되는 때 */
  function onKeepOpen(): void {
    if (!enabled) return
    if (state === 'collapsing') expandNow()
    else if (state === 'expanded') clear()
  }

  return {
    setEnabled(on: boolean): void {
      if (on === enabled) return
      enabled = on
      clear()
      if (on) {
        state = 'expanded'
        scheduleCollapse()
        return
      }
      if (boundsCollapsed) bounds(false)
      if (viewCollapsed) view(false)
      state = 'expanded'
    },
    pointer(isInside: boolean): void {
      inside = isInside
      if (!enabled) return
      if (isInside) {
        if (state === 'collapsed') reveal()
        else onKeepOpen()
      } else if (state === 'collapsed') {
        clear() // 300ms 못 채우고 떠남
      } else {
        scheduleCollapse()
      }
    },
    holdOpen(on: boolean): void {
      hold = on
      if (!enabled) return
      if (on) onKeepOpen()
      else scheduleCollapse()
    },
    state: (): AutoHideState => state,
    dispose(): void {
      clear()
      enabled = false
    }
  }
}
