import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, screen, type Display } from 'electron'
import { IPC, type ShownPayload } from '../../shared/ipc-channels'
import type { Rect } from '../../shared/types'
import {
  CONFIRM_MIN,
  confirmBounds,
  needsResize,
  palettePosition,
  paletteReturnTarget,
  resizedConfirmSize,
  shouldHideOnBlur,
  type Size
} from '../../shared/palette-rules'
import { log } from '../log'
import { getForegroundWindow, isOwnWindow, setForeground } from '../native/windows'
import { loadRoute } from './overlay-window'
import { settingsHwnd } from './settings-window'

export type DisplayMode = 'cursor' | 'primary' | 'active'

/** 검색 목록·용어·개발 출력 화면의 고정 크기. 확인 화면만 크게 열고 끌어서 크기를 바꾼다(2026-11-13) */
const SIZE = { width: 720, height: 460 }

let win: BrowserWindow | null = null
let ownHwnd: string | null = null
let previousHwnd: string | null = null
let shownAt = 0
let getDisplayMode: () => DisplayMode = () => 'cursor'
let getConfirmSize: () => Size | null = () => null
let saveConfirmSize: (size: Size) => void = () => {}
/** 지금 화면 종류와 앱이 마지막으로 정한 창 크기(끌어서 바꾼 크기와 구분한다) */
let layout: 'search' | 'confirm' = 'search'
let lastSize: Size = SIZE

export function createPaletteWindow(opts: {
  getDisplayMode: () => DisplayMode
  /** 확인 화면을 끌어서 바꾼 크기(설정 palette.confirmSize). 없으면 null */
  getConfirmSize: () => Size | null
  saveConfirmSize: (size: Size) => void
}): BrowserWindow {
  getDisplayMode = opts.getDisplayMode
  getConfirmSize = opts.getConfirmSize
  saveConfirmSize = opts.saveConfirmSize
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
  // 확인 화면에서 끌어서 바꾼 크기를 기억해 다음에도 그 크기로 연다(앱이 정한 크기는 저장하지 않는다)
  win.on('resized', () => {
    if (!win) return
    const size = resizedConfirmSize({ mode: layout, visible: win.isVisible(), actual: win.getBounds(), lastSet: lastSize })
    if (!size) return
    lastSize = size
    log('palette.confirmResize', size)
    saveConfirmSize(size)
  })
  return win
}

/** 화면 종류에 맞춰 창 크기·자리를 정한다: 확인 화면은 크게(끌어서 조절), 나머지는 720×460 고정 */
function applyLayout(next: 'search' | 'confirm', display: Display): Rect {
  const bounds = next === 'confirm' ? confirmBounds(display.workArea, getConfirmSize()) : palettePosition(display.workArea, SIZE)
  layout = next
  lastSize = { width: bounds.width, height: bounds.height }
  if (!win) return bounds
  win.setResizable(next === 'confirm')
  const min = next === 'confirm' ? CONFIRM_MIN : SIZE
  win.setMinimumSize(Math.min(min.width, bounds.width), Math.min(min.height, bounds.height))
  win.setBounds(bounds)
  return bounds
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
 * 팔레트를 연다. 닫은 뒤 돌아갈 창으로 지금 앞 창을 기억하되 Sure-Mate 창(펫·바·펼침 창)은 기억하지 않는다. 설정 창(첫 실행
 * 안내 포함)은 보통 창이라 기억한다: Esc 뒤 그 창으로 돌아가고, 프롬프트가 그 창에서 고른 글을 가져온다(2026-11-12).
 * returnTo: 말랑 메이트 조종을 끝내며 돌려받은 창. 포커스 복귀가 아직 끝나지 않아 펫 창이 앞에 있을 때 대신 쓴다(M6 최종 검토 I1)
 */
export function showPalette(payload: ShownPayload = { mode: 'search' }, o: { returnTo?: string | null } = {}): void {
  if (!win) return
  const settings = settingsHwnd()
  previousHwnd = paletteReturnTarget({
    foreground: getForegroundWindow(),
    palette: ownHwnd,
    current: previousHwnd,
    returnTo: o.returnTo ?? null,
    isOwn: ownWindow,
    isReturnable: (hwnd) => hwnd === settings
  })

  const display = targetDisplay()
  const bounds = applyLayout(payload.mode === 'confirm' ? 'confirm' : 'search', display)
  win.show()
  win.focus()
  // 배율이 다른 모니터로 옮기면 크기가 커지는 버그(electron#27651) 대응
  if (needsResize(win.getBounds(), bounds, 2)) win.setBounds(bounds)
  shownAt = Date.now()
  win.webContents.send(IPC.paletteShown, payload)
  log('palette.show', { mode: payload.mode, display: display.id, scale: display.scaleFactor, bounds: win.getBounds() })
}

/** 확인 화면의 'Esc 목록으로': 지금 창이 있는 모니터에서 검색 목록 크기(720×460)로 돌아가고 크기 조절을 끈다 */
export function paletteBackToList(): void {
  if (!win || !win.isVisible() || layout !== 'confirm') return
  const bounds = applyLayout('search', screen.getDisplayMatching(win.getBounds()))
  if (needsResize(win.getBounds(), bounds, 2)) win.setBounds(bounds)
  log('palette.backToList', { bounds })
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
