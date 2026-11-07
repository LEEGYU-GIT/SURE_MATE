import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow } from 'electron'

let win: BrowserWindow | null = null

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
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/ime-logger`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/ime-logger' })
  }
  win.on('closed', () => {
    win = null
  })
  return win
}
