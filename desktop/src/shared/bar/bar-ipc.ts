const PHASES = ['start', 'move', 'end'] as const

/** 바 끌기 IPC 값 검사: 단계 셋 중 하나와 유한한 화면 y(DIP)만 받는다 */
export function parseBarDrag(phase: unknown, y: unknown): { phase: (typeof PHASES)[number]; screenY: number } | null {
  if (!PHASES.includes(phase as (typeof PHASES)[number])) return null
  if (typeof y !== 'number' || !Number.isFinite(y)) return null
  return { phase: phase as (typeof PHASES)[number], screenY: y }
}
