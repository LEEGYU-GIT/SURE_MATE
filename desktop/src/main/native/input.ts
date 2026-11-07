import { setTimeout as sleep } from 'node:timers/promises'
import * as w from './win32'

const VK = { CONTROL: 0x11, SHIFT: 0x10, MENU: 0x12, INSERT: 0x2d, C: 0x43, V: 0x56, LWIN: 0x5b, RWIN: 0x5c } as const
export type ChordKey = 'CONTROL' | 'SHIFT' | 'MENU' | 'INSERT' | 'C' | 'V'

/** Insert는 확장 키라 표시하지 않으면 숫자 키패드 0으로 해석된다 */
const EXTENDED = new Set<number>([VK.INSERT])

const isDown = (vk: number): boolean => (w.GetAsyncKeyState(vk) & 0x8000) !== 0

/**
 * 사용자가 누른 단축키의 Ctrl·Alt·Shift·Win이 떼어질 때까지 기다린다.
 * 그대로 Ctrl+C를 보내면 눌린 보조키와 섞여 Ctrl+Alt+C가 된다.
 */
export async function waitModifiersReleased(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  const mods = [VK.CONTROL, VK.SHIFT, VK.MENU, VK.LWIN, VK.RWIN]
  while (mods.some(isDown)) {
    if (Date.now() >= deadline) return false
    await sleep(10)
  }
  return true
}

function keyInput(vk: number, up: boolean): Record<string, number> {
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
  const codes = keys.map((k) => VK[k])
  const inputs = [...codes.map((vk) => keyInput(vk, false)), ...[...codes].reverse().map((vk) => keyInput(vk, true))]
  return w.SendInput(inputs.length, inputs, w.KEYBOARD_INPUT_SIZE)
}
