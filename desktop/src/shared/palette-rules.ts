import type { Rect } from './types'

type Size = { width: number; height: number }

/** 표시 직후 이 시간 안의 blur는 무시한다(포커스 전환 중 생기는 blur). */
export const BLUR_GRACE_MS = 150

/** 작업 영역 가로 가운데, 위에서 22% 지점. */
export function palettePosition(workArea: Rect, size: Size): Rect {
  return {
    x: workArea.x + Math.round((workArea.width - size.width) / 2),
    y: workArea.y + Math.round(workArea.height * 0.22),
    width: size.width,
    height: size.height
  }
}

/** 배율이 다른 모니터로 옮긴 뒤 창 크기가 어긋났는지(electron#27651). */
export function needsResize(actual: Size, expected: Size, tolerance: number): boolean {
  return Math.abs(actual.width - expected.width) > tolerance || Math.abs(actual.height - expected.height) > tolerance
}

export function shouldHideOnBlur(shownAt: number, now: number, devToolsOpen: boolean): boolean {
  if (devToolsOpen) return false
  return now - shownAt >= BLUR_GRACE_MS
}
