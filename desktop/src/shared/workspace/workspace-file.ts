import type { Rect } from '../types'
import { type MonitorRoleName, type SavedLayout, type SavedMonitor, type WindowRule, type Workspace, WORKSPACE_LIMITS as L, WORKSPACES_FORMAT } from './types'

// 오류 문구에는 순번과 고정 문구만 싣는다(이름·별칭·창 제목 금지).

const ID_RE = /^[A-Za-z0-9-]{1,64}$/
const ROLES: readonly string[] = ['primary', 'secondary', 'internal']
const FINGERPRINT_MAX = 400

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** 형식·판이 맞는 파일인지(맞지 않으면 파일 전체를 못 읽은 것으로 취급) */
export function isWorkspacesFile(raw: unknown): boolean {
  return isObj(raw) && raw.format === WORKSPACES_FORMAT && raw.version === 1 && Array.isArray(raw.workspaces)
}

function parseRect(v: unknown): Rect | null {
  if (!isObj(v) || !num(v.x) || !num(v.y) || !num(v.width) || !num(v.height) || v.width <= 0 || v.height <= 0) return null
  return { x: v.x, y: v.y, width: v.width, height: v.height }
}

function parseMonitor(v: unknown): SavedMonitor | null {
  if (!isObj(v) || typeof v.key !== 'string' || v.key.length < 1 || v.key.length > 64) return null
  if (typeof v.role !== 'string' || !ROLES.includes(v.role)) return null
  const bounds = parseRect(v.bounds)
  const workArea = parseRect(v.workArea)
  if (!bounds || !workArea || !num(v.scaleFactor) || v.scaleFactor < 0.5 || v.scaleFactor > 5) return null
  return { key: v.key, role: v.role as MonitorRoleName, bounds, workArea, scaleFactor: v.scaleFactor }
}

function validRegex(v: string): boolean {
  try {
    new RegExp(v, 'iu')
    return true
  } catch {
    return false
  }
}

const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined)

/** 규칙 하나. 건너뛰면 null(이유는 where 뒤에 붙인다) */
function parseRule(v: unknown, index: number, monitorKeys: Set<string>, errors: string[], where: string): WindowRule | null {
  const skip = (why: string): null => {
    errors.push(`${where} ${index + 1}번째 창 규칙 — ${why}해 건너뜀`)
    return null
  }
  if (!isObj(v)) return skip('형식이 달라')
  if (typeof v.id !== 'string' || !ID_RE.test(v.id)) return skip('id가 올바르지 않아')
  const m = v.match
  if (!isObj(m)) return skip('찾을 창 조건이 없어')
  const exe = str(m.exe, L.exe)
  if (!exe) return skip('실행 파일 이름이 없어')
  const match: WindowRule['match'] = { exe }
  const className = str(m.className, L.className)
  if (className) match.className = className
  const titleIncludes = str(m.titleIncludes, L.titleIncludes)
  if (titleIncludes) match.titleIncludes = titleIncludes
  if (typeof m.titleRegex === 'string' && m.titleRegex.length > 0) {
    if (m.titleRegex.length <= L.titleRegex && validRegex(m.titleRegex)) match.titleRegex = m.titleRegex
    else errors.push(`${where} ${index + 1}번째 창 규칙 — 제목 정규식이 올바르지 않아 그 칸만 뺌`)
  }
  const t = v.target
  if (!isObj(t) || typeof t.monitor !== 'string' || !monitorKeys.has(t.monitor)) return skip('대상 모니터가 없어')
  const r = t.rect
  if (!isObj(r) || !num(r.x) || !num(r.y) || !num(r.w) || !num(r.h)) return skip('위치 값이 올바르지 않아')
  if (r.x < -1 || r.x > 2 || r.y < -1 || r.y > 2 || r.w <= 0 || r.w > 2 || r.h <= 0 || r.h > 2) return skip('위치 값이 범위를 벗어나')
  const order = typeof v.order === 'number' && Number.isInteger(v.order) && v.order >= 0 ? v.order : index
  return {
    id: v.id,
    enabled: v.enabled !== false,
    match,
    savedTitle: typeof v.savedTitle === 'string' ? v.savedTitle.slice(0, L.title) : '',
    target: { monitor: t.monitor, rect: { x: r.x, y: r.y, w: r.w, h: r.h }, state: t.state === 'maximized' ? 'maximized' : 'normal' },
    order
  }
}

function parseLayout(v: unknown, errors: string[], where: string): SavedLayout | null {
  if (!isObj(v) || !Array.isArray(v.monitors) || !Array.isArray(v.windows)) {
    errors.push(`${where} 배치 형식이 달라 건너뜀`)
    return null
  }
  if (v.monitors.length > L.monitors) errors.push(`${where} 모니터가 ${L.monitors}개를 넘어 앞의 ${L.monitors}개만 읽음`)
  const monitors: SavedMonitor[] = []
  v.monitors.slice(0, L.monitors).forEach((m, i) => {
    const p = parseMonitor(m)
    if (p && !monitors.some((x) => x.key === p.key)) monitors.push(p)
    else errors.push(`${where} ${i + 1}번째 모니터 — 값이 올바르지 않아 건너뜀`)
  })
  if (monitors.length === 0) {
    errors.push(`${where} 읽을 수 있는 모니터가 없어 배치를 건너뜀`)
    return null
  }
  if (v.windows.length > L.windows) errors.push(`${where} 창 규칙이 ${L.windows}개를 넘어 앞의 ${L.windows}개만 읽음`)
  const keys = new Set(monitors.map((m) => m.key))
  const windows: WindowRule[] = []
  v.windows.slice(0, L.windows).forEach((w, i) => {
    const r = parseRule(w, i, keys, errors, where)
    if (!r) return
    if (windows.some((x) => x.id === r.id)) errors.push(`${where} ${i + 1}번째 창 규칙 — id가 겹쳐 건너뜀`)
    else windows.push(r)
  })
  return { monitors, windows }
}

function parseWorkspace(v: unknown, n: number, errors: string[]): Workspace | null {
  const where = `workspaces.json: ${n}번째 워크스페이스`
  if (!isObj(v)) {
    errors.push(`${where} — 형식이 달라 건너뜀`)
    return null
  }
  if (typeof v.id !== 'string' || !ID_RE.test(v.id)) {
    errors.push(`${where} — id가 올바르지 않아 건너뜀`)
    return null
  }
  const name = typeof v.name === 'string' ? v.name.trim().slice(0, L.name).trim() : ''
  if (!name) {
    errors.push(`${where} — 이름이 없어 건너뜀`)
    return null
  }
  const aliases: string[] = []
  if (Array.isArray(v.aliases)) {
    const seen = new Set<string>()
    for (const a of v.aliases) {
      if (typeof a !== 'string') continue
      const t = a.trim()
      if (!t || t.length > L.alias || seen.has(t.toLowerCase())) continue
      seen.add(t.toLowerCase())
      aliases.push(t)
      if (aliases.length >= L.aliases) break
    }
  }
  const hotkey = typeof v.hotkey === 'string' && v.hotkey.length > 0 && v.hotkey.length <= 40 ? v.hotkey : null
  const t = typeof v.updatedAt === 'string' ? new Date(v.updatedAt) : null
  const updatedAt = t && !Number.isNaN(t.getTime()) ? v.updatedAt as string : new Date(0).toISOString()
  const layouts: Record<string, SavedLayout> = {}
  if (isObj(v.layouts)) {
    for (const [fp, raw] of Object.entries(v.layouts)) {
      if (fp.length === 0 || fp.length > FINGERPRINT_MAX) {
        errors.push(`${where} — 모니터 구성 키가 길어 그 배치를 건너뜀`)
        continue
      }
      const layout = parseLayout(raw, errors, where)
      if (layout) layouts[fp] = layout
    }
  }
  return { id: v.id, name, aliases, hotkey, layouts, updatedAt }
}

/** workspaces.json의 내용을 검증해 읽을 수 있는 것만 돌려준다. 오류 문구에는 순번만 싣는다 */
export function parseWorkspaces(raw: unknown): { workspaces: Workspace[]; errors: string[] } {
  if (!isWorkspacesFile(raw)) return { workspaces: [], errors: ['workspaces.json: 형식이나 판이 달라 읽지 못함'] }
  const list = (raw as { workspaces: unknown[] }).workspaces
  const errors: string[] = []
  const workspaces: Workspace[] = []
  if (list.length > L.workspaces) errors.push(`workspaces.json: 워크스페이스가 ${L.workspaces}개를 넘어 앞의 ${L.workspaces}개만 읽음`)
  list.slice(0, L.workspaces).forEach((item, i) => {
    const w = parseWorkspace(item, i + 1, errors)
    if (!w) return
    if (workspaces.some((x) => x.id === w.id)) errors.push(`workspaces.json: ${i + 1}번째 워크스페이스 — id가 겹쳐 건너뜀`)
    else workspaces.push(w)
  })
  return { workspaces, errors }
}

/** '배치 1'부터 쓰지 않은 가장 작은 번호 */
export function nextWorkspaceName(existing: Pick<Workspace, 'name'>[]): string {
  const used = new Set(existing.map((w) => w.name))
  for (let n = 1; ; n++) if (!used.has(`배치 ${n}`)) return `배치 ${n}`
}
