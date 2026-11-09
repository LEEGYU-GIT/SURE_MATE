import { screen } from 'electron'
import { errorText } from '../error-text'
import { createFlyoutController, type FlyoutController } from '../flyout/flyout-controller'
import { mouseButtonDown } from '../native/input'
import { getMonitors } from '../native/coords'
import { notificationState } from '../native/windows'
import { nativeStatus } from '../native/win32'
import { realTimers } from '../timers'
import { createBarWindow } from '../windows/bar-window'
import { createFlyoutWindow } from '../windows/flyout-window'
import { raiseOverlay } from '../windows/overlay-window'
import { createBarController, type BarController, type BarInputs } from './bar-controller'
import { createFullscreenWatch } from './fullscreen-watch'

export interface BarRuntime {
  bar: BarController
  flyout: FlyoutController
  /** 설정·템플릿이 바뀌면 바를 다시 그린다 */
  refresh(): void
  dispose(): void
}

/**
 * 바와 펼침 창을 만들고 컨트롤러·전체 화면 감시·모니터 변화를 잇는다(설계 문서 §14-1).
 * Win32를 쓸 수 없으면 전체 화면 숨김만 빠지고 바는 그대로 뜬다.
 */
export function createBarRuntime(o: {
  inputs(): BarInputs
  savePosition(display: string, ratio: number): Promise<void>
  /** 바가 보이거나 숨을 때(트레이의 잠시 숨김 표시 갱신) */
  onVisibleChange(visible: boolean): void
  log(event: string, data: Record<string, unknown>): void
}): BarRuntime {
  const barWin = createBarWindow()
  const flyoutWin = createFlyoutWindow()
  // 바 → 펼침 창 순서로 맨 앞에 올린다(M6이 펫 창을 이 순서 끝에 더한다)
  const raise = (): void => {
    raiseOverlay(barWin.win, barWin.hwnd)
    raiseOverlay(flyoutWin.win, flyoutWin.hwnd)
  }

  let flyout: FlyoutController | null = null
  const bar = createBarController({
    window: barWin.port,
    displays: getMonitors,
    inputs: o.inputs,
    savePosition: o.savePosition,
    raise,
    onVisibleChange: (visible) => {
      if (!visible) flyout?.barHidden()
      o.onVisibleChange(visible)
    },
    timers: realTimers,
    log: o.log
  })
  flyout = createFlyoutController({
    window: flyoutWin.port,
    barAnchor: (itemId) => bar.anchor(itemId),
    barEdge: () => bar.state().edge,
    cursorWorkArea: () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,
    cursor: () => screen.getCursorScreenPoint(),
    mouseButtonDown,
    labelFor: (itemId) => {
      const item = bar.state().items.find((i) => i.id === itemId)
      return item && 'label' in item ? item.label : null
    },
    // 메뉴·카드가 열려 있는 동안은 자동 숨김으로 들어가지 않는다
    onOpenChange: (open) => bar.holdOpen(open),
    timers: realTimers,
    log: o.log
  })

  // 전체 화면 앱(발표·영상·게임) 앞에서는 숨는다. Win32가 없으면 이것만 빠진다
  const fullscreen = nativeStatus().ok
    ? createFullscreenWatch({ query: notificationState, onChange: (on) => bar.setFullscreen(on), timers: realTimers, log: o.log })
    : null

  const displaysChanged = (): void => {
    bar.displaysChanged()
    flyout?.displaysChanged()
  }
  screen.on('display-added', displaysChanged)
  screen.on('display-removed', displaysChanged)
  screen.on('display-metrics-changed', displaysChanged)

  bar.start()
  fullscreen?.start()

  return {
    bar,
    flyout,
    refresh: () => bar.refresh(),
    dispose: () => {
      screen.removeListener('display-added', displaysChanged)
      screen.removeListener('display-removed', displaysChanged)
      screen.removeListener('display-metrics-changed', displaysChanged)
      fullscreen?.stop()
      try {
        flyout?.dispose()
        bar.dispose()
        if (!barWin.win.isDestroyed()) barWin.win.destroy()
        if (!flyoutWin.win.isDestroyed()) flyoutWin.win.destroy()
      } catch (e) {
        o.log('bar.dispose.error', { error: errorText(e) })
      }
    }
  }
}
