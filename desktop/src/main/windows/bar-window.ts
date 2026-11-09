import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { Rect } from '../../shared/types'
import type { BarWindowPort } from '../bar/bar-controller'
import { loadRoute, overlayWindowOptions } from './overlay-window'

const toInt = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })

/** Sure-Mate 바 창(설계 문서 §14-1). 포커스를 받지 않고 맨 앞(screen-saver 수준)에 뜬다 */
export function createBarWindow(): { win: BrowserWindow; port: BarWindowPort; hwnd: string } {
  const win = new BrowserWindow({ ...overlayWindowOptions(join(__dirname, '../preload/index.js')), width: 56, height: 456 })
  win.setAlwaysOnTop(true, 'screen-saver')
  const hwnd = win.getNativeWindowHandle().readBigUInt64LE(0).toString()
  loadRoute(win, '/bar')
  const port: BarWindowPort = {
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
    send: (state) => {
      if (!win.isDestroyed()) win.webContents.send(IPC.barState, state)
    }
  }
  return { win, port, hwnd }
}
