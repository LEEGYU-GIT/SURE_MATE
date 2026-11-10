import { expect, it } from 'vitest'
import { acceleratorFromKey } from './accelerator-input'

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
