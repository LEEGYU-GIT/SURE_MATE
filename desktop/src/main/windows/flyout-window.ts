import type { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { FLYOUT_FALLBACK_SIZE, type FlyoutWindowPort } from '../flyout/flyout-controller'
import { openOverlayWindow } from './overlay-window'

/**
 * 바 옆 펼침 창(#/flyout): 이름표·메뉴·위키 카드. 포커스를 받지 않고 클릭만 받는다(설계 §9·§14-1).
 * 내용이 바뀌어 띄울 때마다 컨트롤러가 raise로 맨 앞에 올린다.
 */
export function createFlyoutWindow(): { win: BrowserWindow; port: FlyoutWindowPort; hwnd: string; visible(): boolean; raise(): void } {
  const w = openOverlayWindow('/flyout', FLYOUT_FALLBACK_SIZE['masking-menu'])
  return {
    win: w.win,
    hwnd: w.hwnd,
    visible: w.visible,
    raise: w.raise,
    port: {
      setBounds: w.setBounds,
      getBounds: w.getBounds,
      showInactive: w.showInactive,
      hide: w.hide,
      raise: w.raise,
      send: (m) => w.send(IPC.flyoutContent, m),
      shown: (seq) => w.send(IPC.flyoutShown, seq)
    }
  }
}
