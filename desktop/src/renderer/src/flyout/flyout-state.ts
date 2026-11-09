import type { FlyoutContent, FlyoutMessage, FlyoutPad } from '../../../shared/flyout/flyout-content'

/**
 * 앞 이름표가 보인 뒤 이 시간 안에 오는 이름표는 들어오는 움직임 없이 바로 보인다.
 * 바를 훑을 때 main은 다음 이름표를 기다리지 않고 띄우므로(이어지는 이름표) 화면도 다시 흐려졌다 나타나지 않는다.
 */
export const LABEL_CHAIN_MS = 1000

export interface FlyoutViewState {
  /** 지금 그리는 메시지 */
  message: FlyoutMessage | null
  /** main이 창을 띄웠다(shown) — data-open */
  open: boolean
  /** 들어오는 움직임 없이 바로 보인다 */
  instant: boolean
  /** 마지막으로 이름표가 보인 시각(ms) */
  labelShownAt: number | null
}

export type FlyoutViewAction =
  /** 창이 뜬 뒤 처음 물어 받은 내용(getFlyoutContent) */
  | { type: 'initial'; message: FlyoutMessage }
  /** main이 보낸 내용(onFlyoutContent). at: 받은 시각(ms) */
  | { type: 'content'; message: FlyoutMessage; at: number }
  /** main이 창을 배치하고 띄웠다(onFlyoutShown) */
  | { type: 'shown'; seq: number; at: number }

export const initialFlyoutState: FlyoutViewState = { message: null, open: false, instant: false, labelShownAt: null }

const samePad = (a: FlyoutPad, b: FlyoutPad): boolean => a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left

/**
 * 위키 카드의 고정만 바뀐 새 내용인지(같은 카드 번호). main은 이때 창을 다시 띄우지 않아 shown을 보내지 않는다.
 * 내용을 비교하지 않는 이유: main은 카드를 숨길 때 화면에 알리지 않으므로, 숨긴 뒤 같은 글로 다시 찾은 카드는
 * 내용이 같아도 새 카드다(들어오는 움직임과 처음 상태로)
 */
function onlyPinChanged(a: FlyoutContent, b: FlyoutContent): boolean {
  return a.kind === 'wiki-card' && b.kind === 'wiki-card' && a.cardId === b.cardId
}

/**
 * 펼침 창 화면 상태.
 * - 같은 seq가 다시 오면 그림자 여백(pad)이나 바 쪽(edge)만 바뀐 것이다: 다르면 그 둘만 바꾸고 내용은 그대로 둔다.
 * - 새 seq는 shown(seq)을 받을 때까지 감춘다(창 크기·자리가 새 내용에 맞춰지기 전에 비치지 않게). 닫힘에는 움직임이 없다.
 * - 창이 뜬 뒤 처음 물어 받은 내용은 이미 보이는 창일 수 있어 바로 보인다.
 */
export function flyoutReducer(state: FlyoutViewState, action: FlyoutViewAction): FlyoutViewState {
  switch (action.type) {
    case 'initial':
      // 그 사이 main이 보낸 더 새 내용을 옛 응답으로 덮지 않는다
      if (state.message) return state
      return { ...state, message: action.message, open: true, instant: true }
    case 'content': {
      const m = action.message
      const cur = state.message
      if (cur && m.seq === cur.seq) {
        if (samePad(cur.pad, m.pad) && cur.edge === m.edge) return state
        return { ...state, message: { ...cur, pad: m.pad, edge: m.edge } }
      }
      const inPlace = state.open && cur !== null && onlyPinChanged(cur.content, m.content)
      const chained =
        m.content.kind === 'label' && cur?.content.kind === 'label' && state.labelShownAt !== null && action.at - state.labelShownAt <= LABEL_CHAIN_MS
      return { ...state, message: m, open: inPlace, instant: inPlace || chained }
    }
    case 'shown': {
      const cur = state.message
      if (!cur || cur.seq !== action.seq || state.open) return state
      return { ...state, open: true, labelShownAt: cur.content.kind === 'label' ? action.at : state.labelShownAt }
    }
  }
}
