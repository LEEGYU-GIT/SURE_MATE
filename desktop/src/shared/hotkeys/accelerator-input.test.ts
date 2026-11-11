import { expect, it } from 'vitest'
import { acceleratorFromKey, sameAccelerator } from './accelerator-input'

const k = (code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; isComposing: boolean }> = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  isComposing: false,
  ...mods
})

it('보조키 + 주 키를 Electron 조합 글로(Ctrl+Alt+Shift 순서)', () => {
  expect(acceleratorFromKey(k('Space', { ctrlKey: true, altKey: true }))).toEqual({ acc: 'Ctrl+Alt+Space' })
  expect(acceleratorFromKey(k('Backquote', { altKey: true }))).toEqual({ acc: 'Alt+`' })
  expect(acceleratorFromKey(k('KeyK', { ctrlKey: true, shiftKey: true }))).toEqual({ acc: 'Ctrl+Shift+K' })
  expect(acceleratorFromKey(k('Digit1', { altKey: true }))).toEqual({ acc: 'Alt+1' })
  expect(acceleratorFromKey(k('F9', { ctrlKey: true }))).toEqual({ acc: 'Ctrl+F9' })
  expect(acceleratorFromKey(k('Slash', { ctrlKey: true, altKey: true }))).toEqual({ acc: 'Ctrl+Alt+/' })
})

it('보조키만 누른 동안·한글 조합 중에는 기다린다', () => {
  for (const code of ['ControlLeft', 'AltLeft', 'ShiftRight', 'AltRight']) expect(acceleratorFromKey(k(code, { ctrlKey: true }))).toEqual({ pending: true })
  expect(acceleratorFromKey(k('KeyA', { ctrlKey: true, isComposing: true }))).toEqual({ pending: true })
})

it('Esc(보조키 없이)는 그만두기, Win 키 조합·보조키 없는 키·모르는 키는 안 됨', () => {
  expect(acceleratorFromKey(k('Escape'))).toEqual({ cancel: true })
  expect(acceleratorFromKey(k('KeyK', { metaKey: true, ctrlKey: true }))).toMatchObject({ invalid: expect.stringContaining('Windows') })
  expect(acceleratorFromKey(k('KeyK'))).toMatchObject({ invalid: expect.stringContaining('Ctrl') })
  expect(acceleratorFromKey(k('KeyK', { shiftKey: true }))).toMatchObject({ invalid: expect.stringContaining('Ctrl') })
  expect(acceleratorFromKey(k('IntlYen', { ctrlKey: true }))).toMatchObject({ invalid: expect.any(String) })
})

it('워크스페이스 단축키 녹화(M7): 숫자·글자·F키·기호·화살표, 보조키는 Ctrl·Alt·Shift 순서', () => {
  expect(acceleratorFromKey(k('Digit1', { ctrlKey: true, altKey: true }))).toEqual({ acc: 'Ctrl+Alt+1' })
  expect(acceleratorFromKey(k('KeyQ', { ctrlKey: true, shiftKey: true }))).toEqual({ acc: 'Ctrl+Shift+Q' })
  expect(acceleratorFromKey(k('F9', { altKey: true }))).toEqual({ acc: 'Alt+F9' })
  expect(acceleratorFromKey(k('Backquote', { altKey: true }))).toEqual({ acc: 'Alt+`' })
  expect(acceleratorFromKey(k('Space', { ctrlKey: true, altKey: true }))).toEqual({ acc: 'Ctrl+Alt+Space' })
  expect(acceleratorFromKey(k('ArrowUp', { ctrlKey: true, altKey: true }))).toEqual({ acc: 'Ctrl+Alt+Up' })
  // 보조키만 누른 동안은 조합이 아니다(기다림), 숫자 키패드·Win 키 조합은 안 됨
  expect(acceleratorFromKey(k('ControlLeft', { ctrlKey: true }))).toEqual({ pending: true })
  expect(acceleratorFromKey(k('Numpad1', { ctrlKey: true }))).toMatchObject({ invalid: expect.any(String) })
  expect(acceleratorFromKey(k('Digit1', { ctrlKey: true, altKey: true, metaKey: true }))).toMatchObject({ invalid: expect.stringContaining('Windows') })
})

it('sameAccelerator: 보조키 순서·대소문자·같은 뜻의 이름은 따지지 않는다', () => {
  expect(sameAccelerator('ctrl+alt+1', 'Alt+Ctrl+1')).toBe(true)
  expect(sameAccelerator('Ctrl+Alt+1', 'Ctrl+Alt+2')).toBe(false)
  expect(sameAccelerator('Control+Alt+q', 'Ctrl+Alt+Q')).toBe(true)
  expect(sameAccelerator('CmdOrCtrl+Alt+Esc', 'Ctrl+Alt+Escape')).toBe(true)
  expect(sameAccelerator(' Ctrl + Alt + Space ', 'Ctrl+Alt+Space')).toBe(true)
  // 보조키가 하나라도 다르면 다른 조합
  expect(sameAccelerator('Ctrl+Alt+1', 'Ctrl+Alt+Shift+1')).toBe(false)
  expect(sameAccelerator('Ctrl+Alt+1', 'Alt+1')).toBe(false)
  expect(sameAccelerator('Alt+`', 'Alt+Space')).toBe(false)
})
