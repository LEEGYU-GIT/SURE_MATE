import type { MonitorInfo, Rect } from '../types'
import type { MonitorRoleName, SavedMonitor } from './types'

export function monitorKey(m: MonitorInfo): string {
  const w = Math.round(m.bounds.width * m.scaleFactor)
  const h = Math.round(m.bounds.height * m.scaleFactor)
  const pct = Math.round(m.scaleFactor * 100)
  return `${w}x${h}@${pct}${m.isInternal ? 'i' : ''}:${Math.round(m.bounds.x)},${Math.round(m.bounds.y)}`
}

/** 모니터 수와 정렬한 키로 만든 구성 지문 */
export function monitorFingerprint(monitors: MonitorInfo[]): string {
  const keys = monitors.map(monitorKey).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return `${monitors.length}|${keys.join('|')}`
}

export function monitorRole(m: MonitorInfo): MonitorRoleName {
  if (m.isPrimary) return 'primary'
  return m.isInternal ? 'internal' : 'secondary'
}

export function toSavedMonitor(m: MonitorInfo): SavedMonitor {
  return {
    key: monitorKey(m),
    role: monitorRole(m),
    bounds: { ...m.bounds },
    workArea: { ...m.workArea },
    scaleFactor: m.scaleFactor
  }
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** 가장 많이 겹치는 모니터 순번(동률이면 앞쪽), 없으면 -1 */
export function monitorOfRect(r: Rect, monitors: { bounds: Rect }[]): number {
  let best = -1
  let bestArea = 0
  monitors.forEach((m, i) => {
    const area = overlap(r, m.bounds)
    if (area > bestArea) {
      best = i
      bestArea = area
    }
  })
  return best
}
