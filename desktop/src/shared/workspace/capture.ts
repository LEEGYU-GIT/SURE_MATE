import type { MonitorInfo, Rect, WindowInfo } from '../types'
import { toRatio } from './layout-math'
import { monitorFingerprint, monitorKey, monitorOfRect, toSavedMonitor } from './monitors'
import { WORKSPACE_LIMITS } from './types'
import type { SavedLayout, WindowRule } from './types'

export const EXCLUDED_CLASSES = ['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd']

export interface CaptureSkipped {
  minimized: number
  excluded: number
  offscreen: number
  overLimit: number
}

const TITLE_SEP = /\s(?:-|—|\|)\s/
const norm = (s: string): string => s.trim().toLowerCase()

function splitTitle(t: string): string[] {
  return t.split(TITLE_SEP)
}

/** 같은 프로그램 창들을 구분할 제목 조각. null이면 프로그램만으로 짝짓는다 */
export function deriveTitleRules(titles: string[]): (string | null)[] {
  if (titles.length <= 1) return titles.map(() => null)
  let parts = titles.map(splitTitle)
  while (parts.every((p) => p.length >= 2)) {
    const last = norm(parts[0][parts[0].length - 1])
    if (!parts.every((p) => norm(p[p.length - 1]) === last)) break
    parts = parts.map((p) => p.slice(0, -1))
  }
  const rules = parts.map((p) => {
    const s = p[p.length - 1]?.trim() ?? ''
    return s === '' ? null : s
  })
  return rules.map((r, i) =>
    r === null || rules.some((o, j) => j !== i && o !== null && norm(o) === norm(r)) ? null : r
  )
}

function exeBase(exe: string): string {
  return exe.replace(/\.[^.\\/]*$/, '')
}

/** 알림·편집 화면 전용 표시 이름 */
export function appLabel(rule: { savedTitle: string; match: { exe: string } }): string {
  const parts = splitTitle(rule.savedTitle)
  if (parts.length >= 2) {
    const last = parts[parts.length - 1].trim()
    if (last.length >= 1 && last.length <= 30) return last
  }
  return exeBase(rule.match.exe)
}

export function captureLayout(o: {
  windows: WindowInfo[]
  monitors: MonitorInfo[]
  toDip(physical: Rect): Rect
  newId(): string
}): { fingerprint: string; layout: SavedLayout; skipped: CaptureSkipped } {
  const skipped: CaptureSkipped = { minimized: 0, excluded: 0, offscreen: 0, overLimit: 0 }
  const kept: { w: WindowInfo; mon: number; dip: Rect }[] = []
  for (const w of o.windows) {
    if (EXCLUDED_CLASSES.includes(w.className)) {
      skipped.excluded++
      continue
    }
    if (w.minimized) {
      skipped.minimized++
      continue
    }
    const dip = o.toDip(w.frame)
    const mon = monitorOfRect(dip, o.monitors)
    if (mon < 0) {
      skipped.offscreen++
      continue
    }
    if (kept.length >= WORKSPACE_LIMITS.windows) {
      skipped.overLimit++
      continue
    }
    kept.push({ w, mon, dip })
  }

  const titleRule = new Map<number, string | null>()
  const groups = new Map<string, number[]>()
  kept.forEach((k, i) => {
    const key = k.w.exe.toLowerCase()
    groups.set(key, [...(groups.get(key) ?? []), i])
  })
  for (const idxs of groups.values()) {
    const rules = deriveTitleRules(idxs.map((i) => kept[i].w.title))
    idxs.forEach((i, n) => titleRule.set(i, rules[n]))
  }

  const windows: WindowRule[] = kept.map((k, i) => {
    const m = o.monitors[k.mon]
    const inc = titleRule.get(i) ?? null
    const match: WindowRule['match'] = { exe: k.w.exe, className: k.w.className }
    if (inc !== null) match.titleIncludes = inc.slice(0, WORKSPACE_LIMITS.titleIncludes)
    return {
      id: o.newId(),
      enabled: true,
      match,
      savedTitle: k.w.title.slice(0, WORKSPACE_LIMITS.title),
      target: {
        monitor: monitorKey(m),
        rect: k.w.maximized ? { x: 0, y: 0, w: 1, h: 1 } : toRatio(k.dip, m.workArea),
        state: k.w.maximized ? 'maximized' : 'normal'
      },
      order: i
    }
  })
  return {
    fingerprint: monitorFingerprint(o.monitors),
    layout: { monitors: o.monitors.map(toSavedMonitor), windows },
    skipped
  }
}
