import type { MonitorInfo, Rect } from './types'

export type Insets = { left: number; top: number; right: number; bottom: number }

export function leftHalf(area: Rect): Rect {
  return { x: area.x, y: area.y, width: Math.floor(area.width / 2), height: area.height }
}

/** GetWindowRect(보이지 않는 테두리 포함)와 DWM 프레임(보이는 테두리)의 차이. */
export function frameInsets(windowRect: Rect, frameRect: Rect): Insets {
  return {
    left: frameRect.x - windowRect.x,
    top: frameRect.y - windowRect.y,
    right: windowRect.x + windowRect.width - (frameRect.x + frameRect.width),
    bottom: windowRect.y + windowRect.height - (frameRect.y + frameRect.height)
  }
}

/** 보이는 테두리가 target에 맞도록 SetWindowPos에 넘길 사각형. */
export function applyFrameInsets(target: Rect, insets: Insets): Rect {
  return {
    x: target.x - insets.left,
    y: target.y - insets.top,
    width: target.width + insets.left + insets.right,
    height: target.height + insets.top + insets.bottom
  }
}

export function pickOtherMonitor(monitors: MonitorInfo[], currentId: string): MonitorInfo | null {
  return monitors.find((m) => m.id !== currentId) ?? null
}

/** 두 사각형의 네 값 차이 중 가장 큰 절댓값. */
export function rectDiff(a: Rect, b: Rect): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height))
}
