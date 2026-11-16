import { screen, type BrowserWindow } from 'electron'
import type { BarItem } from '../../shared/bar/bar-items'
import type { BarShape } from '../../shared/bar/bar-settings'
import type { ShownPayload } from '../../shared/ipc-channels'
import type { MaskingMode } from '../../shared/types'
import { FLYOUT_MAX_HEIGHT, type FlyoutAction, type MenuContent } from '../../shared/flyout/flyout-content'
import { createFlyoutController, type FlyoutController } from '../flyout/flyout-controller'
import { cardMaxHeight } from '../flyout/flyout-placement'
import type { OverlayIpc } from '../ipc'
import { getMonitors } from '../native/coords'
import { mouseButtonDown as readMouseButtons } from '../native/input'
import { nativeStatus } from '../native/win32'
import { notificationState } from '../native/windows'
import { realTimers } from '../timers'
import { createBarWindow } from '../windows/bar-window'
import { createFlyoutWindow } from '../windows/flyout-window'
import { createBarActions, createFlyoutActions } from './bar-actions'
import { createBarController, type BarController, type BarInputs } from './bar-controller'
import { createFullscreenWatch } from './fullscreen-watch'
import { fullscreenInOrder, linkBarPort, raiseInOrder, safely } from './pet-link'

export interface BarRuntimeOptions {
  /** 바가 그릴 입력(설정·템플릿·단축키). 부를 때마다 지금 값을 돌려준다 */
  inputs(): BarInputs
  /** 끌어 놓은 세로 위치를 그 모니터 것으로 저장한다 */
  savePosition(display: string, ratio: number): Promise<void>
  /** 바가 보이거나 숨었다(트레이 갱신) */
  onVisibleChange(visible: boolean): void
  togglePalette(): void
  showPalette(p: ShownPayload): void
  /** 고정 프롬프트 실행(PromptSession.runFromBar). 실패하면 거부한다 */
  runPrompt(templateId: string): Promise<unknown>
  togglePet(): Promise<void>
  openSettings(): Promise<void>
  /** 가명 처리 기본값 저장 → 트레이·바 갱신 */
  setMaskingMode(mode: MaskingMode): Promise<void>
  /** 바 모양 저장 → 트레이·바 갱신 */
  saveBarShape(shape: BarShape): Promise<void>
  /** 위키 카드 [설명 복사]: 설명만 클립보드에(GlossaryRuntime.copyForCard). 용어가 없어졌으면 false */
  copyWiki(id: string): Promise<boolean>
  /** 위키 카드 [클립보드 글로 찾기](WikiCard.lookupClipboard) */
  lookupClipboard(): Promise<void>
  /**
   * 워크스페이스 메뉴의 내용(파일 캐시를 읽는다). maxHeight는 바가 있는 모니터에서 카드가 쓸 수 있는 높이(DIP):
   * 메뉴는 스크롤하지 않으므로 그 높이에 들어가는 행만 보인다
   */
  workspaceMenu(maxHeight: number): Promise<Extract<MenuContent, { kind: 'workspace-menu' }>>
  /** 워크스페이스 메뉴 행 동작(불러오기·저장·모두 보기). 메뉴는 이미 닫혀 있고, 펼침 창은 끝나기를 기다리지 않는다 */
  onWorkspaceAction(a: Extract<FlyoutAction, { type: 'workspace-run' | 'workspace-save' | 'workspace-edit' }>): Promise<boolean>
  notify(message: string): void
  log(event: string, data: Record<string, unknown>): void
  /**
   * 말랑 메이트(M6): 전체 화면 앱 시작(true)·끝(false). 켜질 때는 바를 숨기기 전에, 꺼질 때는 바를 다시 보인 뒤에 부른다
   * (펫이 바와 함께 숨었다 돌아와도 앉은 자리를 지킨다)
   */
  onFullscreen(on: boolean): void
  /** 말랑 메이트: 바·(보이면) 펼침 창을 맨 앞으로 올린 바로 뒤(펫을 그 앞에 올린다, 설계 §14-2 "펫은 늘 바보다 앞") */
  afterRaise(): void
  /** 말랑 메이트: 바 창을 놓거나 보이거나 숨기거나 바 화면이 바뀐 뒤(끌기·자동 숨김·모양·잠시 숨김). 펫 세계가 바뀐다 */
  onBarChange(): void
}

export interface BarRuntime extends OverlayIpc {
  bar: BarController
  flyout: FlyoutController
  /** 지금 전체 화면 앱이 앞에 있는지(전체 화면 감시가 마지막으로 읽은 값, 감시를 못 하면 false). 펫이 시작할 때 읽는다 */
  fullscreen(): boolean
  /** 설정·템플릿이 바뀐 뒤 바를 다시 그린다 */
  refresh(): void
  /** 타이머·화면 이벤트·전체 화면 감시를 멈추고 창을 닫는다 */
  dispose(): void
}

const labelOf = (items: BarItem[], id: string): string | null => {
  for (const item of items) if (item.kind !== 'separator' && item.id === id) return item.label
  return null
}

const destroyWindow = (win: BrowserWindow): void => {
  if (!win.isDestroyed()) win.destroy()
}

/**
 * Sure-Mate 바와 펼침 창을 만들고 컨트롤러·전체 화면 감시·화면 이벤트·단추 동작을 잇는다(설계 §14-1, §9).
 * 판단은 모두 컨트롤러(순수)에 있고 여기는 연결만 한다. 만드는 중 실패하면 만든 것을 정리하고 던진다(팔레트·트레이는 그대로).
 */
export function createBarRuntime(o: BarRuntimeOptions): BarRuntime {
  const undo: (() => void)[] = []
  /** 만든 순서의 반대로 정리한다. 하나가 실패해도 나머지는 정리한다 */
  const teardown = (): void => {
    while (undo.length > 0) {
      try {
        undo.pop()?.()
      } catch {
        // 앱을 끝내는 중이면 창이 이미 닫혔다
      }
    }
  }

  try {
    const barWin = createBarWindow()
    undo.push(() => destroyWindow(barWin.win))
    const flyoutWin = createFlyoutWindow()
    undo.push(() => destroyWindow(flyoutWin.win))

    /** 마우스가 올라가 있는 바 항목(이름표를 다시 그릴 때 쓴다) */
    let hovered: string | null = null
    const labelFor = (id: string): string | null => labelOf(bar.state().items, id)

    const bar: BarController = createBarController({
      // 바 창을 놓거나 보이거나 숨긴 뒤 펫 세계가 바뀌었다고 알린다(펫 런타임이 34ms에 한 번 이하로 묶는다)
      window: linkBarPort(barWin.port, () => o.onBarChange()),
      displays: getMonitors,
      inputs: o.inputs,
      savePosition: o.savePosition,
      // 바 → (보이면) 펼침 창 → 펫 순서로 맨 앞에 올린다(2초마다·바가 보일 때)
      raise: raiseInOrder({ bar: () => barWin.raise(), flyout: flyoutWin, after: () => o.afterRaise() }),
      onVisibleChange: (visible) => {
        if (!visible) flyout.barHidden()
        o.onVisibleChange(visible)
      },
      timers: realTimers,
      log: o.log
    })
    undo.push(() => bar.dispose())

    const flyout: FlyoutController = createFlyoutController({
      // 펼침 창이 내용을 띄우며 스스로 올라오면 펫을 다시 그 앞에 올린다(맨 앞 순서가 2초마다 뒤바뀌지 않게)
      window: {
        ...flyoutWin.port,
        raise: () => {
          flyoutWin.port.raise()
          safely(() => o.afterRaise())
        }
      },
      barAnchor: (id) => bar.anchor(id),
      barEdge: () => o.inputs().bar.edge,
      cursorWorkArea: () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,
      cursor: () => screen.getCursorScreenPoint(),
      // Win32를 못 쓰면 null(바깥 클릭 닫기만 빠지고 커서가 1.5초 밖에 있으면 닫힌다)
      mouseButtonDown: () => {
        try {
          return readMouseButtons()
        } catch {
          return null
        }
      },
      labelFor,
      // 메뉴·카드가 열린 동안은 자동 숨김으로 바가 들어가지 않는다
      onOpenChange: (open) => bar.holdOpen(open),
      timers: realTimers,
      log: o.log
    })
    undo.push(() => flyout.dispose())

    const actions = createBarActions({
      isKnown: (id) => bar.hasItem(id),
      togglePalette: o.togglePalette,
      openPalette: o.showPalette,
      // 워크스페이스 메뉴는 저장 파일 캐시를 읽어 만든다(비동기). 바가 있는 모니터에서 카드가 쓸 수 있는 높이에 들어가는 행만(13b)
      toggleMenu: async (kind, itemId) => {
        if (kind === 'masking-menu') return flyout.toggleMenu({ kind, mode: o.inputs().maskingMode }, itemId)
        const workArea = bar.anchor(itemId)?.workArea
        flyout.toggleMenu(await o.workspaceMenu(workArea ? cardMaxHeight(workArea) : FLYOUT_MAX_HEIGHT), itemId)
      },
      runPrompt: o.runPrompt,
      setBusy: (id) => bar.setBusy(id),
      togglePet: o.togglePet,
      openSettings: o.openSettings,
      notify: o.notify,
      log: o.log
    })
    const menuActions = createFlyoutActions({
      setMaskingMode: o.setMaskingMode,
      saveBarShape: o.saveBarShape,
      unsnoozeBar: () => bar.unsnooze(),
      snoozeBar: () => bar.snooze(),
      openSettings: o.openSettings,
      close: (reason) => flyout.close(reason),
      copyWiki: o.copyWiki,
      pinCard: (pinned) => flyout.pin(pinned),
      openPalette: o.showPalette,
      lookupClipboard: o.lookupClipboard,
      workspaceAction: o.onWorkspaceAction,
      notify: o.notify,
      log: o.log
    })

    // 켜질 때는 펫이 먼저 숨고, 꺼질 때는 바가 나온 다음 펫이 나온다(Review Focus 2)
    const watch = createFullscreenWatch({
      query: notificationState,
      onChange: fullscreenInOrder({ bar: (on) => bar.setFullscreen(on), pet: (on) => o.onFullscreen(on) }),
      timers: realTimers,
      log: o.log
    })
    undo.push(() => watch.stop())

    // 모니터 연결·배율이 바뀌면 바를 다시 놓고(200ms 기다려 한 번) 보이는 카드도 다시 놓는다
    const onDisplays = (): void => {
      bar.displaysChanged()
      flyout.displaysChanged()
    }
    screen.on('display-added', onDisplays)
    screen.on('display-removed', onDisplays)
    screen.on('display-metrics-changed', onDisplays)
    undo.push(() => {
      screen.removeListener('display-added', onDisplays)
      screen.removeListener('display-removed', onDisplays)
      screen.removeListener('display-metrics-changed', onDisplays)
    })

    bar.start()
    // 전체 화면 숨김은 Win32를 쓸 수 있을 때만. 못 쓰면 바는 늘 보이고 이 기능만 빠진다
    if (nativeStatus().ok) watch.start()

    return {
      bar,
      flyout,
      fullscreen: () => watch.current(),
      barContentsId: barWin.win.webContents.id,
      flyoutContentsId: flyoutWin.win.webContents.id,
      barState: () => bar.state(),
      barAction: (id, how) => actions.run(id, how),
      barHover(id) {
        // 바에 없는 항목 id는 무시한다(renderer는 믿지 않는다)
        if (id !== null && !bar.hasItem(id)) return
        hovered = id
        flyout.hover(id)
      },
      barPointer: (inside) => bar.pointer(inside),
      barContextMenu(y) {
        const a = bar.anchor(null)
        // 손잡이만 남은 동안(자동 숨김)은 열지 않는다. 손잡이는 바를 꺼내는 곳이다
        if (!a || bar.state().collapsed) return
        flyout.toggleMenu({ kind: 'bar-menu', shape: o.inputs().bar.shape }, null, a.bar.y + Math.min(y, a.bar.height))
      },
      barDrag(phase, screenY) {
        if (phase === 'start') {
          // 끌기 시작: 이름표(기다리는 것 포함)와 메뉴를 닫는다. 위키 카드는 둔다
          flyout.hover(null)
          const kind = flyout.message()?.content.kind
          if (kind === 'masking-menu' || kind === 'workspace-menu' || kind === 'bar-menu') flyout.close('drag')
        }
        bar.drag(phase, screenY)
        // 놓은 뒤 보이는 카드를 새 바 자리 옆으로
        if (phase === 'end') flyout.displaysChanged()
      },
      flyoutMessage: () => flyout.message(),
      flyoutReady: (seq, size) => flyout.ready(seq, size),
      flyoutPointer: (inside) => flyout.pointer(inside),
      flyoutAction: (a) => menuActions.run(a),
      refresh() {
        bar.refresh()
        // 모양·가장자리가 바뀌었으면 보이는 펼침 창을 새 바 옆으로(보이는 것이 없으면 아무것도 하지 않는다)
        flyout.displaysChanged()
        // 마우스를 올린 채 누른 단추(펫 보이기·숨기기 등)의 이름표를 바뀐 글로 다시 띄운다
        const m = flyout.message()
        if (hovered !== null && m?.content.kind === 'label') {
          const text = labelFor(hovered)
          if (text !== null && text !== m.content.text) flyout.hover(hovered)
        }
      },
      dispose: teardown
    }
  } catch (e) {
    teardown()
    throw e
  }
}
