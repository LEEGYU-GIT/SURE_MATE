/**
 * 바 화면(renderer)이 보낸 IPC 값 검사. renderer는 믿지 않으므로 main은 여기를 통과한 값만 쓴다.
 * 틀린 값은 null이고, main은 그 메시지를 버린다.
 */

/** 바 항목 id 최대 길이(펼침 창·팔레트 위키 IPC와 같은 200자) */
export const BAR_ID_MAX = 200

const DRAG_PHASES = ['start', 'move', 'end'] as const
type DragPhase = (typeof DRAG_PHASES)[number]

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** 바 항목 id(1~200자 문자열). 틀리면 null */
export function parseBarId(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= BAR_ID_MAX ? v : null
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
