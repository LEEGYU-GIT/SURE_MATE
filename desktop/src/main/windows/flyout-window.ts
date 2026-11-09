import type { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { FLYOUT_FALLBACK_SIZE, type FlyoutWindowPort } from '../flyout/flyout-controller'
import { createFlyoutParker } from './flyout-park'
import { openOverlayWindow } from './overlay-window'

/**
 * 바 옆 펼침 창(#/flyout): 이름표·메뉴·위키 카드. 포커스를 받지 않고 클릭만 받는다(설계 §9·§14-1).
 * 내용이 바뀌어 띄울 때마다 컨트롤러가 raise로 맨 앞에 올린다.
 * 숨길 때는 hide()하지 않고 화면 밖으로 옮긴다(까닭은 flyout-park.ts). visible()은 '내용을 보이는 중'이다.
 */
export function createFlyoutWindow(): { win: BrowserWindow; port: FlyoutWindowPort; hwnd: string; visible(): boolean; raise(): void } {
  const w = openOverlayWindow('/flyout', FLYOUT_FALLBACK_SIZE['masking-menu'])
  const parker = createFlyoutParker({
    getBounds: w.getBounds,
    setBounds: w.setBounds,
    setIgnoreMouseEvents: (ignore) => {
      if (!w.win.isDestroyed()) w.win.setIgnoreMouseEvents(ignore)
    },
    isVisible: w.visible,
    showInactive: w.showInactive
  })
  w.win.on('move', () => {
    if (!w.win.isDestroyed()) parker.onMove()
  })
  w.win.on('closed', parker.dispose)
  return {
    win: w.win,
    hwnd: w.hwnd,
    visible: () => w.visible() && !parker.isParked(),
    raise: w.raise,
    port: {
      setBounds: parker.setBounds,
      getBounds: w.getBounds,
      showInactive: parker.showInactive,
      hide: () => {
        w.send(IPC.flyoutHidden)
        parker.hide()
      },
      raise: w.raise,
      send: (m) => w.send(IPC.flyoutContent, m),
      shown: (seq) => w.send(IPC.flyoutShown, seq)
    }
  }
}
