import type { Rect } from '../types'
import type { RatioRect } from './types'

export const RATIO_DIGITS = 4
export const MIN_VISIBLE_DIP = 48

const roundRatio = (v: number): number => Math.round(v * 10 ** RATIO_DIGITS) / 10 ** RATIO_DIGITS || 0

/** 작업 영역 기준 비율(소수 넷째 자리) */
export function toRatio(frame: Rect, workArea: Rect): RatioRect {
  return {
    x: roundRatio((frame.x - workArea.x) / workArea.width),
    y: roundRatio((frame.y - workArea.y) / workArea.height),
    w: roundRatio(frame.width / workArea.width),
    h: roundRatio(frame.height / workArea.height)
  }
}

export function fromRatio(r: RatioRect, workArea: Rect): Rect {
  return {
    x: Math.round(workArea.x + r.x * workArea.width),
    y: Math.round(workArea.y + r.y * workArea.height),
    width: Math.round(r.w * workArea.width),
    height: Math.round(r.h * workArea.height)
  }
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

/** 창의 일부와 제목 줄이 작업 영역 안에 보이게 한다 */
export function keepOnScreen(r: Rect, workArea: Rect, minVisible: number = MIN_VISIBLE_DIP): Rect {
  const right = workArea.x + workArea.width
  const bottom = workArea.y + workArea.height
  let { x, y, width, height } = r
  if (width > workArea.width) {
    width = workArea.width
    x = workArea.x
  } else {
    x = clamp(x, workArea.x - width + minVisible, right - minVisible)
  }
  if (height > workArea.height) {
    height = workArea.height
    y = workArea.y
  } else {
    y = clamp(y, workArea.y, bottom - minVisible)
  }
  return { x, y, width, height }
}
