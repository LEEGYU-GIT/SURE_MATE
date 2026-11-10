import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { log } from '../log'
import { loadRoute } from './overlay-window'
import { settingsWindowOptions, type SettingsRoute } from './settings-window-options'

export type { SettingsRoute }

let win: BrowserWindow | null = null
let route: SettingsRoute = '/settings'
let onClosed: (() => void) | null = null

/** 설정 창의 webContents id(설정 IPC가 보낸 창을 확인한다). 열려 있지 않으면 null */
export const settingsContentsId = (): number | null => (win && !win.isDestroyed() ? win.webContents.id : null)

/** 열린 설정 창에 보낸다(없으면 아무것도 하지 않음) */
export function sendToSettings(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

/**
 * 설정 창(설계 문서 §5): 열 때 만들고 닫으면 없앤다(§16 메모리). 하나만 열고, 이미 열려 있으면 그 경로로 바꿔 앞으로 가져온다.
 * closed는 창이 닫힐 때 한 번 부른다(단축키 녹화를 멈추는 등).
 */
export function openSettingsWindow(next: SettingsRoute, o: { closed?: () => void } = {}): void {
  if (o.closed) onClosed = o.closed
  if (win && !win.isDestroyed()) {
    if (next !== route) {
      route = next
      const opts = settingsWindowOptions('', next)
      win.setResizable(true)
      win.setMinimumSize(opts.minWidth ?? 0, opts.minHeight ?? 0)
      win.setSize(opts.width ?? 880, opts.height ?? 640)
      win.setResizable(opts.resizable !== false)
      win.setTitle(opts.title ?? 'Sure-Mate')
      win.center()
      loadRoute(win, next)
    }
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    log('settings.window', { route: next, reused: true })
    return
  }
  route = next
  const w = new BrowserWindow(settingsWindowOptions(join(__dirname, '../preload/index.js'), next))
  win = w
  loadRoute(w, next)
  w.once('ready-to-show', () => {
    if (!w.isDestroyed()) {
      w.show()
      w.focus()
    }
  })
  w.on('closed', () => {
    if (win === w) win = null
    log('settings.window.closed', { route })
    onClosed?.()
  })
  log('settings.window', { route: next, reused: false })
}

/** 설정 창을 닫는다(온보딩을 마쳤을 때) */
export function closeSettingsWindow(): void {
  if (win && !win.isDestroyed()) win.close()
}
