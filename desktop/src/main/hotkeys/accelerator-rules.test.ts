import { expect, it } from 'vitest'
import { checkAccelerator } from './accelerator-rules'

it('규칙', () => {
  expect(checkAccelerator('Ctrl+Alt+Space')).toEqual({ level: 'ok' })
  for (const a of ['Super+Space', 'Ctrl+F12', 'AltGr+K', 'K', 'Shift+K']) expect(checkAccelerator(a).level).toBe('block')
  for (const a of ['Alt+Space', 'ctrl+space', 'Ctrl+Shift+Space']) expect(checkAccelerator(a).level).toBe('warn')
})
