/**
 * 바 화면(renderer)이 보낸 IPC 값 검사. renderer는 믿지 않으므로 main은 여기를 통과한 값만 쓴다.
 * 틀린 값은 null이고, main은 그 메시지를 버린다.
 */

/** 바 항목 id 최대 길이(펼침 창·팔레트 위키 IPC와 같은 200자) */
export const BAR_ID_MAX = 200

const DRAG_PHASES = ['start', 'move', 'end'] as const
type DragPhase = (typeof DRAG_PHASES)[number]

/**
 * 바 단추를 실행한 방식(로그용). up: 누르고 뗌, up-only: 누름 없이 뗌만 옴(Windows가 포커스를 받지 않는 창에
 * 누름을 보내지 않는 상태, 2026-11-16), click: 포인터 없이 온 click(화면 읽기 프로그램·자동화가 단추를 실행)
 */
export const BAR_PRESS_KINDS = ['up', 'up-only', 'click'] as const
export type BarPressKind = (typeof BAR_PRESS_KINDS)[number]

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** 바 항목 id(1~200자 문자열). 틀리면 null */
export function parseBarId(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= BAR_ID_MAX ? v : null
}

/** 바 단추를 실행한 방식. 정해진 값이 아니면 null(로그에만 쓰는 값이라 null이어도 실행은 한다) */
export function parseBarPress(v: unknown): BarPressKind | null {
  return BAR_PRESS_KINDS.includes(v as BarPressKind) ? (v as BarPressKind) : null
}

/** 마우스가 들어간 항목 id(1~200자) 또는 나감(null). 틀리면 null */
export function parseBarHover(v: unknown): { id: string | null } | null {
  if (v === null) return { id: null }
  const id = parseBarId(v)
  return id === null ? null : { id }
}

/** 마우스가 창에 들어감(true)·나감(false). boolean이 아니면 null */
export function parsePointer(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

/** 오른쪽 클릭한 세로 위치(바 창 안, DIP): 0 이상 유한수. 틀리면 null */
export function parseBarContextY(v: unknown): number | null {
  return isFiniteNumber(v) && v >= 0 ? v : null
}

/** 바 끌기: 정해진 단계와 유한한 화면 y(DIP, 위쪽 모니터는 음수). 틀리면 null */
export function parseBarDrag(phase: unknown, y: unknown): { phase: DragPhase; screenY: number } | null {
  if (!DRAG_PHASES.includes(phase as DragPhase) || !isFiniteNumber(y)) return null
  return { phase: phase as DragPhase, screenY: y }
}
