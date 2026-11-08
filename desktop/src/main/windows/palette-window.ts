import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, screen, type Display } from 'electron'
import { IPC, type ShownPayload } from '../../shared/ipc-channels'
import { needsResize, palettePosition, shouldHideOnBlur } from '../../shared/palette-rules'
import { log } from '../log'
import { getForegroundWindow, setForeground } from '../native/windows'

export type DisplayMode = 'cursor' | 'primary' | 'active'

const SIZE = { width: 720, height: 460 }

let win: BrowserWindow | null = null
let ownHwnd: string | null = null
let previousHwnd: string | null = null
let shownAt = 0
let getDisplayMode: () => DisplayMode = () => 'cursor'

export function createPaletteWindow(opts: { getDisplayMode: () => DisplayMode }): BrowserWindow {
  getDisplayMode = opts.getDisplayMode
  win = new BrowserWindow({
    ...SIZE,
    show: false,
    frame: false,
    type: 'toolbar',
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    roundedCorners: true,
    backgroundMaterial: 'acrylic',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false
    }
  })
  ownHwnd = win.getNativeWindowHandle().readBigUInt64LE(0).toString()

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (is.dev) {
    // 디버깅용: renderer 콘솔과 Esc 입력이 실제로 들어오는지 기록
    win.webContents.on('console-message', (details) => {
      log('renderer.console', { level: details.level, message: String(details.message).slice(0, 300) })
    })
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && (input.code === 'Escape' || input.key === 'Escape')) log('palette.key', { code: input.code, key: input.key })
    })
  }

  win.on('blur', () => {
    if (!win) return
    log('palette.blur', { sinceShownMs: Date.now() - shownAt })
    if (shouldHideOnBlur(shownAt, Date.now(), win.webContents.isDevToolsOpened())) hidePalette({ restoreFocus: false })
  })
  return win
}

function targetDisplay(): Display {
  if (getDisplayMode() === 'primary') return screen.getPrimaryDisplay()
  // 'active'(활성 창이 있는 모니터)는 창 정보를 읽을 수 있게 된 뒤(Task 8)에 붙인다. 지금은 마우스 위치.
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

export function showPalette(payload: ShownPayload = { mode: 'search' }): void {
  if (!win) return
  const fg = getForegroundWindow()
  if (fg && fg !== ownHwnd) previousHwnd = fg

  const display = targetDisplay()
  const bounds = palettePosition(display.workArea, SIZE)
  win.setBounds(bounds)
  win.show()
  win.focus()
  // 배율이 다른 모니터로 옮기면 크기가 커지는 버그(electron#27651) 대응
  if (needsResize(win.getBounds(), SIZE, 2)) win.setBounds(bounds)
  shownAt = Date.now()
  win.webContents.send(IPC.paletteShown, payload)
  log('palette.show', { mode: payload.mode, display: display.id, scale: display.scaleFactor, bounds: win.getBounds() })
}

export function hidePalette(opts: { restoreFocus: boolean }): void {
  if (!win || !win.isVisible()) return
  win.hide()
  const restored = opts.restoreFocus && previousHwnd ? setForeground(previousHwnd) : false
  log('palette.hide', { restoreFocus: opts.restoreFocus, restored })
}

/**
 * 팔레트를 숨기고 직전 창을 앞으로 가져온다(선택 글을 그 창에서 가져오려고).
 * 직전 창이 없거나 80ms 안에 앞으로 오지 않으면 false
 */
export async function hidePaletteAndRefocus(): Promise<boolean> {
  const target = previousHwnd
  hidePalette({ restoreFocus: true })
  if (!target) return false
  const deadline = Date.now() + 80
  while (Date.now() < deadline) {
    if (getForegroundWindow() === target) return true
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return getForegroundWindow() === target
}

export const isPaletteVisible = (): boolean => Boolean(win?.isVisible())

export const getPreviousHwnd = (): string | null => previousHwnd
