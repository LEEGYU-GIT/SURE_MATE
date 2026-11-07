import { expect, it } from 'vitest'
import type { WindowInfo } from '../../shared/types'
import { captureDecision, isTerminalExe, pasteDecision, shouldRestoreClipboard } from './clipboard-logic'

it('터미널 판별', () => {
  for (const e of ['WindowsTerminal.exe', 'C:\\Windows\\System32\\cmd.exe', 'powershell.exe', 'pwsh.exe', 'conhost.exe', 'mintty.exe', 'putty.exe'])
    expect(isTerminalExe(e), e).toBe(true)
  expect(isTerminalExe('WINWORD.EXE')).toBe(false)
})

it('사용자가 그사이 복사했으면 되돌리지 않는다', () => {
  expect(shouldRestoreClipboard(42, 42)).toBe(true)
  expect(shouldRestoreClipboard(42, 43)).toBe(false)
})

it('가져오기 대상 판단', () => {
  const w = (exe: string, elevated: boolean | null, className = 'Notepad'): WindowInfo => ({ exe, elevated, className }) as WindowInfo
  expect(captureDecision(null)).toEqual({ action: 'skip', reason: 'no-foreground' })
  expect(captureDecision(w('cmd.exe', false, 'ConsoleWindowClass'))).toEqual({ action: 'skip', reason: 'terminal' })
  expect(captureDecision(w('notepad.exe', true))).toEqual({ action: 'skip', reason: 'elevated' })
  expect(captureDecision(w('notepad.exe', false))).toEqual({ action: 'capture' })
})

it('터미널은 창 클래스로 판단하고, 셸이 띄운 GUI 창은 가져온다', () => {
  const w = (exe: string, className: string): WindowInfo => ({ exe, className, elevated: false }) as WindowInfo
  expect(captureDecision(w('powershell.exe', 'WindowsForms10.Window.8.app.0.141b42a_r6_ad1'))).toEqual({ action: 'capture' })
  expect(captureDecision(w('powershell.exe', 'ConsoleWindowClass'))).toEqual({ action: 'skip', reason: 'terminal' })
  expect(captureDecision(w('WindowsTerminal.exe', 'CASCADIA_HOSTING_WINDOW_CLASS'))).toEqual({ action: 'skip', reason: 'terminal' })
  expect(captureDecision(w('mintty.exe', 'mintty'))).toEqual({ action: 'skip', reason: 'terminal' })
})

it('붙여넣기 대상 판단', () => {
  expect(pasteDecision({ exists: false, elevated: null })).toEqual({ action: 'copy-only', reason: 'target-gone' })
  expect(pasteDecision({ exists: true, elevated: true })).toEqual({ action: 'copy-only', reason: 'elevated' })
  expect(pasteDecision({ exists: true, elevated: false })).toEqual({ action: 'paste' })
})
