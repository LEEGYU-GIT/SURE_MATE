import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { needsResize } from '../../shared/palette-rules'
import type { Rect } from '../../shared/types'
import type { PetWindowPort } from '../pet/pet-controller'
import { hwndOf, loadRoute, petWindowOptions, raiseOverlay, type RaiseNative } from './overlay-window'

/** 배율 화면에서 DIP ↔ 물리 픽셀 반올림으로 생기는 어긋남(DIP). 바·팔레트와 같은 값이다. 이보다 크면 다시 놓는다 */
const SIZE_TOLERANCE = 2

const roundRect = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })

/** 펫 창 연결부가 쓰는 BrowserWindow 부분(시험에서 흉내 낸다) */
export interface PetWindowTarget {
  isDestroyed(): boolean
  setBounds(r: Rect): void
  getBounds(): Rect
  showInactive(): void
  hide(): void
  setIgnoreMouseEvents(ignore: boolean): void
  setFocusable(focusable: boolean): void
  setSkipTaskbar(skip: boolean): void
  focus(): void
  moveTop(): void
  webContents: { send(channel: string, ...args: unknown[]): void }
}

export interface PetWindowControls {
  /** 컨트롤러가 부르는 창 연결부 */
  port: PetWindowPort
  /** 모니터가 바뀌었다: 다음에 보이는 채 놓을 때(또는 다시 보일 때) 창 크기를 한 번 확인한다(electron#27651) */
  recheckSize(): void
  /** 맨 앞(TOPMOST)으로. Win32가 없으면 moveTop. 2초마다 불리므로 기록하지 않는다 */
  raise(): void
}

/** 펫 런타임이 쓰는 펫 창 */
export interface PetWindow extends PetWindowControls {
  /** 창 핸들(10진 문자열) */
  hwnd: string
  /** 펫 창 webContents id(펫 IPC는 이 창이 보낸 것만 받는다) */
  contentsId: number
  /** 창이 포커스를 가졌는지(조종을 시작한 뒤 Windows가 포커스를 주었는지 확인한다). 닫힌 뒤에는 false */
  isFocused(): boolean
  onBlur(cb: () => void): void
  /** 닫으려 한다(조종 중 Alt+F4 등). event.preventDefault()로 막는다 */
  onClose(cb: (event: { preventDefault(): void }) => void): void
  onClosed(cb: () => void): void
  /** 렌더러가 죽었다(render-process-gone). 까닭(crashed·oom 등 Electron 값)을 넘긴다 */
  onRenderGone(cb: (reason: string) => void): void
  /** #/pet을 다시 불러온다(렌더러가 죽은 뒤 한 번). 닫힌 뒤에는 아무것도 하지 않는다 */
  reload(): void
  /** 창을 없앤다(이미 닫혔으면 아무것도 하지 않는다) */
  destroy(): void
}

/**
 * 펫 창 포트(설계 §14-2). 창이 닫힌 뒤(앱을 끝내는 중, 정리 중 setFocusable(false))에 불려도 아무것도 하지 않고 던지지 않는다.
 * - setBounds: 정수 DIP 사각형으로 놓는다. 처음 표시할 때와 모니터가 바뀐 뒤(recheckSize)에만 getBounds()로 크기를 확인해
 *   2 DIP 넘게 어긋났으면 한 번 더 놓는다(electron#27651). 매 프레임에는 확인하지 않는다.
 * - setIgnoreMouse: forward 없이 부른다(전역 마우스 훅을 쓰지 않는다, 계획 결정 1).
 * - setFocusable: 조종 모드에서만 true. 바꾼 뒤 작업 표시줄 단추를 다시 숨긴다(Electron은 Windows에서 setFocusable(true)가
 *   작업 표시줄 단추를 되살릴 수 있다, 확인 필요).
 */
export function petWindowControls(win: PetWindowTarget, hwnd: string, native?: RaiseNative): PetWindowControls {
  const alive = (): boolean => !win.isDestroyed()
  let last: Rect | null = null
  let shown = false
  /** 크기를 확인할 차례(처음 표시, 모니터 변화 뒤) */
  let verify = true

  const place = (r: Rect): void => {
    last = roundRect(r)
    win.setBounds(last)
  }
  const checkSize = (): void => {
    verify = false
    if (last && needsResize(win.getBounds(), last, SIZE_TOLERANCE)) win.setBounds(last)
  }

  const port: PetWindowPort = {
    setBounds(r) {
      if (![r.x, r.y, r.width, r.height].every(Number.isFinite) || !alive()) return
      place(r)
      if (verify && shown) checkSize()
    },
    showInactive() {
      if (!alive()) return
      win.showInactive()
      shown = true
      if (verify) checkSize()
    },
    hide() {
      if (!alive()) return
      win.hide()
      shown = false
    },
    send(v) {
      if (alive()) win.webContents.send(IPC.petView, v)
    },
    setIgnoreMouse(ignore) {
      if (alive()) win.setIgnoreMouseEvents(ignore)
    },
    setFocusable(focusable) {
      if (!alive()) return
      win.setFocusable(focusable)
      win.setSkipTaskbar(true)
    },
    focus() {
      if (alive()) win.focus()
    }
  }

  return {
    port,
    recheckSize() {
      verify = true
    },
    raise() {
      if (!alive()) return
      raiseOverlay({ hwnd, moveTop: () => win.moveTop(), getBounds: () => win.getBounds(), setBounds: place, lastBounds: () => last }, native)
    }
  }
}

/**
 * 시스템 메뉴(창 메뉴)를 여는 키: Alt+Space(Shift를 함께 눌러도). Ctrl+Alt는 Windows가 시스템 키로 보내지 않는다.
 * 조종 모드에서 펫 창이 키보드를 받을 때 페이지에 닿기 전에 막는다(처리하지 않은 키는 Chromium이 DefWindowProc에 넘겨 메뉴가 열린다)
 */
export function isSystemMenuKey(input: { type: string; alt: boolean; control: boolean; code: string }): boolean {
  return input.type === 'keyDown' && input.alt && !input.control && input.code === 'Space'
}

/**
 * 말랑 메이트 창(#/pet, 설계 §14-2·§5). 포커스를 받지 않는 작은 투명 창으로, 처음부터 클릭 통과(forward 없음)이고
 * 펫 모양·말풍선·메뉴 위에서만 컨트롤러가 클릭 통과를 끈다. 표시·자리·포커스는 컨트롤러가 정한다.
 * 조종 모드에서는 키보드를 받으므로 메뉴 막대(메뉴 단축키: Ctrl+W 닫기 등)를 없애고 Alt+Space(시스템 메뉴)를 막는다.
 * 닫기(Alt+F4)는 펫 런타임이 막는다. 다른 주소로 이동하지 못하게 하는 것은 모든 창 공통(index.ts의 lockNavigation)이다.
 */
export function createPetWindow(): PetWindow & { win: BrowserWindow } {
  const win = new BrowserWindow(petWindowOptions(join(__dirname, '../preload/index.js')))
  let hwnd: string
  try {
    win.removeMenu()
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setIgnoreMouseEvents(true)
    win.webContents.on('before-input-event', (event, input) => {
      if (isSystemMenuKey(input)) event.preventDefault()
    })
    hwnd = hwndOf(win.getNativeWindowHandle())
    loadRoute(win, '/pet')
  } catch (e) {
    // 숨은 창을 남기지 않는다(펫 런타임이 시작하지 못해도 바·팔레트는 동작한다)
    if (!win.isDestroyed()) win.destroy()
    throw e
  }
  return {
    win,
    hwnd,
    contentsId: win.webContents.id,
    ...petWindowControls(win, hwnd),
    isFocused: () => !win.isDestroyed() && win.isFocused(),
    onBlur: (cb) => void win.on('blur', cb),
    onClose: (cb) => void win.on('close', cb),
    onClosed: (cb) => void win.on('closed', cb),
    onRenderGone: (cb) => void win.webContents.on('render-process-gone', (_e, details) => cb(details.reason)),
    reload: () => {
      if (!win.isDestroyed()) loadRoute(win, '/pet')
    },
    destroy: () => {
      if (!win.isDestroyed()) win.destroy()
    }
  }
}
