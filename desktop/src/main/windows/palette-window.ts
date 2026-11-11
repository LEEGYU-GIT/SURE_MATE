import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, screen, type Display } from 'electron'
import { IPC, type ShownPayload } from '../../shared/ipc-channels'
import { needsResize, palettePosition, paletteReturnTarget, shouldHideOnBlur } from '../../shared/palette-rules'
import { log } from '../log'
import { getForegroundWindow, isOwnWindow, setForeground } from '../native/windows'
import { loadRoute } from './overlay-window'

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

  loadRoute(win, '')

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

/** Sure-Mate 창인지(읽지 못하면 아니라고 본다: 팔레트는 Win32 없이도 열린다) */
const ownWindow = (hwnd: string): boolean => {
  try {
    return isOwnWindow(hwnd)
  } catch {
    return false
  }
}

/**
 * 팔레트를 연다. 닫은 뒤 돌아갈 창으로 지금 앞 창을 기억하되 Sure-Mate 창(펫·바·펼침 창·설정 창)은 기억하지 않는다.
 * returnTo: 말랑 메이트 조종을 끝내며 돌려받은 창. 포커스 복귀가 아직 끝나지 않아 펫 창이 앞에 있을 때 대신 쓴다(M6 최종 검토 I1)
 */
export function showPalette(payload: ShownPayload = { mode: 'search' }, o: { returnTo?: string | null } = {}): void {
  if (!win) return
  previousHwnd = paletteReturnTarget({
    foreground: getForegroundWindow(),
    palette: ownHwnd,
    current: previousHwnd,
    returnTo: o.returnTo ?? null,
    isOwn: ownWindow
  })

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

/** 팔레트 창의 webContents id(팔레트 IPC가 보낸 창을 확인한다). 창이 없으면 null */
export const paletteContentsId = (): number | null => (win && !win.isDestroyed() ? win.webContents.id : null)

export const getPreviousHwnd = (): string | null => previousHwnd

/** 팔레트 창 핸들(10진 문자열). 창이 없으면 null */
export const paletteHwnd = (): string | null => ownHwnd
