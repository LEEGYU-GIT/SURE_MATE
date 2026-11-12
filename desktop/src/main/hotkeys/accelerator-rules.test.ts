import { expect, it } from 'vitest'
import { acceleratorFromKey, NAMED_KEY_CODES } from '../../shared/hotkeys/accelerator-input'
import { acceleratorKeyCode, checkAccelerator } from './accelerator-rules'

it('규칙', () => {
  expect(checkAccelerator('Ctrl+Alt+Space')).toEqual({ level: 'ok' })
  for (const a of ['Super+Space', 'Ctrl+F12', 'AltGr+K', 'K', 'Shift+K']) expect(checkAccelerator(a).level).toBe('block')
  for (const a of ['Alt+Space', 'ctrl+space', 'Ctrl+Shift+Space']) expect(checkAccelerator(a).level).toBe('warn')
})

it('Ctrl + 글자·숫자 하나(Alt·Shift 없이)는 다른 앱 기능을 가로챈다고 경고한다(조합을 이름으로, 흔한 기능이면 함께)', () => {
  expect(checkAccelerator('Ctrl+G')).toEqual({ level: 'warn', reason: '다른 앱의 Ctrl+G 기능(찾기·이동 등)을 가로채요' })
  expect(checkAccelerator('ctrl+f')).toEqual({ level: 'warn', reason: '다른 앱의 Ctrl+F 기능(찾기 등)을 가로채요' })
  expect(checkAccelerator('Control+1')).toEqual({ level: 'warn', reason: '다른 앱의 Ctrl+1 기능(탭 이동 등)을 가로채요' })
  // 흔한 기능을 모르는 글자는 조합만
  expect(checkAccelerator('Ctrl+M')).toEqual({ level: 'warn', reason: '다른 앱의 Ctrl+M 기능을 가로채요' })
  for (const k of 'BDEHIJKLNOPQRTUW0123456789') expect(checkAccelerator(`Ctrl+${k}`), k).toMatchObject({ level: 'warn', reason: expect.stringContaining(`Ctrl+${k}`) })
  // Alt·Shift가 함께면(세 키 조합) 그대로 쓸 수 있다
  for (const a of ['Ctrl+Alt+G', 'Ctrl+Shift+G', 'Ctrl+Alt+1', 'Ctrl+Alt+Shift+K']) expect(checkAccelerator(a), a).toEqual({ level: 'ok' })
  // 글자·숫자가 아닌 주 키는 이 규칙 밖
  for (const a of ['Ctrl+F9', 'Ctrl+/', 'Ctrl+Up']) expect(checkAccelerator(a), a).toEqual({ level: 'ok' })
})

it('Ctrl+C·V·X·Z·Y·A·S(기본 편집 단축키)는 새로 고를 수 없다', () => {
  for (const k of 'CVXZYAS') expect(checkAccelerator(`Ctrl+${k}`), k).toEqual({ level: 'block', reason: '복사·붙여넣기 같은 기본 편집 단축키예요' })
  expect(checkAccelerator('control+v').level).toBe('block')
  expect(checkAccelerator('CmdOrCtrl+Z').level).toBe('block')
  // Shift·Alt가 함께면 편집 단축키가 아니다(경고도 없다)
  for (const a of ['Ctrl+Shift+C', 'Ctrl+Alt+V', 'Ctrl+Alt+S']) expect(checkAccelerator(a), a).toEqual({ level: 'ok' })
})

it('이미 저장한 조합을 등록할 때(saved): 기본 편집 단축키는 경고로 낮춘다(이 규칙 전에 저장한 단축키가 시작할 때 사라지지 않게). 원래 막던 조합은 그대로 막는다', () => {
  for (const k of 'CVXZYAS') expect(checkAccelerator(`Ctrl+${k}`, { saved: true }), k).toEqual({ level: 'warn', reason: '복사·붙여넣기 같은 기본 편집 단축키예요' })
  for (const a of ['Super+Space', 'Ctrl+F12', 'AltGr+K', 'K', 'Shift+K']) expect(checkAccelerator(a, { saved: true }).level, a).toBe('block')
  expect(checkAccelerator('Ctrl+G', { saved: true }).level).toBe('warn')
  expect(checkAccelerator('Ctrl+Alt+Space', { saved: true })).toEqual({ level: 'ok' })
})

it('Alt + 글자 하나(메뉴 단축키)는 경고한다', () => {
  expect(checkAccelerator('Alt+F')).toEqual({ level: 'warn', reason: '다른 앱의 Alt+F 기능(메뉴 열기 등)을 가로채요' })
  expect(checkAccelerator('alt+k')).toEqual({ level: 'warn', reason: '다른 앱의 Alt+K 기능(메뉴 열기 등)을 가로채요' })
  // Shift가 함께거나 글자가 아니면 이 규칙 밖(Alt+Space는 원래 경고)
  for (const a of ['Alt+Shift+F', 'Alt+1', 'Alt+`', 'Alt+F9']) expect(checkAccelerator(a), a).toEqual({ level: 'ok' })
  expect(checkAccelerator('Alt+Space').reason).toContain('Windows 창 메뉴')
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

it('키 녹화가 만드는 조합은 모두 주 키 코드를 안다(누르고 있는 동안의 자동 반복을 그대로 거른다)', () => {
  const codes = [
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => `Key${c}`),
    ...'0123456789'.split('').map((c) => `Digit${c}`),
    ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
    ...NAMED_KEY_CODES
  ]
  expect(NAMED_KEY_CODES).toContain('ArrowUp')
  for (const code of codes) {
    const r = acceleratorFromKey({ code, ctrlKey: true, altKey: true, shiftKey: true, metaKey: false, isComposing: false })
    if (!('acc' in r)) throw new Error(`${code}: 조합을 만들지 못함`)
    expect(acceleratorKeyCode(r.acc), r.acc).not.toBeNull()
  }
})
