/** 바에 고정할 수 있는 프롬프트 수(설계 문서 §14-1, 설정의 BAR_LIMITS와 같음) */
export const PINNED_MAX = 5

export type PinnedAction = { type: 'add'; id: string } | { type: 'remove'; id: string } | { type: 'move'; id: string; by: -1 | 1 }

/** 고정 프롬프트 목록 고치기: 5개까지·겹치지 않게 더하기, 빼기, 위아래 옮기기(끝에서 멈춤) */
export function pinnedPromptsReducer(list: string[], a: PinnedAction): string[] {
  switch (a.type) {
    case 'add':
      return list.includes(a.id) || list.length >= PINNED_MAX ? list : [...list, a.id]
    case 'remove':
      return list.filter((x) => x !== a.id)
    case 'move': {
      const i = list.indexOf(a.id)
      const j = i + a.by
      if (i < 0 || j < 0 || j >= list.length) return list
      const next = [...list]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    }
  }
}
