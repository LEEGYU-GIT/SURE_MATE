import koffi from 'koffi'

// Task 8에서 windows.ts로 옮긴다. HWND는 koffi 3에서 BigInt, 밖으로는 10진 문자열로만 넘긴다.
const user32 = koffi.load('user32.dll')
const HANDLE = koffi.pointer('HANDLE', koffi.opaque())
koffi.alias('HWND', HANDLE)

const GetForegroundWindow = user32.func('HWND __stdcall GetForegroundWindow()')
const SetForegroundWindow = user32.func('bool __stdcall SetForegroundWindow(HWND hWnd)')
const IsWindow = user32.func('bool __stdcall IsWindow(HWND hWnd)')

export function getForegroundWindow(): string | null {
  const h = GetForegroundWindow()
  return h ? BigInt(h).toString() : null
}

export function setForeground(hwnd: string): boolean {
  const h = BigInt(hwnd)
  if (!IsWindow(h)) return false
  return Boolean(SetForegroundWindow(h))
}
