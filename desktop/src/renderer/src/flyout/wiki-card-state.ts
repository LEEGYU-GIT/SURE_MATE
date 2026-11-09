import type { WikiCardEntry, WikiCardView } from '../../../shared/flyout/flyout-content'

/** 복사 표시('복사했어요')를 보여 주는 시간 */
export const COPIED_MS = 1500

export interface CardState {
  view: WikiCardView
  /** 본문에 보이는 용어. 목록 카드에서 아무 행도 열지 않았으면 null */
  current: WikiCardEntry | null
  /** 본문 아래 '다른 뜻·비슷한 용어' */
  others: WikiCardEntry[]
  copied: boolean
}

export type CardAction = { type: 'pick-other'; id: string } | { type: 'open-entry'; id: string } | { type: 'back' } | { type: 'copied' } | { type: 'copied-clear' }

export function initialCardState(view: WikiCardView): CardState {
  if (view.kind === 'best') return { view, current: view.best, others: view.others, copied: false }
  return { view, current: null, others: [], copied: false }
}

/** 위키 카드 안의 움직임: 다른 후보 고르기(이전 본문은 후보로), 목록 행 열기·뒤로, 복사 표시 */
export function cardReducer(s: CardState, a: CardAction): CardState {
  switch (a.type) {
    case 'pick-other': {
      const picked = s.others.find((e) => e.id === a.id)
      if (!picked || !s.current) return s
      return { ...s, current: picked, others: [s.current, ...s.others.filter((e) => e.id !== a.id)], copied: false }
    }
    case 'open-entry': {
      if (s.view.kind !== 'found') return s
      const entry = s.view.entries.find((e) => e.id === a.id)
      return entry ? { ...s, current: entry, copied: false } : s
    }
    case 'back':
      return s.view.kind === 'found' ? { ...s, current: null, copied: false } : s
    case 'copied':
      return { ...s, copied: true }
    case 'copied-clear':
      return { ...s, copied: false }
  }
}

/** 복사 표시를 켜고 COPIED_MS 뒤 끈다. 끄는 함수를 돌려준다(카드가 바뀌면 부른다) */
export function flashCopied(dispatch: (a: CardAction) => void): () => void {
  dispatch({ type: 'copied' })
  const timer = setTimeout(() => dispatch({ type: 'copied-clear' }), COPIED_MS)
  return () => clearTimeout(timer)
}
