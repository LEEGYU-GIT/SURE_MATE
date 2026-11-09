import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import type { Rect } from '../../shared/types'
import { errorText } from '../error-text'
import { log } from '../log'
import { nativeStatus } from '../native/win32'
import { raiseTopmost } from '../native/windows'

/** renderer 번들 안의 화면 경로(App.tsx가 # 경로로 고른다). ''는 팔레트 */
export type RendererRoute = '' | '/bar' | '/flyout' | '/ime-logger'

/**
 * 바·펼침 창 공통 옵션(설계 §14-1·§9). 포커스를 받지 않고(WS_EX_NOACTIVATE) 작업 표시줄·Alt+Tab에 나오지 않는 투명 창이다.
 * - backgroundThrottling: false — 숨긴 펼침 창도 내용을 그리고 크기를 재야 한다.
 * - thickFrame: false — 크기 조절 테두리를 빼 Windows가 최소 창 너비를 강제하지 않게 하고(너비 44·56, 손잡이 6 DIP) 표시 애니메이션을 없앤다.
 * - roundedCorners: false — Windows 11이 테두리 없는 창 모서리를 둥글게 잘라 CSS 모양을 가리지 않게 한다.
 * 만든 뒤 setAlwaysOnTop(true, 'screen-saver')로 수준을 올린다(openOverlayWindow).
 */
export function overlayWindowOptions(preload: string): BrowserWindowConstructorOptions {
  return {
    show: false,
    frame: false,
    transparent: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    type: 'toolbar',
    alwaysOnTop: true,
    hasShadow: false,
    thickFrame: false,
    roundedCorners: false,
    backgroundColor: '#00000000',
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false }
  }
}

/**
 * 창에 renderer 화면을 불러온다. 개발 모드에서만 개발 서버 주소를 쓴다:
 * 설치본이 환경 변수(ELECTRON_RENDERER_URL)만 보고 주소를 불러오면 바깥 페이지에 preload API가 열린다.
 * 불러오지 못하면 기록만 한다(처리하지 않은 거부를 남기지 않는다).
 */
export function loadRoute(win: Pick<BrowserWindow, 'loadURL' | 'loadFile'>, hash: RendererRoute): void {
  const devUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined
  const html = join(__dirname, '../renderer/index.html')
  const loading = devUrl ? win.loadURL(hash ? `${devUrl}#${hash}` : devUrl) : hash ? win.loadFile(html, { hash }) : win.loadFile(html)
  loading.catch((e: unknown) => log('window.load.failed', { route: hash || '/', error: errorText(e) }))
}

/** getNativeWindowHandle() 버퍼(x64 Windows는 8바이트 HWND, 리틀 엔디언)를 10진 문자열로. IPC·로그·koffi 호출에 BigInt를 넘기지 않는다 */
export function hwndOf(handle: Buffer): string {
  if (handle.length >= 8) return handle.readBigUInt64LE(0).toString()
  if (handle.length >= 4) return String(handle.readUInt32LE(0))
  return '0'
}

/** 맨 앞 올리기가 다루는 창 */
export interface OverlayHandle {
  hwnd: string
  moveTop(): void
  getBounds(): Rect
  setBounds(r: Rect): void
  /** 마지막으로 놓은 사각형(아직 놓지 않았으면 null) */
  lastBounds(): Rect | null
}

/** Win32 맨 앞 올리기(시험에서 바꿔 끼운다) */
export interface RaiseNative {
  available(): boolean
  raiseTopmost(hwnd: string): boolean
}

const NATIVE: RaiseNative = { available: () => nativeStatus().ok, raiseTopmost }

/** 바 컨트롤러와 같은 허용 오차(DIP): 배율 화면에서 DIP ↔ 물리 픽셀 반올림으로 1~2씩 어긋난다 */
const BOUNDS_TOLERANCE = 2
const drifted = (a: Rect, b: Rect): boolean =>
  Math.abs(a.x - b.x) > BOUNDS_TOLERANCE || Math.abs(a.y - b.y) > BOUNDS_TOLERANCE || Math.abs(a.width - b.width) > BOUNDS_TOLERANCE || Math.abs(a.height - b.height) > BOUNDS_TOLERANCE

/**
 * 맨 앞(TOPMOST)으로 올린다. Win32를 쓸 수 있으면 위치·크기·활성 상태를 건드리지 않는 SetWindowPos(HWND_TOPMOST)로 올린다.
 * 못 쓰거나 실패하면 moveTop()으로 대신하고, 창이 마지막 사각형에서 벗어났으면 되돌린다(moveTop의 배율 화면 동작 미확인).
 * 2초마다·펼칠 때마다 불리므로 던지지 않고 기록하지 않는다.
 */
export function raiseOverlay(w: OverlayHandle, native: RaiseNative = NATIVE): void {
  try {
    if (native.available() && native.raiseTopmost(w.hwnd)) return
  } catch {
    // moveTop으로 대신한다
  }
  try {
    w.moveTop()
    const last = w.lastBounds()
    if (last && drifted(w.getBounds(), last)) w.setBounds(last)
  } catch {
    // 창이 이미 닫혔다(앱을 끝내는 중). 다음 주기에 다시 시도한다
  }
}

/** 바·펼침 창이 쓰는 창 연결부. 창이 닫힌 뒤(앱을 끝내는 중) 불려도 던지지 않는다 */
export interface OverlayWindow {
  win: BrowserWindow
  hwnd: string
  /** 정수 DIP로 맞춰 놓는다(Electron은 소수 좌표를 받지 않는다) */
  setBounds(r: Rect): void
  getBounds(): Rect
  showInactive(): void
  hide(): void
  visible(): boolean
  send(channel: string, ...args: unknown[]): void
  /** 맨 앞(TOPMOST)으로 */
  raise(): void
}

const ZERO: Rect = { x: 0, y: 0, width: 0, height: 0 }
const roundRect = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })

/** 포커스를 받지 않는 투명 창을 만들고 renderer 화면(route)을 불러온다. 보이기는 부르는 쪽이 showInactive()로 한다 */
export function openOverlayWindow(route: '/bar' | '/flyout', size: { width: number; height: number }): OverlayWindow {
  const win = new BrowserWindow({ ...overlayWindowOptions(join(__dirname, '../preload/index.js')), ...size })
  win.setAlwaysOnTop(true, 'screen-saver')
  const hwnd = hwndOf(win.getNativeWindowHandle())
  let last: Rect | null = null
  const alive = (): boolean => !win.isDestroyed()
  const setBounds = (r: Rect): void => {
    last = roundRect(r)
    if (alive()) win.setBounds(last)
  }
  const getBounds = (): Rect => (alive() ? win.getBounds() : (last ?? ZERO))
  loadRoute(win, route)
  return {
    win,
    hwnd,
    setBounds,
    getBounds,
    showInactive: () => {
      if (alive()) win.showInactive()
    },
    hide: () => {
      if (alive()) win.hide()
    },
    visible: () => alive() && win.isVisible(),
    send: (channel, ...args) => {
      if (alive()) win.webContents.send(channel, ...args)
    },
    raise: () => {
      if (!alive()) return
      raiseOverlay({ hwnd, moveTop: () => win.moveTop(), getBounds, setBounds, lastBounds: () => last })
    }
  }
}
