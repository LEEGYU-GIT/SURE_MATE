import type * as Koffi from 'koffi'
import { lazyLoad } from '../../shared/lazy'

// Win32 바인딩은 이 파일에만 둔다. koffi 3에서 포인터(HWND, HANDLE)는 BigInt다.
// koffi(.node)는 처음 쓸 때 불러온다. 회사 보안 프로그램이 서명 없는 .node를 막아도
// 앱이 시작 단계에서 죽지 않고 팔레트·트레이는 뜨게 하려는 것이다.

export type Hwnd = bigint
export type RawRect = { left: number; top: number; right: number; bottom: number }

const CONSTANTS = {
  GW_OWNER: 4,
  GWL_EXSTYLE: -20,
  WS_EX_TOOLWINDOW: 0x80,
  WS_EX_NOACTIVATE: 0x08000000,
  SW_RESTORE: 9,
  SW_MAXIMIZE: 3,
  // SetWindowPos 플래그와 삽입 기준(winuser.h): SWP_NOSIZE 0x0001, SWP_NOMOVE 0x0002, SWP_NOACTIVATE 0x0010, SWP_NOOWNERZORDER 0x0200
  SWP_NOSIZE: 0x0001,
  SWP_NOMOVE: 0x0002,
  SWP_NOZORDER: 0x0004,
  SWP_NOACTIVATE: 0x0010,
  SWP_NOOWNERZORDER: 0x0200,
  DWMWA_EXTENDED_FRAME_BOUNDS: 9,
  DWMWA_CLOAKED: 14,
  PROCESS_QUERY_LIMITED_INFORMATION: 0x1000,
  TOKEN_QUERY: 0x0008,
  TOKEN_ELEVATION_CLASS: 20,
  INPUT_KEYBOARD: 1,
  KEYEVENTF_EXTENDEDKEY: 0x0001,
  KEYEVENTF_KEYUP: 0x0002,
  // HWND_TOPMOST는 (HWND)-1. koffi 3의 포인터는 BigInt라 64비트 부호 없는 값으로 넘긴다.
  HWND_TOPMOST: BigInt.asUintN(64, -1n),
  // GetAsyncKeyState 가상 키 코드(winuser.h)
  VK_LBUTTON: 0x01,
  VK_RBUTTON: 0x02,
  VK_MBUTTON: 0x04
} as const

/** UTF-16 문자열을 돌려주는 Win32 함수용 버퍼 읽기 */
export function readWide(fn: (buf: Buffer, max: number) => number, max = 512): string {
  const buf = Buffer.alloc(max * 2)
  const len = fn(buf, max)
  return len > 0 ? buf.toString('utf16le', 0, len * 2) : ''
}

export const toHwnd = (hwnd: string): Hwnd => BigInt(hwnd)
export const fromHwnd = (h: unknown): string | null => (h ? BigInt(h as bigint).toString() : null)

function bind(koffi: typeof Koffi) {
  const user32 = koffi.load('user32.dll')
  const kernel32 = koffi.load('kernel32.dll')
  const dwmapi = koffi.load('dwmapi.dll')
  const advapi32 = koffi.load('advapi32.dll')
  const shell32 = koffi.load('shell32.dll')

  const HANDLE = koffi.pointer('HANDLE', koffi.opaque())
  koffi.alias('HWND', HANDLE)
  const RECT = koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' })
  koffi.proto('bool __stdcall EnumWindowsProc(HWND hwnd, intptr_t lParam)')

  // 키보드 입력. INPUT(x64)은 type(4) + 패딩(4) + 공용체(32) = 40바이트이고, 키보드 입력만 쓰므로 KEYBDINPUT 배치를 직접 적는다.
  const KEYBOARD_INPUT = koffi.struct('KEYBOARD_INPUT', {
    type: 'uint32_t',
    _pad0: 'uint32_t',
    wVk: 'uint16_t',
    wScan: 'uint16_t',
    dwFlags: 'uint32_t',
    time: 'uint32_t',
    dwExtraInfo: 'uintptr_t',
    _pad1: 'uint64_t'
  })
  const KEYBOARD_INPUT_SIZE = koffi.sizeof(KEYBOARD_INPUT)
  if (KEYBOARD_INPUT_SIZE !== 40) throw new Error(`INPUT 크기가 40이 아님: ${KEYBOARD_INPUT_SIZE}`)

  return {
    ...CONSTANTS,
    readWide,
    toHwnd,
    fromHwnd,
    KEYBOARD_INPUT_SIZE,
    EnumWindows: user32.func('bool __stdcall EnumWindows(EnumWindowsProc *cb, intptr_t lParam)'),
    GetWindowTextW: user32.func('int __stdcall GetWindowTextW(HWND hWnd, void *lpString, int nMaxCount)'),
    GetClassNameW: user32.func('int __stdcall GetClassNameW(HWND hWnd, void *lpClassName, int nMaxCount)'),
    IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(HWND hWnd)'),
    IsWindow: user32.func('bool __stdcall IsWindow(HWND hWnd)'),
    IsIconic: user32.func('bool __stdcall IsIconic(HWND hWnd)'),
    IsZoomed: user32.func('bool __stdcall IsZoomed(HWND hWnd)'),
    GetWindow: user32.func('HWND __stdcall GetWindow(HWND hWnd, uint32_t uCmd)'),
    GetWindowLongPtrW: user32.func('intptr_t __stdcall GetWindowLongPtrW(HWND hWnd, int nIndex)'),
    GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(HWND hWnd, _Out_ uint32_t *lpdwProcessId)'),
    GetForegroundWindow: user32.func('HWND __stdcall GetForegroundWindow()'),
    SetForegroundWindow: user32.func('bool __stdcall SetForegroundWindow(HWND hWnd)'),
    ShowWindow: user32.func('bool __stdcall ShowWindow(HWND hWnd, int nCmdShow)'),
    GetWindowRect: user32.func('bool __stdcall GetWindowRect(HWND hWnd, _Out_ RECT *lpRect)'),
    SetWindowPos: user32.func('bool __stdcall SetWindowPos(HWND hWnd, HWND hWndInsertAfter, int X, int Y, int cx, int cy, uint32_t uFlags)'),
    GetDpiForWindow: user32.func('uint32_t __stdcall GetDpiForWindow(HWND hwnd)'),
    DwmGetWindowAttributeRect: dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'int32_t', [
      'HWND',
      'uint32_t',
      koffi.out(koffi.pointer(RECT)),
      'uint32_t'
    ]),
    DwmGetWindowAttributeDword: dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'int32_t', [
      'HWND',
      'uint32_t',
      koffi.out(koffi.pointer('uint32_t')),
      'uint32_t'
    ]),
    OpenProcess: kernel32.func('HANDLE __stdcall OpenProcess(uint32_t dwDesiredAccess, bool bInheritHandle, uint32_t dwProcessId)'),
    QueryFullProcessImageNameW: kernel32.func(
      'bool __stdcall QueryFullProcessImageNameW(HANDLE hProcess, uint32_t dwFlags, void *lpExeName, _Inout_ uint32_t *lpdwSize)'
    ),
    CloseHandle: kernel32.func('bool __stdcall CloseHandle(HANDLE hObject)'),
    OpenProcessToken: advapi32.func('bool __stdcall OpenProcessToken(HANDLE ProcessHandle, uint32_t DesiredAccess, _Out_ HANDLE *TokenHandle)'),
    GetTokenInformation: advapi32.func(
      'bool __stdcall GetTokenInformation(HANDLE TokenHandle, int TokenInformationClass, _Out_ uint32_t *TokenInformation, uint32_t TokenInformationLength, _Out_ uint32_t *ReturnLength)'
    ),
    SendInput: user32.func('uint32_t __stdcall SendInput(uint32_t cInputs, KEYBOARD_INPUT *pInputs, int cbSize)'),
    MapVirtualKeyW: user32.func('uint32_t __stdcall MapVirtualKeyW(uint32_t uCode, uint32_t uMapType)'),
    GetAsyncKeyState: user32.func('int16_t __stdcall GetAsyncKeyState(int vKey)'),
    /** HRESULT를 돌려준다(0이면 성공). QUERY_USER_NOTIFICATION_STATE는 int32 열거형이다. */
    SHQueryUserNotificationState: shell32.func('int32_t __stdcall SHQueryUserNotificationState(_Out_ int32_t *pquns)'),
    GetClipboardSequenceNumber: user32.func('uint32_t __stdcall GetClipboardSequenceNumber()'),
    /** 클립보드에 있는 형식 수. 0이면 비어 있다(OpenClipboard 없이 부를 수 있다). */
    CountClipboardFormats: user32.func('int __stdcall CountClipboardFormats()')
  }
}

export type Win32 = ReturnType<typeof bind>

// eslint-disable-next-line @typescript-eslint/no-require-imports
const native = lazyLoad(() => bind(require('koffi') as typeof Koffi))

export class NativeUnavailableError extends Error {
  constructor(reason: string) {
    super(`Win32 기능을 쓸 수 없음: ${reason}`)
    this.name = 'NativeUnavailableError'
  }
}

/** Win32 함수 묶음. 처음 부를 때 koffi를 불러오고, 불러오지 못했으면 NativeUnavailableError를 던진다. */
export function win32(): Win32 {
  const n = native.get()
  if (!n) throw new NativeUnavailableError(native.error() ?? 'unknown')
  return n
}

/** koffi를 쓸 수 있는지. 아직 안 불러왔으면 지금 불러 본다. */
export function nativeStatus(): { ok: true } | { ok: false; error: string } {
  return native.get() ? { ok: true } : { ok: false, error: native.error() ?? 'unknown' }
}
