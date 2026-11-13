import type { Rect } from './types'

export type Size = { width: number; height: number }

/** 확인 화면 창(2026-11-13): 처음 크기, 끌어서 줄일 수 있는 최소 크기(검색 목록과 같은 720×460), 작업 영역 가장자리 여백 */
export const CONFIRM_SIZE: Size = { width: 1040, height: 760 }
export const CONFIRM_MIN: Size = { width: 720, height: 460 }
const CONFIRM_MARGIN = 16

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/**
 * 확인 화면 창 자리: 지난번 크기(없으면 1040×760)를 최소 720×460 이상, 작업 영역에서 여백 16을 뺀 크기 이하로 맞춘다.
 * 작업 영역이 최소보다 작으면 작업 영역에 맞춘다(1280×720 150%). 검색 목록처럼 가로 가운데·위 22%에 두고, 아래 여백을 넘으면 위로 당긴다
 */
export function confirmBounds(workArea: Rect, saved: Size | null): Rect {
  const want = saved ?? CONFIRM_SIZE
  const maxW = workArea.width - 2 * CONFIRM_MARGIN
  const maxH = workArea.height - 2 * CONFIRM_MARGIN
  const width = clamp(want.width, Math.min(CONFIRM_MIN.width, maxW), maxW)
  const height = clamp(want.height, Math.min(CONFIRM_MIN.height, maxH), maxH)
  const top = Math.max(CONFIRM_MARGIN, Math.min(Math.round(workArea.height * 0.22), workArea.height - CONFIRM_MARGIN - height))
  return { x: workArea.x + Math.round((workArea.width - width) / 2), y: workArea.y + top, width, height }
}

/**
 * 창 크기가 바뀐 뒤(resized) 저장할 확인 화면 크기. 확인 화면이 보이는 동안 사용자가 끌어서 바꾼 크기만 저장한다:
 * 앱이 setBounds로 정한 크기에도 resized가 올 수 있으므로 마지막으로 정한 크기와 2 DIP 넘게 다를 때만(배율 반올림 오차)
 */
export function resizedConfirmSize(o: { mode: 'search' | 'confirm'; visible: boolean; actual: Size; lastSet: Size }): Size | null {
  if (o.mode !== 'confirm' || !o.visible || !needsResize(o.actual, o.lastSet, 2)) return null
  return { width: Math.round(o.actual.width), height: Math.round(o.actual.height) }
}

/** 설정 파일의 확인 화면 크기. 숫자가 아니거나 너비 320~8000·높이 240~8000 밖이면 null(기본 크기로 연다) */
export function parseConfirmSize(raw: unknown): Size | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { width, height } = raw as Record<string, unknown>
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height)) return null
  const w = Math.round(width)
  const h = Math.round(height)
  return w >= 320 && w <= 8000 && h >= 240 && h <= 8000 ? { width: w, height: h } : null
}

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
