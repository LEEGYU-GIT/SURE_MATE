import type { BarEdge } from '../../shared/bar/bar-settings'
import type { FlyoutPad } from '../../shared/flyout/flyout-content'
import type { Rect } from '../../shared/types'

export const FLYOUT_GAP = 8
export const FLYOUT_SCREEN_MARGIN = 8
export const FLYOUT_SHADOW_PAD = { top: 16, side: 24, bottom: 32 }
export const EDGE_CARD_MARGIN = 12
export const FLYOUT_MAX_HEIGHT = 560

type Size = { width: number; height: number }

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

function fitSize(size: Size, workArea: Rect): Size {
  return {
    width: Math.min(size.width, workArea.width - 2 * FLYOUT_SCREEN_MARGIN),
    height: Math.min(size.height, FLYOUT_MAX_HEIGHT, workArea.height - 2 * FLYOUT_SCREEN_MARGIN)
  }
}

/** 바 안쪽으로 8 DIP 떨어진 카드 사각형. 작업 영역 안(가장자리 8 DIP)으로 맞춘다. */
export function flyoutCardRect(o: { size: Size; anchor: Rect; bar: Rect; edge: BarEdge; workArea: Rect; align: 'center' | 'top' }): Rect {
  const { workArea: wa } = o
  const { width, height } = fitSize(o.size, wa)
  const rawX = o.edge === 'right' ? o.bar.x - FLYOUT_GAP - width : o.bar.x + o.bar.width + FLYOUT_GAP
  const rawY = o.align === 'top' ? o.anchor.y : o.anchor.y + o.anchor.height / 2 - height / 2
  const x = clamp(rawX, wa.x + FLYOUT_SCREEN_MARGIN, wa.x + wa.width - FLYOUT_SCREEN_MARGIN - width)
  const y = clamp(rawY, wa.y + FLYOUT_SCREEN_MARGIN, wa.y + wa.height - FLYOUT_SCREEN_MARGIN - height)
  return { x, y, width, height }
}

/** 바가 보이지 않을 때: 커서가 있는 모니터의 바 쪽 가장자리 위쪽 */
export function edgeCardRect(o: { size: Size; workArea: Rect; edge: BarEdge }): Rect {
  const { workArea: wa } = o
  const { width, height } = fitSize(o.size, wa)
  const x = o.edge === 'right' ? wa.x + wa.width - EDGE_CARD_MARGIN - width : wa.x + EDGE_CARD_MARGIN
  return { x, y: wa.y + EDGE_CARD_MARGIN, width, height }
}

/**
 * 카드 둘레에 그림자 여백을 붙인 투명 창 사각형(바 쪽 면에는 여백이 없다).
 * workArea를 주면 창이 작업 영역 밖(작업 표시줄 위 등)으로 나가지 않게 넘친 면의 여백만 줄인다.
 */
export function flyoutWindowRect(card: Rect, edge: BarEdge, workArea?: Rect): { window: Rect; pad: FlyoutPad } {
  const { top, side, bottom } = FLYOUT_SHADOW_PAD
  const pad: FlyoutPad = edge === 'right' ? { top, right: 0, bottom, left: side } : { top, right: side, bottom, left: 0 }
  if (workArea) {
    pad.left = Math.max(0, Math.min(pad.left, card.x - workArea.x))
    pad.top = Math.max(0, Math.min(pad.top, card.y - workArea.y))
    pad.right = Math.max(0, Math.min(pad.right, workArea.x + workArea.width - (card.x + card.width)))
    pad.bottom = Math.max(0, Math.min(pad.bottom, workArea.y + workArea.height - (card.y + card.height)))
  }
  return {
    pad,
    window: {
      x: card.x - pad.left,
      y: card.y - pad.top,
      width: card.width + pad.left + pad.right,
      height: card.height + pad.top + pad.bottom
    }
  }
}
