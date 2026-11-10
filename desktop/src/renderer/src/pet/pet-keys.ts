import type { PetKey } from '../../../shared/pet/pet-view'

/**
 * 조종 모드 키(설계 §14-2). 물리 키 위치(KeyboardEvent.code)로 읽어 한/영 상태·입력기와 무관하다.
 * e.key는 한글 입력 중 'Process'가 되거나 배열에 따라 달라지므로 쓰지 않는다.
 */
const CODES: ReadonlyMap<string, PetKey> = new Map([
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
  ['ArrowUp', 'up'],
  ['ArrowDown', 'down'],
  ['Space', 'jump'],
  ['Escape', 'end']
])

/** e.code → 펫 키. 그 밖의 키·빈 코드는 null */
export function keyFromCode(code: string): PetKey | null {
  return CODES.get(code) ?? null
}

export interface KeyTracker {
  /** keydown. 펫 키면 true(부르는 쪽이 기본 동작을 막는다). 자동 반복·이미 누른 키는 다시 보내지 않는다 */
  down(code: string, repeat: boolean): boolean
  /** keyup. 펫 키면 true. 조종 중에 누른 키만 뗌을 보낸다 */
  up(code: string): boolean
  /** 창이 포커스를 잃었다: 누르고 있던 키를 모두 뗀 것으로 한 번씩 보낸다(키가 눌린 채 남지 않게) */
  blur(): void
}

/**
 * 조종 중 렌더러의 키 입력을 main에 알린다(누름·뗌 한 번씩). 판단(걷기·뛰기·오르기)은 main이 한다.
 * 조종을 시작하기 전에 누르고 있던 키(단축키의 보조키 등)는 뗌도 보내지 않는다.
 */
export function createKeyTracker(send: (key: PetKey, down: boolean) => void): KeyTracker {
  const held = new Set<PetKey>()
  return {
    down(code, repeat) {
      const key = keyFromCode(code)
      if (!key) return false
      if (!repeat && !held.has(key)) {
        held.add(key)
        send(key, true)
      }
      return true
    },
    up(code) {
      const key = keyFromCode(code)
      if (!key) return false
      if (held.delete(key)) send(key, false)
      return true
    },
    blur() {
      const keys = [...held]
      held.clear()
      for (const key of keys) send(key, false)
    }
  }
}
