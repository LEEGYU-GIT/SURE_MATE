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

/**
 * 팔레트를 열 때 닫은 뒤 돌아갈 창(previousHwnd)을 정한다. Sure-Mate 창(펫·바·펼침 창)은 기억하지 않는다
 * (M6 최종 검토 I1: 펫 창으로 돌아가면 Esc 뒤 포커스가 펫에 남고 프롬프트가 펫 창에서 선택 글을 가져온다).
 * - 앞 창이 없거나(Win32 없음) 팔레트 자신이면(이미 열려 있다) 기억한 창을 그대로 둔다.
 * - 설정 창(첫 실행 안내 포함, isReturnable)이면 그 창: 사용자가 글을 고르고 입력하는 보통 창이라 Esc 뒤 그 창으로 돌아가고,
 *   프롬프트가 그 창에서 고른 글을 가져온다(첫 실행 안내의 따라 해 보기, 2026-11-12).
 * - 그 밖의 Sure-Mate 창이면 returnTo(펫 조종을 끝내며 돌려받은 창: 포커스 복귀가 아직 끝나지 않아 펫 창이 앞에 있을 때), 없으면 null.
 * - 사용자 창이면 그 창.
 */
export function paletteReturnTarget(o: {
  foreground: string | null
  palette: string | null
  current: string | null
  returnTo: string | null
  isOwn(hwnd: string): boolean
  /** Sure-Mate 창이지만 돌아갈 수 있는 창(설정 창). 없으면 모든 Sure-Mate 창을 기억하지 않는다 */
  isReturnable?(hwnd: string): boolean
}): string | null {
  const fg = o.foreground
  if (!fg || fg === o.palette) return o.current
  if (o.isReturnable?.(fg)) return fg
  return o.isOwn(fg) ? o.returnTo : fg
}
