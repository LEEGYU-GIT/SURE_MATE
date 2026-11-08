import { expect, it } from 'vitest'
import { acceleratorKeyCode, checkAccelerator } from './accelerator-rules'

it('규칙', () => {
  expect(checkAccelerator('Ctrl+Alt+Space')).toEqual({ level: 'ok' })
  for (const a of ['Super+Space', 'Ctrl+F12', 'AltGr+K', 'K', 'Shift+K']) expect(checkAccelerator(a).level).toBe('block')
  for (const a of ['Alt+Space', 'ctrl+space', 'Ctrl+Shift+Space']) expect(checkAccelerator(a).level).toBe('warn')
})

it('단축키의 주 키를 가상 키 코드로 바꾼다(누르고 있는지 확인용)', () => {
  expect(acceleratorKeyCode('Ctrl+Alt+Space')).toBe(0x20)
  expect(acceleratorKeyCode('Alt+`')).toBe(0xc0)
  expect(acceleratorKeyCode('Ctrl+Alt+W')).toBe(0x57)
  expect(acceleratorKeyCode('ctrl+alt+w')).toBe(0x57)
  expect(acceleratorKeyCode('Ctrl+Shift+5')).toBe(0x35)
  expect(acceleratorKeyCode('Ctrl+Alt+F9')).toBe(0x78)
  expect(acceleratorKeyCode('Ctrl+Alt+Plus')).toBe(0xbb)
  expect(acceleratorKeyCode('Ctrl+Alt+MediaPlayPause')).toBeNull()
})
