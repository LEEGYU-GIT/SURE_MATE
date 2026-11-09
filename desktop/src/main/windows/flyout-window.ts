import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { Rect } from '../../shared/types'
import type { FlyoutWindowPort } from '../flyout/flyout-controller'
import { loadRoute, overlayWindowOptions, raiseOverlay } from './overlay-window'

const toInt = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })

/** 바 옆 펼침 창(이름표·메뉴·위키 카드, 설계 문서 §9·§14-1). 클릭만 받고 키보드 입력은 받지 않는다 */
export function createFlyoutWindow(): { win: BrowserWindow; port: FlyoutWindowPort; hwnd: string } {
  const win = new BrowserWindow({ ...overlayWindowOptions(join(__dirname, '../preload/index.js')), width: 360, height: 200 })
  win.setAlwaysOnTop(true, 'screen-saver')
  const hwnd = win.getNativeWindowHandle().readBigUInt64LE(0).toString()
  loadRoute(win, '/flyout')
  const port: FlyoutWindowPort = {
    setBounds: (r) => {
      if (!win.isDestroyed()) win.setBounds(toInt(r))
    },
    getBounds: () => win.getBounds(),
    showInactive: () => {
      if (!win.isDestroyed()) win.showInactive()
    },
    hide: () => {
      if (!win.isDestroyed()) win.hide()
    },
    // 내용이 바뀌면 맨 앞으로(§9)
    raise: () => raiseOverlay(win, hwnd),
    send: (m) => {
      if (!win.isDestroyed()) win.webContents.send(IPC.flyoutContent, m)
    },
    shown: (seq) => {
      if (!win.isDestroyed()) win.webContents.send(IPC.flyoutShown, seq)
    }
  }
  return { win, port, hwnd }
}
