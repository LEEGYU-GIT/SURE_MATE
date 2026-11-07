import koffi from 'koffi'

// Win32 바인딩은 이 파일에만 둔다. koffi 3에서 포인터(HWND, HANDLE)는 BigInt다.
const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')
const dwmapi = koffi.load('dwmapi.dll')
const advapi32 = koffi.load('advapi32.dll')

const HANDLE = koffi.pointer('HANDLE', koffi.opaque())
koffi.alias('HWND', HANDLE)
export const RECT = koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' })
koffi.proto('bool __stdcall EnumWindowsProc(HWND hwnd, intptr_t lParam)')

export type Hwnd = bigint
export type RawRect = { left: number; top: number; right: number; bottom: number }

export const GW_OWNER = 4
export const GWL_EXSTYLE = -20
export const WS_EX_TOOLWINDOW = 0x80
export const WS_EX_NOACTIVATE = 0x08000000
export const SW_RESTORE = 9
export const SW_MAXIMIZE = 3
export const SWP_NOSIZE = 0x0001
export const SWP_NOZORDER = 0x0004
export const SWP_NOACTIVATE = 0x0010
export const SWP_NOOWNERZORDER = 0x0200
export const DWMWA_EXTENDED_FRAME_BOUNDS = 9
export const DWMWA_CLOAKED = 14
export const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
export const TOKEN_QUERY = 0x0008
export const TOKEN_ELEVATION_CLASS = 20

export const EnumWindows = user32.func('bool __stdcall EnumWindows(EnumWindowsProc *cb, intptr_t lParam)')
export const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(HWND hWnd, void *lpString, int nMaxCount)')
export const GetClassNameW = user32.func('int __stdcall GetClassNameW(HWND hWnd, void *lpClassName, int nMaxCount)')
export const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(HWND hWnd)')
export const IsWindow = user32.func('bool __stdcall IsWindow(HWND hWnd)')
export const IsIconic = user32.func('bool __stdcall IsIconic(HWND hWnd)')
export const IsZoomed = user32.func('bool __stdcall IsZoomed(HWND hWnd)')
export const GetWindow = user32.func('HWND __stdcall GetWindow(HWND hWnd, uint32_t uCmd)')
export const GetWindowLongPtrW = user32.func('intptr_t __stdcall GetWindowLongPtrW(HWND hWnd, int nIndex)')
export const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(HWND hWnd, _Out_ uint32_t *lpdwProcessId)')
export const GetForegroundWindow = user32.func('HWND __stdcall GetForegroundWindow()')
export const SetForegroundWindow = user32.func('bool __stdcall SetForegroundWindow(HWND hWnd)')
export const ShowWindow = user32.func('bool __stdcall ShowWindow(HWND hWnd, int nCmdShow)')
export const GetWindowRect = user32.func('bool __stdcall GetWindowRect(HWND hWnd, _Out_ RECT *lpRect)')
export const SetWindowPos = user32.func(
  'bool __stdcall SetWindowPos(HWND hWnd, HWND hWndInsertAfter, int X, int Y, int cx, int cy, uint32_t uFlags)'
)
export const GetDpiForWindow = user32.func('uint32_t __stdcall GetDpiForWindow(HWND hwnd)')

export const DwmGetWindowAttributeRect = dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'int32_t', [
  'HWND',
  'uint32_t',
  koffi.out(koffi.pointer(RECT)),
  'uint32_t'
])
export const DwmGetWindowAttributeDword = dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'int32_t', [
  'HWND',
  'uint32_t',
  koffi.out(koffi.pointer('uint32_t')),
  'uint32_t'
])

export const OpenProcess = kernel32.func('HANDLE __stdcall OpenProcess(uint32_t dwDesiredAccess, bool bInheritHandle, uint32_t dwProcessId)')
export const QueryFullProcessImageNameW = kernel32.func(
  'bool __stdcall QueryFullProcessImageNameW(HANDLE hProcess, uint32_t dwFlags, void *lpExeName, _Inout_ uint32_t *lpdwSize)'
)
export const CloseHandle = kernel32.func('bool __stdcall CloseHandle(HANDLE hObject)')
export const OpenProcessToken = advapi32.func(
  'bool __stdcall OpenProcessToken(HANDLE ProcessHandle, uint32_t DesiredAccess, _Out_ HANDLE *TokenHandle)'
)
export const GetTokenInformation = advapi32.func(
  'bool __stdcall GetTokenInformation(HANDLE TokenHandle, int TokenInformationClass, _Out_ uint32_t *TokenInformation, uint32_t TokenInformationLength, _Out_ uint32_t *ReturnLength)'
)

/** UTF-16 문자열을 돌려주는 Win32 함수용 버퍼 읽기 */
export function readWide(fn: (buf: Buffer, max: number) => number, max = 512): string {
  const buf = Buffer.alloc(max * 2)
  const len = fn(buf, max)
  return len > 0 ? buf.toString('utf16le', 0, len * 2) : ''
}

export const toHwnd = (hwnd: string): Hwnd => BigInt(hwnd)
export const fromHwnd = (h: unknown): string | null => (h ? BigInt(h as bigint).toString() : null)
