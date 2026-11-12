import { acceleratorFromKey, isModifierCode, type KeyInput } from './accelerator-input'

// 녹화 칸이 받지 못한 조합 가려내기(설정 창 단축키 녹화). 다른 프로그램이 전역 단축키(RegisterHotKey)로 잡은 조합은 Windows가
// 주 키의 keydown을 그 프로그램에 넘겨 녹화 칸에는 보조키만 온다. 대개 주 키의 keyup은 오므로 그것으로 조합을 알아내고,
// keyup마저 오지 않으면 보조키를 모두 뗄 때 주 키가 하나도 오지 않았다고 알린다. Win 키 조합도 OS가 가져가 같은 모양이다.

/** 녹화 칸이 받은 키 이벤트 하나(keydown·keyup) */
export type RecordKey = KeyInput & { type: 'keydown' | 'keyup' }

/**
 * pending: 기다림(보조키를 누르거나 떼는 중, 또는 볼 것 없는 keyup).
 * combo: 주 키의 keydown이 왔다(녹화 칸이 하던 대로 조합을 만들어 검사한다).
 * swallowed: Ctrl·Alt(·Win)를 누른 채 keydown 없이 keyup만 왔다(다른 프로그램이 가져감). acc는 그 keyup의 코드·보조키로 만든 조합.
 * invalid: 그 keyup으로 본 조합을 녹화할 수 없다(Win 키 조합·모르는 키). reason은 acceleratorFromKey의 까닭.
 * nothing-arrived: Ctrl이나 Alt를 누른 동안 주 키가 하나도(keydown도 keyup도) 오지 않고 보조키를 모두 뗐다.
 * held는 그동안 누른 보조키('Ctrl+Alt', Ctrl·Alt·Shift 순서)
 */
export type RecordWatchResult =
  | { kind: 'pending' }
  | { kind: 'combo' }
  | { kind: 'swallowed'; acc: string }
  | { kind: 'invalid'; reason: string }
  | { kind: 'nothing-arrived'; held: string }

export interface RecordWatch {
  feed(e: RecordKey): RecordWatchResult
}

const PENDING: RecordWatchResult = { kind: 'pending' }

/**
 * 누름(보조키를 하나도 누르지 않은 상태에서 누르기 시작해 모두 뗄 때까지)마다 주 키가 들어왔는지 본다. 녹화 칸이 열려 있는 동안
 * 모든 keydown·keyup을 차례로 먹인다(검사 중이라 칸이 키를 무시할 때도: keydown이 온 키를 기억해야 keyup만 온 키를 가려낸다)
 */
export function createRecordWatch(): RecordWatch {
  /** keydown이 온 주 키(e.code). keyup이 오면 뺀다 */
  const down = new Set<string>()
  /** 보조키를 누르고 있는 누름 안인지 */
  let active = false
  /** 이번 누름에 누른 보조키 */
  let seen = { ctrl: false, alt: false, shift: false }
  /** 이번 누름에 주 키가 들어왔는지(keydown이든 keyup이든) */
  let mainArrived = false

  return {
    feed(e) {
      const anyHeld = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey
      if (anyHeld && !active) {
        active = true
        seen = { ctrl: false, alt: false, shift: false }
        mainArrived = false
      }
      if (active) seen = { ctrl: seen.ctrl || e.ctrlKey, alt: seen.alt || e.altKey, shift: seen.shift || e.shiftKey }

      if (isModifierCode(e.code)) {
        // 보조키를 누르거나 일부만 뗐다. 짝 없는 keyup(칸에 오기 전에 누른 보조키)도 넘긴다
        if (anyHeld || !active) return PENDING
        // 보조키를 모두 뗐다: 이번 누름 끝
        active = false
        if ((seen.ctrl || seen.alt) && !mainArrived) {
          const held = [seen.ctrl && 'Ctrl', seen.alt && 'Alt', seen.shift && 'Shift'].filter(Boolean).join('+')
          return { kind: 'nothing-arrived', held }
        }
        return PENDING
      }

      if (active) mainArrived = true
      if (e.type === 'keydown') {
        down.add(e.code)
        return { kind: 'combo' }
      }
      // keydown이 온 키를 뗐다(보조키를 누르기 전부터 누르고 있던 키 포함)
      if (down.delete(e.code)) return PENDING
      // 보조키 없이 뗀 키(칸에 오기 전에 누른 Enter 등)·Shift만 누른 키는 가져간 조합이 아니다
      if (!e.ctrlKey && !e.altKey && !e.metaKey) return PENDING
      const r = acceleratorFromKey(e)
      if ('acc' in r) return { kind: 'swallowed', acc: r.acc }
      if ('invalid' in r) return { kind: 'invalid', reason: r.invalid }
      return PENDING
    }
  }
}
