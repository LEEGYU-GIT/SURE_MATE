import { setTimeout as sleep } from 'node:timers/promises'
import { acceleratorKeyCode } from '../hotkeys/accelerator-rules'
import { nativeStatus, win32 } from './win32'

const VK = { CONTROL: 0x11, SHIFT: 0x10, MENU: 0x12, INSERT: 0x2d, C: 0x43, V: 0x56, LWIN: 0x5b, RWIN: 0x5c, RETURN: 0x0d } as const
export type ChordKey = 'CONTROL' | 'SHIFT' | 'MENU' | 'INSERT' | 'C' | 'V'

/** Insert는 확장 키라 표시하지 않으면 숫자 키패드 0으로 해석된다 */
const EXTENDED = new Set<number>([VK.INSERT])
const MODIFIERS = [VK.CONTROL, VK.SHIFT, VK.MENU, VK.LWIN, VK.RWIN]

/** GetAsyncKeyState 결과(SHORT)의 최상위 비트가 "지금 눌림"이다. 하위 비트는 마지막 조회 이후 눌렸었다는 뜻이라 쓰지 않는다. */
export const keyStateDown = (state: number): boolean => (state & 0x8000) !== 0

const isDown = (vk: number): boolean => keyStateDown(win32().GetAsyncKeyState(vk))

/**
 * 사용자가 누른 단축키의 Ctrl·Alt·Shift·Win이 떼어질 때까지 기다린다.
 * 그대로 Ctrl+C를 보내면 눌린 보조키와 섞여 Ctrl+Alt+C가 된다.
 */
export async function waitModifiersReleased(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (MODIFIERS.some(isDown)) {
    if (Date.now() >= deadline) return false
    await sleep(10)
  }
  return true
}

/**
 * 팔레트에서 항목을 고른 Enter(키패드 Enter 포함)와 보조키가 떼어질 때까지 기다린다.
 * 누른 채로 팔레트를 숨기면 자동 반복 키가 원래 앱으로 간다. Win32를 못 쓰면 확인할 수 없으니 true.
 */
export async function waitPickKeysReleased(timeoutMs: number): Promise<boolean> {
  if (!nativeStatus().ok) return true
  const deadline = Date.now() + timeoutMs
  while (isDown(VK.RETURN) || MODIFIERS.some(isDown)) {
    if (Date.now() >= deadline) return false
    await sleep(10)
  }
  return true
}

/** 전역 단축키의 주 키를 아직 누르고 있는지(자동 반복 거르기용). 주 키를 모르면 보조키로 판단한다. */
export function isAcceleratorHeld(accelerator: string): boolean {
  const vk = acceleratorKeyCode(accelerator)
  return vk !== null ? isDown(vk) : MODIFIERS.some(isDown)
}

function keyInput(vk: number, up: boolean): Record<string, number> {
  const w = win32()
  return {
    type: w.INPUT_KEYBOARD,
    _pad0: 0,
    wVk: vk,
    // 스캔 코드가 없으면 받는 쪽에서 KeyboardEvent.code가 비는 앱이 있다
    wScan: w.MapVirtualKeyW(vk, 0),
    dwFlags: (up ? w.KEYEVENTF_KEYUP : 0) | (EXTENDED.has(vk) ? w.KEYEVENTF_EXTENDEDKEY : 0),
    time: 0,
    dwExtraInfo: 0,
    _pad1: 0
  }
}

/** 키를 차례로 누르고 거꾸로 뗀다. SendInput이 넣은 입력 수를 돌려준다. */
export function sendChord(keys: ChordKey[]): number {
  const w = win32()
  const codes = keys.map((k) => VK[k])
  const inputs = [...codes.map((vk) => keyInput(vk, false)), ...[...codes].reverse().map((vk) => keyInput(vk, true))]
  return w.SendInput(inputs.length, inputs, w.KEYBOARD_INPUT_SIZE)
}

/** 왼쪽·오른쪽·가운데 마우스 버튼 중 하나라도 눌렸는지(조회 함수를 주입해 시험한다) */
export function anyMouseButtonDown(getState: (vk: number) => number): boolean {
  return [0x01, 0x02, 0x04].some((vk) => keyStateDown(getState(vk)))
}

/** 마우스 버튼이 하나라도 눌려 있는지. Win32를 쓸 수 없으면 null */
export function mouseButtonDown(): boolean | null {
  if (!nativeStatus().ok) return null
  const w = win32()
  return anyMouseButtonDown((vk) => w.GetAsyncKeyState(vk))
}
