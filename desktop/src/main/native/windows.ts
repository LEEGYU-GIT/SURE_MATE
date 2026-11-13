import { setTimeout as sleep } from 'node:timers/promises'
import { basename } from 'node:path'
import { applyFrameInsets, frameInsets } from '../../shared/geometry'
import type { Rect, WindowInfo } from '../../shared/types'
import { nativeStatus, win32, type Hwnd, type RawRect } from './win32'

const toRect = (r: RawRect): Rect => ({ x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top })

function windowRect(h: Hwnd): Rect | null {
  const r = {} as RawRect
  return win32().GetWindowRect(h, r) ? toRect(r) : null
}

/** DWM이 그리는 눈에 보이는 테두리(보이지 않는 크기 조절 테두리 제외) */
function frameRect(h: Hwnd): Rect | null {
  const w = win32()
  const r = {} as RawRect
  return w.DwmGetWindowAttributeRect(h, w.DWMWA_EXTENDED_FRAME_BOUNDS, r, 16) === 0 ? toRect(r) : null
}

function processPath(pid: number): string {
  const w = win32()
  const hp = w.OpenProcess(w.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
  if (!hp) return ''
  try {
    const buf = Buffer.alloc(1024 * 2)
    const size = [1024]
    return w.QueryFullProcessImageNameW(hp, 0, buf, size) ? buf.toString('utf16le', 0, size[0] * 2) : ''
  } finally {
    w.CloseHandle(hp)
  }
}

/** 관리자 권한인지. 알 수 없으면 null */
function isElevated(pid: number): boolean | null {
  const w = win32()
  const hp = w.OpenProcess(w.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
  if (!hp) return null
  try {
    const token: unknown[] = [null]
    if (!w.OpenProcessToken(hp, w.TOKEN_QUERY, token) || !token[0]) return null
    try {
      const value = [0]
      const returned = [0]
      return w.GetTokenInformation(token[0], w.TOKEN_ELEVATION_CLASS, value, 4, returned) ? value[0] !== 0 : null
    } finally {
      w.CloseHandle(token[0])
    }
  } finally {
    w.CloseHandle(hp)
  }
}

let self: boolean | null | undefined

/** Sure-Mate 자신이 관리자 권한인지(UAC가 꺼진 PC에서는 관리자 계정의 모든 프로세스가 관리자 권한). 모르면 null */
export function selfElevated(): boolean | null {
  if (self === undefined) self = isElevated(process.pid)
  return self
}

function readInfo(h: Hwnd): WindowInfo | null {
  const w = win32()
  if (!w.IsWindow(h)) return null
  const rect = windowRect(h)
  if (!rect) return null
  const pidOut = [0]
  w.GetWindowThreadProcessId(h, pidOut)
  const pid = pidOut[0]
  const cloakedOut = [0]
  const cloaked = w.DwmGetWindowAttributeDword(h, w.DWMWA_CLOAKED, cloakedOut, 4) === 0 && cloakedOut[0] !== 0
  return {
    hwnd: h.toString(),
    title: w.readWide((buf, max) => w.GetWindowTextW(h, buf, max)),
    className: w.readWide((buf, max) => w.GetClassNameW(h, buf, max), 256),
    exe: basename(processPath(pid)),
    pid,
    rect,
    frame: frameRect(h) ?? rect,
    minimized: Boolean(w.IsIconic(h)),
    maximized: Boolean(w.IsZoomed(h)),
    cloaked,
    elevated: isElevated(pid),
    dpi: w.GetDpiForWindow(h)
  }
}

/** 보이는 최상위 창 중 제목이 있고, 도구 창·소유된 창·가려진 창·Sure-Mate 자신이 아닌 것 */
export function listWindows(): WindowInfo[] {
  const w = win32()
  const handles: Hwnd[] = []
  w.EnumWindows((h: Hwnd) => {
    handles.push(h)
    return true
  }, 0)
  const result: WindowInfo[] = []
  for (const h of handles) {
    if (!w.IsWindowVisible(h) || w.GetWindow(h, w.GW_OWNER)) continue
    if (Number(w.GetWindowLongPtrW(h, w.GWL_EXSTYLE)) & w.WS_EX_TOOLWINDOW) continue
    const info = readInfo(h)
    if (!info || !info.title || info.cloaked || info.pid === process.pid) continue
    result.push(info)
  }
  return result
}

export const getWindowInfo = (hwnd: string): WindowInfo | null => readInfo(win32().toHwnd(hwnd))

/** 지금 활성 창. Win32 기능을 못 불러왔으면 null(팔레트는 그래도 뜬다) */
export function getForegroundWindow(): string | null {
  if (!nativeStatus().ok) return null
  const w = win32()
  return w.fromHwnd(w.GetForegroundWindow())
}

/** 창을 앞으로 가져온다. Win32 기능을 못 불러왔으면 false */
export function setForeground(hwnd: string): boolean {
  if (!nativeStatus().ok) return false
  const w = win32()
  const h = w.toHwnd(hwnd)
  return Boolean(w.IsWindow(h)) && Boolean(w.SetForegroundWindow(h))
}

/**
 * Sure-Mate 자신의 창인지(팔레트·펫·바·펼침 창·설정 창은 모두 main 프로세스의 창이다). 팔레트·조종 모드가 돌아갈 창으로
 * 기억하지 않으려고 쓴다. Win32 기능을 못 불러왔거나 창이 없으면 false
 */
export function isOwnWindow(hwnd: string): boolean {
  if (!nativeStatus().ok) return false
  const w = win32()
  const h = w.toHwnd(hwnd)
  if (!w.IsWindow(h)) return false
  const pidOut = [0]
  w.GetWindowThreadProcessId(h, pidOut)
  return pidOut[0] === process.pid
}

/** 보이는 창인지(숨긴 창에 포커스를 주지 않으려고). Win32 기능을 못 불러왔거나 창이 없으면 false */
export function isWindowVisible(hwnd: string): boolean {
  if (!nativeStatus().ok) return false
  const w = win32()
  const h = w.toHwnd(hwnd)
  return Boolean(w.IsWindow(h)) && Boolean(w.IsWindowVisible(h))
}

/**
 * 창의 보이는 테두리가 targetPhysical(물리 픽셀)에 오도록 옮긴다.
 * 최소화·최대화면 먼저 되돌리고, 배율(DPI)이 다른 모니터로 갈 때는 먼저 옮긴 뒤
 * 창이 스스로 크기를 바꾸고 나서 최종 크기를 한 번 더 맞춘다.
 */
export async function moveWindow(
  hwnd: string,
  targetPhysical: Rect,
  targetDpi: number,
  o: { async?: boolean } = {}
): Promise<{ before: Rect; after: Rect; steps: number }> {
  const w = win32()
  const h = w.toHwnd(hwnd)
  const before = frameRect(h) ?? windowRect(h) ?? targetPhysical
  if (w.IsIconic(h) || w.IsZoomed(h)) w.ShowWindow(h, w.SW_RESTORE)
  // 응답 없는 앱 창에 동기 호출하면 main이 멈추므로 복원 실행기는 비동기로 호출한다.
  const flags = w.SWP_NOZORDER | w.SWP_NOACTIVATE | w.SWP_NOOWNERZORDER | (o.async ? w.SWP_ASYNCWINDOWPOS : 0)

  let steps = 1
  if (w.GetDpiForWindow(h) !== targetDpi) {
    w.SetWindowPos(h, null, targetPhysical.x, targetPhysical.y, 0, 0, flags | w.SWP_NOSIZE)
    await sleep(60) // WM_DPICHANGED를 비동기로 처리하는 앱 대비
    steps = 2
  }
  const win = windowRect(h)
  const frame = frameRect(h)
  const placed = win && frame ? applyFrameInsets(targetPhysical, frameInsets(win, frame)) : targetPhysical
  w.SetWindowPos(h, null, placed.x, placed.y, placed.width, placed.height, flags)
  const after = frameRect(h) ?? windowRect(h) ?? placed
  return { before, after, steps }
}

/** SHQueryUserNotificationState 결과 해석: HRESULT가 0(S_OK)이 아니거나 값이 없으면 null */
export function decodeNotificationState(hresult: number, state: number | undefined): number | null {
  return hresult === 0 && typeof state === 'number' ? state : null
}

/** 사용자 알림 상태(2·3·4가 전체 화면 계열). Win32를 쓸 수 없거나 조회에 실패하면 null */
export function notificationState(): number | null {
  if (!nativeStatus().ok) return null
  const w = win32()
  const out = [0]
  return decodeNotificationState(w.SHQueryUserNotificationState(out), out[0])
}

/** 위치·크기·활성 상태를 건드리지 않고 맨 앞(TOPMOST)으로만 올린다. Win32를 쓸 수 없으면 false */
export function raiseTopmost(hwnd: string): boolean {
  if (!nativeStatus().ok) return false
  const w = win32()
  const flags = w.SWP_NOMOVE | w.SWP_NOSIZE | w.SWP_NOACTIVATE | w.SWP_NOOWNERZORDER
  return Boolean(w.SetWindowPos(w.toHwnd(hwnd), w.HWND_TOPMOST, 0, 0, 0, 0, flags))
}

/** 창 상태 읽기(복원 실행기용). 창이 없어졌거나 Win32를 쓸 수 없으면 null. frame은 보이는 테두리(물리 픽셀) */
export function readWindowState(hwnd: string): { minimized: boolean; maximized: boolean; hung: boolean; frame: Rect } | null {
  if (!nativeStatus().ok) return null
  const w = win32()
  const h = w.toHwnd(hwnd)
  if (!w.IsWindow(h)) return null
  const frame = frameRect(h) ?? windowRect(h)
  if (!frame) return null
  return { minimized: Boolean(w.IsIconic(h)), maximized: Boolean(w.IsZoomed(h)), hung: Boolean(w.IsHungAppWindow(h)), frame }
}

/** 최소화·최대화를 풀어 보통 상태로(비동기 호출). activate가 true면 SW_RESTORE, 아니면 활성화 없이 SW_SHOWNOACTIVATE */
export function showWindowNormal(hwnd: string, activate: boolean): void {
  if (!nativeStatus().ok) return
  const w = win32()
  w.ShowWindowAsync(w.toHwnd(hwnd), activate ? w.SW_RESTORE : w.SW_SHOWNOACTIVATE)
}

export function showWindowMaximized(hwnd: string): void {
  if (!nativeStatus().ok) return
  const w = win32()
  w.ShowWindowAsync(w.toHwnd(hwnd), w.SW_SHOWMAXIMIZED)
}

/** z-순서만 바꾸는 데 필요한 Win32 면(bringToFront). 시험은 가짜를 넘긴다 */
export interface ZOrderWin32 {
  toHwnd(hwnd: string): Hwnd
  GetWindowLongPtrW(h: Hwnd, index: number): unknown
  SetWindowPos(h: Hwnd, insertAfter: Hwnd | null, x: number, y: number, cx: number, cy: number, flags: number): unknown
  GWL_EXSTYLE: number
  WS_EX_TOPMOST: number
  HWND_TOPMOST: Hwnd
  HWND_NOTOPMOST: Hwnd
  SWP_NOSIZE: number
  SWP_NOMOVE: number
  SWP_NOACTIVATE: number
  SWP_NOOWNERZORDER: number
  SWP_ASYNCWINDOWPOS: number
}

/** Sure-Mate가 방금 항상 위로 만들었거나 푼 창을 기억하는 시간(비동기 SetWindowPos 요청이 처리될 때까지) */
export const TOPMOST_LEDGER_MS = 2000

/**
 * Sure-Mate가 방금 HWND_TOPMOST·HWND_NOTOPMOST를 보낸 창(2026-11-12 검토 C1). 비동기 요청이 반쯤 처리된 동안에는 그 창이
 * WS_EX_TOPMOST로 보이므로, 기억하는 동안은 원래 항상 위인 창이 아니라 보통 창으로 다룬다. 그대로 읽으면 다음 올리기가 HWND_TOPMOST만
 * 보내 창이 항상 위로 남고, 그 뒤로는 그 창을 원래 항상 위인 창으로 오해한다
 */
export interface TopmostLedger {
  mark(hwnd: string): void
  ours(hwnd: string): boolean
}

export function createTopmostLedger(now: () => number = Date.now, ttlMs: number = TOPMOST_LEDGER_MS): TopmostLedger {
  const until = new Map<string, number>()
  return {
    mark(hwnd) {
      const t = now()
      for (const [h, u] of until) if (u <= t) until.delete(h)
      until.set(hwnd, t + ttlMs)
    },
    ours(hwnd) {
      const u = until.get(hwnd)
      return u !== undefined && u > now()
    }
  }
}

/** 앱 전체가 함께 쓰는 기록(불러오기의 올리기·화면 감추기의 고정과 풀기) */
const ledger = createTopmostLedger()

/** 원래 항상 위인 창인지: WS_EX_TOPMOST이고 Sure-Mate가 방금 항상 위로 만들거나 푼 창이 아니다 */
export function isTopmostWith(w: ZOrderWin32, hwnd: string, l: TopmostLedger = ledger): boolean {
  return (Number(w.GetWindowLongPtrW(w.toHwnd(hwnd), w.GWL_EXSTYLE)) & w.WS_EX_TOPMOST) !== 0 && !l.ours(hwnd)
}

/**
 * 다른 앱의 창을 지금 앞 창(메신저·Word 등)보다 위로 올린다. 위치·크기·활성 상태는 그대로다.
 * HWND_TOP으로 올리려면 그 창의 프로세스가 SetForegroundWindow 권한을 가져야 해서(SetWindowPos 문서) 다른 앱의 창은 대개 올라가지
 * 않는다. 맨 앞(HWND_TOPMOST)으로 올린 직후 보통 창(HWND_NOTOPMOST)으로 되돌리면 권한 없이 보통 창 가운데 맨 위에 남는다.
 * 원래 항상 위(WS_EX_TOPMOST)인 창은 되돌리지 않는다(그 창의 항상 위 설정을 바꾸지 않게). 방금 Sure-Mate가 올린 창은 요청이 덜 처리돼
 * 항상 위로 보여도 보통 창으로 다룬다(isTopmostWith).
 * 두 요청 모두 SWP_ASYNCWINDOWPOS: 응답이 느린 창에서 main이 멈추지 않고, 그 창의 메시지 큐에서 차례를 지킨다
 */
export function bringToFront(w: ZOrderWin32, hwnd: string, l: TopmostLedger = ledger): void {
  const h = w.toHwnd(hwnd)
  const flags = w.SWP_NOMOVE | w.SWP_NOSIZE | w.SWP_NOACTIVATE | w.SWP_NOOWNERZORDER | w.SWP_ASYNCWINDOWPOS
  const topmost = isTopmostWith(w, hwnd, l)
  w.SetWindowPos(h, w.HWND_TOPMOST, 0, 0, 0, 0, flags)
  if (topmost) return
  w.SetWindowPos(h, w.HWND_NOTOPMOST, 0, 0, 0, 0, flags)
  l.mark(hwnd)
}

/** 복원한 창을 다른 창 위로 올린다(bringToFront, 비동기). Win32를 쓸 수 없으면 아무것도 하지 않는다 */
export function raiseWindow(hwnd: string): void {
  if (!nativeStatus().ok) return
  bringToFront(win32(), hwnd)
}

/**
 * 항상 위로 고정(on, HWND_TOPMOST)하거나 푼다(HWND_NOTOPMOST). 이동·크기·활성화 없이 비동기(화면 감추기의 항상 위 옵션).
 * SWP_SHOWWINDOW가 없어 숨은 창(트레이로 숨은 앱)도 보이지 않은 채 풀린다. 고정·풀기 모두 기록한다(isTopmostWith)
 */
export function setTopmost(w: ZOrderWin32, hwnd: string, on: boolean, l: TopmostLedger = ledger): void {
  const flags = w.SWP_NOMOVE | w.SWP_NOSIZE | w.SWP_NOACTIVATE | w.SWP_NOOWNERZORDER | w.SWP_ASYNCWINDOWPOS
  w.SetWindowPos(w.toHwnd(hwnd), on ? w.HWND_TOPMOST : w.HWND_NOTOPMOST, 0, 0, 0, 0, flags)
  l.mark(hwnd)
}

/** setTopmost를 Win32로. Win32를 쓸 수 없으면 아무것도 하지 않는다 */
export function pinWindow(hwnd: string, on: boolean): void {
  if (!nativeStatus().ok) return
  setTopmost(win32(), hwnd, on)
}

/** 원래 항상 위인지(isTopmostWith: Sure-Mate가 방금 올리거나 푼 창은 아니다). Win32를 쓸 수 없거나 창이 없으면 false */
export function isTopmost(hwnd: string): boolean {
  if (!nativeStatus().ok) return false
  const w = win32()
  return Boolean(w.IsWindow(w.toHwnd(hwnd))) && isTopmostWith(w, hwnd)
}

/** 창이 아직 있는지(IsWindow). 숨은 창도 있는 창이다. Win32를 쓸 수 없으면 false */
export function windowExists(hwnd: string): boolean {
  if (!nativeStatus().ok) return false
  const w = win32()
  return Boolean(w.IsWindow(w.toHwnd(hwnd)))
}

/** 활성화 없이 최소화(ShowWindowAsync SW_SHOWMINNOACTIVE, 비동기). 보냈으면 true. Win32를 쓸 수 없으면 false */
export function minimizeWindow(hwnd: string): boolean {
  if (!nativeStatus().ok) return false
  const w = win32()
  return Boolean(w.ShowWindowAsync(w.toHwnd(hwnd), w.SW_SHOWMINNOACTIVE))
}

/** 지금 앞 창의 맨 위 소유 창(GA_ROOTOWNER: 대화상자는 그 앱 창)과 그것이 Sure-Mate 자신의 창인지. 없거나 Win32를 쓸 수 없으면 null */
export function foregroundRoot(): { hwnd: string; own: boolean } | null {
  if (!nativeStatus().ok) return null
  const w = win32()
  const fg = w.GetForegroundWindow()
  if (!fg) return null
  const root = w.GetAncestor(fg, w.GA_ROOTOWNER) || fg
  const pidOut = [0]
  w.GetWindowThreadProcessId(root, pidOut)
  const hwnd = w.fromHwnd(root)
  return hwnd ? { hwnd, own: pidOut[0] === process.pid } : null
}

/** 바탕 화면(GetShellWindow)에 포커스를 준다. 셸이 없거나 Win32를 쓸 수 없으면 false */
export function focusDesktop(): boolean {
  if (!nativeStatus().ok) return false
  const w = win32()
  const shell = w.GetShellWindow()
  return Boolean(shell) && Boolean(w.SetForegroundWindow(shell))
}
