import type { MonitorInfo, Rect } from '../types'
import { appLabel } from './capture'
import { fromRatio, keepOnScreen } from './layout-math'
import { assignWindows } from './match'
import type { LiveWindow } from './match'
import { monitorFingerprint, monitorKey } from './monitors'
import type { WindowState, Workspace } from './types'

export interface RestoreStep {
  ruleId: string
  app: string
  hwnd: string
  /** DIP */
  target: Rect
  dpi: number
  state: WindowState
}

export type PlanSkip = { ruleId: string; app: string; reason: 'missing' | 'elevated' }

export type RestorePlan =
  | { kind: 'ready'; steps: RestoreStep[]; skipped: PlanSkip[]; total: number; gathered: boolean }
  | { kind: 'needs-gather'; savedMonitors: number; currentMonitors: number }
  | { kind: 'empty' }

export type ReadyPlan = Extract<RestorePlan, { kind: 'ready' }>

export function planRestore(o: {
  workspace: Workspace
  monitors: MonitorInfo[]
  windows: LiveWindow[]
  gather: boolean
  selfElevated: boolean | null
}): RestorePlan {
  const layouts = Object.entries(o.workspace.layouts)
  if (layouts.length === 0 || o.monitors.length === 0) return { kind: 'empty' }
  const fp = monitorFingerprint(o.monitors)
  const same = o.workspace.layouts[fp]
  if (!same && !o.gather) {
    return { kind: 'needs-gather', savedMonitors: layouts[0][1].monitors.length, currentMonitors: o.monitors.length }
  }
  const layout = same ?? layouts[0][1]
  const gathered = !same
  const rules = layout.windows.filter((r) => r.enabled)
  if (rules.length === 0) return { kind: 'empty' }

  const primary = o.monitors.find((m) => m.isPrimary) ?? o.monitors[0]
  const assigned = assignWindows(rules, o.windows)
  const steps: RestoreStep[] = []
  const skipped: PlanSkip[] = []
  for (const rule of [...rules].sort((a, b) => a.order - b.order)) {
    const app = appLabel(rule)
    const w = assigned.get(rule.id)
    if (!w) {
      skipped.push({ ruleId: rule.id, app, reason: 'missing' })
      continue
    }
    if (w.elevated === true && o.selfElevated !== true) {
      skipped.push({ ruleId: rule.id, app, reason: 'elevated' })
      continue
    }
    const mon = gathered
      ? primary
      : (o.monitors.find((m) => monitorKey(m) === rule.target.monitor) ?? primary)
    const target =
      rule.target.state === 'maximized'
        ? { ...mon.workArea }
        : keepOnScreen(fromRatio(rule.target.rect, mon.workArea), mon.workArea)
    steps.push({
      ruleId: rule.id,
      app,
      hwnd: w.hwnd,
      target,
      dpi: Math.round(mon.scaleFactor * 96),
      state: rule.target.state
    })
  }
  steps.sort((a, b) => rules.find((r) => r.id === b.ruleId)!.order - rules.find((r) => r.id === a.ruleId)!.order)
  return { kind: 'ready', steps, skipped, total: rules.length, gathered }
}
