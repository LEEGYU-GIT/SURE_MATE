export type BarShape = 'edge' | 'capsule' | 'off'
export type BarEdge = 'left' | 'right'
export interface BarPosition {
  display: string
  ratio: number
}

export interface BarSettings {
  shape: BarShape
  edge: BarEdge
  /** 'primary' 또는 display id */
  monitor: string
  /** 모니터별 마지막 세로 위치(0~1). 최근 것이 뒤, 16개까지. 객체가 아니라 배열인 이유: 숫자 문자열 키는 JS가 숫자 순으로 재정렬한다 */
  positions: BarPosition[]
  /** 바에 고정한 프롬프트 id, 0~5개 */
  pinnedPrompts: string[]
  autoHide: boolean
  /** 바 배경 불투명도 배율 */
  opacity: number
  wikiCardMs: number
  wikiCardWidth: number
}

export const BAR_LIMITS = {
  pinnedPrompts: 5,
  positions: 16,
  idLength: 64,
  opacity: { min: 0.6, max: 1 },
  wikiCardMs: { min: 3000, max: 60000 },
  wikiCardWidth: { min: 280, max: 560 }
} as const

const SHAPES: readonly BarShape[] = ['edge', 'capsule', 'off']
const EDGES: readonly BarEdge[] = ['left', 'right']

export const DEFAULT_BAR_SETTINGS: BarSettings = {
  shape: 'edge',
  edge: 'right',
  monitor: 'primary',
  positions: [],
  pinnedPrompts: ['meeting-notes', 'req-to-testcase', 'static-analysis'],
  autoHide: false,
  opacity: 1,
  wikiCardMs: 8000,
  wikiCardWidth: 360
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const idText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && v.length <= BAR_LIMITS.idLength
const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))
const num = (v: unknown, fallback: number, min: number, max: number, integer: boolean): number =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(integer ? Math.round(v) : v, min, max) : fallback

function sanitizePositions(v: unknown): BarPosition[] {
  if (!Array.isArray(v)) return []
  const out: BarPosition[] = []
  for (const item of v) {
    if (!isObj(item) || !idText(item.display) || typeof item.ratio !== 'number' || !Number.isFinite(item.ratio)) continue
    const display = item.display
    const at = out.findIndex((p) => p.display === display)
    if (at >= 0) out.splice(at, 1) // 같은 display는 뒤의 것만 남긴다
    out.push({ display, ratio: clamp(item.ratio, 0, 1) })
  }
  return out.slice(-BAR_LIMITS.positions)
}

/** 키별로 타입·범위가 맞는 값만 받고 나머지는 기본값으로 채운다. 돌려주는 배열은 항상 새 배열이다. */
export function sanitizeBarSettings(raw: unknown): BarSettings {
  const r = isObj(raw) ? raw : {}
  const d = DEFAULT_BAR_SETTINGS
  const pinned = Array.isArray(r.pinnedPrompts)
    ? [...new Set(r.pinnedPrompts.filter(idText))].slice(0, BAR_LIMITS.pinnedPrompts)
    : [...d.pinnedPrompts]
  return {
    shape: SHAPES.includes(r.shape as BarShape) ? (r.shape as BarShape) : d.shape,
    edge: EDGES.includes(r.edge as BarEdge) ? (r.edge as BarEdge) : d.edge,
    monitor: idText(r.monitor) ? r.monitor : d.monitor,
    positions: sanitizePositions(r.positions),
    pinnedPrompts: pinned,
    autoHide: typeof r.autoHide === 'boolean' ? r.autoHide : d.autoHide,
    opacity: num(r.opacity, d.opacity, BAR_LIMITS.opacity.min, BAR_LIMITS.opacity.max, false),
    wikiCardMs: num(r.wikiCardMs, d.wikiCardMs, BAR_LIMITS.wikiCardMs.min, BAR_LIMITS.wikiCardMs.max, true),
    wikiCardWidth: num(r.wikiCardWidth, d.wikiCardWidth, BAR_LIMITS.wikiCardWidth.min, BAR_LIMITS.wikiCardWidth.max, true)
  }
}

/** 그 display의 기존 위치를 지우고 맨 뒤에 추가한다(16개까지). */
export function withPosition(bar: BarSettings, display: string, ratio: number): BarSettings {
  const positions = [...bar.positions.filter((p) => p.display !== display), { display, ratio: clamp(ratio, 0, 1) }]
  return { ...bar, positions: positions.slice(-BAR_LIMITS.positions) }
}

export function nextBarShape(shape: BarShape): BarShape {
  return shape === 'edge' ? 'capsule' : shape === 'capsule' ? 'off' : 'edge'
}
