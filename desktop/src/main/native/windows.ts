import { setTimeout as sleep } from 'node:timers/promises'
import { basename } from 'node:path'
import { applyFrameInsets, frameInsets } from '../../shared/geometry'
import type { Rect, WindowInfo } from '../../shared/types'
import * as w from './win32'

const toRect = (r: w.RawRect): Rect => ({ x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top })

function windowRect(h: w.Hwnd): Rect | null {
  const r = {} as w.RawRect
  return w.GetWindowRect(h, r) ? toRect(r) : null
}

/** DWM이 그리는 눈에 보이는 테두리(보이지 않는 크기 조절 테두리 제외) */
function frameRect(h: w.Hwnd): Rect | null {
  const r = {} as w.RawRect
  return w.DwmGetWindowAttributeRect(h, w.DWMWA_EXTENDED_FRAME_BOUNDS, r, 16) === 0 ? toRect(r) : null
}

function processPath(pid: number): string {
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

/** 관리자 권한(UIPI 대상)인지. 알 수 없으면 null */
function isElevated(pid: number): boolean | null {
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

function readInfo(h: w.Hwnd): WindowInfo | null {
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
  const handles: w.Hwnd[] = []
  w.EnumWindows((h: w.Hwnd) => {
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

export const getWindowInfo = (hwnd: string): WindowInfo | null => readInfo(w.toHwnd(hwnd))

export const getForegroundWindow = (): string | null => w.fromHwnd(w.GetForegroundWindow())

export function setForeground(hwnd: string): boolean {
  const h = w.toHwnd(hwnd)
  return Boolean(w.IsWindow(h)) && Boolean(w.SetForegroundWindow(h))
}

/**
 * 창의 보이는 테두리가 targetPhysical(물리 픽셀)에 오도록 옮긴다.
 * 최소화·최대화면 먼저 되돌리고, 배율(DPI)이 다른 모니터로 갈 때는 먼저 옮긴 뒤
 * 창이 스스로 크기를 바꾸고 나서 최종 크기를 한 번 더 맞춘다.
 */
export async function moveWindow(hwnd: string, targetPhysical: Rect, targetDpi: number): Promise<{ before: Rect; after: Rect; steps: number }> {
  const h = w.toHwnd(hwnd)
  const before = frameRect(h) ?? windowRect(h) ?? targetPhysical
  if (w.IsIconic(h) || w.IsZoomed(h)) w.ShowWindow(h, w.SW_RESTORE)
  const flags = w.SWP_NOZORDER | w.SWP_NOACTIVATE | w.SWP_NOOWNERZORDER

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
