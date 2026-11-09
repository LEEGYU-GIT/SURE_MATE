import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import type { BrowserWindow } from 'electron'
import { raiseTopmost } from '../native/windows'
import { nativeStatus } from '../native/win32'

export { overlayWindowOptions } from './overlay-options'

/** 창마다 같은 renderer 번들을 불러오고 # 경로로 화면을 고른다 */
export function loadRoute(win: BrowserWindow, hash: '' | '/bar' | '/flyout' | '/ime-logger'): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${hash ? `#${hash}` : ''}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

/**
 * 위치·크기를 건드리지 않고 맨 앞으로 올린다(SetWindowPos HWND_TOPMOST). Win32를 쓸 수 없으면 moveTop 뒤
 * 위치가 바뀌었으면 되돌린다(moveTop이 배율이 다른 화면에서 위치를 지키는지 확인되지 않음).
 */
export function raiseOverlay(win: BrowserWindow, hwnd: string): void {
  if (win.isDestroyed() || !win.isVisible()) return
  if (nativeStatus().ok && raiseTopmost(hwnd)) return
  const before = win.getBounds()
  win.moveTop()
  const after = win.getBounds()
  if (before.x !== after.x || before.y !== after.y || before.width !== after.width || before.height !== after.height) win.setBounds(before)
}
