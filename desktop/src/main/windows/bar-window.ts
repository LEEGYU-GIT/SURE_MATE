import type { BrowserWindow } from 'electron'
import { BAR_METRICS } from '../../shared/bar/bar-layout'
import { IPC } from '../../shared/ipc-channels'
import type { BarWindowPort } from '../bar/bar-controller'
import { openOverlayWindow } from './overlay-window'

/**
 * Sure-Mate 바 창(#/bar). 포커스를 받지 않는 투명 창이라 눌러도 쓰던 앱의 선택이 남는다(설계 §14-1).
 * 자리·크기·보이기는 바 컨트롤러가 정한다. raise는 맨 앞 유지(2초마다)가 부른다.
 */
export function createBarWindow(): { win: BrowserWindow; port: BarWindowPort; hwnd: string; raise(): void } {
  // 처음 크기는 아무 값이나 괜찮다(보이기 전에 컨트롤러가 놓는다). 숨긴 큰 투명 창을 두지 않으려고 작게
  const w = openOverlayWindow('/bar', { width: BAR_METRICS.edge.width, height: 2 * BAR_METRICS.edge.cell })
  return {
    win: w.win,
    hwnd: w.hwnd,
    raise: w.raise,
    port: {
      setBounds: w.setBounds,
      getBounds: w.getBounds,
      showInactive: w.showInactive,
      hide: w.hide,
      send: (state) => w.send(IPC.barState, state)
    }
  }
}
