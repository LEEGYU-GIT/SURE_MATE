import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { loadRoute } from './overlay-window'

let win: BrowserWindow | null = null

/** 기록기 창의 webContents id(기록 저장 IPC가 보낸 창을 확인한다). 열려 있지 않으면 null */
export const imeLoggerContentsId = (): number | null => (win && !win.isDestroyed() ? win.webContents.id : null)

/** 개발용 한글 입력 기록기 창. 일반 창이라 포커스·IME가 평소 앱과 같게 동작한다. */
export function openImeLoggerWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
    return win
  }
  win = new BrowserWindow({
    width: 900,
    height: 640,
    title: 'Sure-Mate 한글 입력 기록기',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })
  loadRoute(win, '/ime-logger')
  win.on('closed', () => {
    win = null
  })
  return win
}
