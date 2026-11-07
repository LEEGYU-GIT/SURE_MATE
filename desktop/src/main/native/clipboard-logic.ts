import type { WindowInfo } from '../../shared/types'

/** Ctrl+C가 "실행 중단"이 되는 터미널·콘솔 */
const TERMINAL_EXES = new Set([
  'windowsterminal.exe',
  'cmd.exe',
  'powershell.exe',
  'pwsh.exe',
  'conhost.exe',
  'openconsole.exe',
  'mintty.exe',
  'putty.exe',
  'wsl.exe'
])

const exeName = (exe: string): string => (exe.split(/[\\/]/).pop() ?? '').toLowerCase()

export function isTerminalExe(exe: string): boolean {
  return TERMINAL_EXES.has(exeName(exe))
}

/** 콘솔·터미널 창 클래스(클래식 콘솔, Windows Terminal, mintty, PuTTY) */
const TERMINAL_CLASSES = new Set(['consolewindowclass', 'cascadia_hosting_window_class', 'pseudoconsolewindow', 'mintty', 'putty'])
/** 콘솔 셸은 GUI 창(WinForms 사내 도구 등)도 띄우므로 실행 파일 이름만으로는 터미널로 보지 않는다 */
const SHELL_EXES = new Set(['cmd.exe', 'powershell.exe', 'pwsh.exe'])

export function isTerminalWindow(target: { exe: string; className: string }): boolean {
  if (TERMINAL_CLASSES.has((target.className ?? '').toLowerCase())) return true
  return isTerminalExe(target.exe) && !SHELL_EXES.has(exeName(target.exe))
}

/** 우리가 복사한 뒤 순번이 그대로면(사용자가 따로 복사하지 않았으면) 원래 클립보드를 되돌린다 */
export const shouldRestoreClipboard = (seqAfterOurCopy: number, seqNow: number): boolean => seqAfterOurCopy === seqNow

export type CaptureDecision = { action: 'capture' } | { action: 'skip'; reason: 'terminal' | 'elevated' | 'no-foreground' }

export function captureDecision(target: WindowInfo | null): CaptureDecision {
  if (!target) return { action: 'skip', reason: 'no-foreground' }
  if (isTerminalWindow(target)) return { action: 'skip', reason: 'terminal' }
  if (target.elevated === true) return { action: 'skip', reason: 'elevated' }
  return { action: 'capture' }
}

export type PasteDecision = { action: 'paste' } | { action: 'copy-only'; reason: 'target-gone' | 'elevated' }

export function pasteDecision(target: { exists: boolean; elevated: boolean | null }): PasteDecision {
  if (!target.exists) return { action: 'copy-only', reason: 'target-gone' }
  if (target.elevated === true) return { action: 'copy-only', reason: 'elevated' }
  return { action: 'paste' }
}
