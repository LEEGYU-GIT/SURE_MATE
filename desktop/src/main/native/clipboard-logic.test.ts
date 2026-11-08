import { expect, it } from 'vitest'
import type { WindowInfo } from '../../shared/types'
import { captureDecision, isTerminalExe, pasteDecision, restoreAction, shouldRestoreClipboard } from './clipboard-logic'

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

it('사내에서 흔한 SSH·터미널 프로그램도 터미널로 보고 가져오지 않는다', () => {
  const w = (exe: string): WindowInfo => ({ exe, className: 'SomeWindowClass', elevated: false }) as WindowInfo
  for (const e of [
    'MobaXterm.exe',
    'MobaXterm_Personal_24.2.exe',
    'SecureCRT.exe',
    'Xshell.exe',
    'ConEmu64.exe',
    'ConEmu.exe',
    'alacritty.exe',
    'wezterm-gui.exe',
    'Tabby.exe',
    'Hyper.exe',
    'mRemoteNG.exe',
    'kitty.exe',
    'Termius.exe'
  ])
    expect(captureDecision(w(e)), e).toEqual({ action: 'skip', reason: 'terminal' })
})

it('통합 터미널이 있는 편집기(VS Code·JetBrains·Visual Studio)에서는 Ctrl+Insert로만 가져온다', () => {
  const w = (exe: string): WindowInfo => ({ exe, className: 'Chrome_WidgetWin_1', elevated: false }) as WindowInfo
  for (const e of ['C:\\Program Files\\Microsoft VS Code\\Code.exe', 'Code - Insiders.exe', 'Cursor.exe', 'idea64.exe', 'pycharm64.exe', 'clion64.exe', 'rider64.exe', 'studio64.exe', 'devenv.exe'])
    expect(captureDecision(w(e)), e).toEqual({ action: 'capture', insertOnly: true })
  expect(captureDecision(w('notepad.exe'))).toEqual({ action: 'capture' })
  expect(captureDecision(w('chrome.exe'))).toEqual({ action: 'capture' })
})

it('붙여넣기 대상 판단', () => {
  expect(pasteDecision({ exists: false, elevated: null })).toEqual({ action: 'copy-only', reason: 'target-gone' })
  expect(pasteDecision({ exists: true, elevated: true })).toEqual({ action: 'copy-only', reason: 'elevated' })
  expect(pasteDecision({ exists: true, elevated: false })).toEqual({ action: 'paste' })
})

it('대상이 관리자 권한이어도 Sure-Mate도 관리자 권한이면 막히지 않는다(UAC가 꺼진 PC)', () => {
  const w = (elevated: boolean | null): WindowInfo => ({ exe: 'notepad.exe', className: 'Notepad', elevated }) as WindowInfo
  expect(captureDecision(w(true), true)).toEqual({ action: 'capture' })
  expect(captureDecision(w(true), false)).toEqual({ action: 'skip', reason: 'elevated' })
  expect(captureDecision(w(true), null)).toEqual({ action: 'skip', reason: 'elevated' })
  expect(pasteDecision({ exists: true, elevated: true }, true)).toEqual({ action: 'paste' })
  expect(pasteDecision({ exists: true, elevated: true }, false)).toEqual({ action: 'copy-only', reason: 'elevated' })
})

it('클립보드 되돌리기: 비어 있었으면 비우고, 되돌릴 형식이 없으면(탐색기 파일 복사 등) 건드리지 않는다', () => {
  expect(restoreAction({ formatCount: 0, restorableTypes: 0 })).toBe('clear')
  expect(restoreAction({ formatCount: 3, restorableTypes: 0 })).toBe('leave')
  expect(restoreAction({ formatCount: 5, restorableTypes: 2 })).toBe('write')
})
