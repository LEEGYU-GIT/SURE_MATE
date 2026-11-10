import { rectDiff } from '../../shared/geometry'
import type { Rect } from '../../shared/types'
import type { ReadyPlan, RestoreStep } from '../../shared/workspace/restore-plan'

export interface RestorePorts {
  state(hwnd: string): { minimized: boolean; maximized: boolean; hung: boolean; frame: Rect /* 물리 */ } | null
  normalize(hwnd: string, o: { activate: boolean }): void
  move(hwnd: string, physical: Rect, dpi: number): Promise<void>
  maximize(hwnd: string): void
  raise(hwnd: string): void
  toPhysical(dip: Rect): Rect
  foreground(): string | null
  setForeground(hwnd: string): boolean
  sleep(ms: number): Promise<void>
  now(): number
}

export type OutcomeResult = 'placed' | 'off' | 'gone' | 'hung' | 'blocked' | 'failed' | 'timeout' | 'missing' | 'elevated'
export interface WindowOutcome {
  ruleId: string
  app: string
  result: OutcomeResult
  diff?: number
}
export interface RestoreReport {
  total: number
  placed: number
  outcomes: WindowOutcome[]
  gathered: boolean
  ms: number
  maxDiff: number
  restoredFocus: boolean
}

export const RESTORE_TIMING = {
  settleMs: 120,
  stateWaitMs: 600,
  pollMs: 50,
  verifyDelayMs: 100,
  retryDelayMs: 200,
  tolerancePx: 10,
  maxTotalMs: 10000
} as const

/** 이동 전 frame과 이 값 이내로 그대로면 창이 이동을 거부한 것으로 본다 */
const UNMOVED_PX = 2

type State = NonNullable<ReturnType<RestorePorts['state']>>

export function createRestoreRunner(p: RestorePorts): { run(plan: ReadyPlan): Promise<RestoreReport> } {
  const T = RESTORE_TIMING

  /** 조건이 될 때까지 pollMs 간격으로 최대 stateWaitMs 동안 읽는다. 창이 사라졌으면 'gone' */
  async function waitFor(hwnd: string, ok: (s: State) => boolean): Promise<'ok' | 'timeout' | 'gone'> {
    for (let waited = 0; ; waited += T.pollMs) {
      const s = p.state(hwnd)
      if (!s) return 'gone'
      if (ok(s)) return 'ok'
      if (waited >= T.stateWaitMs) return 'timeout'
      await p.sleep(T.pollMs)
    }
  }

  async function place(step: RestoreStep): Promise<{ result: OutcomeResult; diff?: number }> {
    const s0 = p.state(step.hwnd)
    if (!s0) return { result: 'gone' }
    if (s0.hung) return { result: 'hung' }

    if (s0.minimized || s0.maximized) {
      const released = (s: State): boolean => !s.minimized && !s.maximized
      p.normalize(step.hwnd, { activate: false })
      await p.sleep(T.settleMs)
      let r = await waitFor(step.hwnd, released)
      if (r === 'timeout') {
        p.normalize(step.hwnd, { activate: true })
        r = await waitFor(step.hwnd, released)
      }
      if (r === 'gone') return { result: 'gone' }
      if (r === 'timeout') return { result: 'failed' }
    }

    const before = p.state(step.hwnd)
    if (!before) return { result: 'gone' }
    const target = p.toPhysical(step.target)

    const moveAndMeasure = async (): Promise<{ s: State; diff: number } | 'failed' | 'gone'> => {
      try {
        await p.move(step.hwnd, target, step.dpi)
      } catch {
        return 'failed'
      }
      await p.sleep(T.verifyDelayMs)
      const s = p.state(step.hwnd)
      return s ? { s, diff: rectDiff(s.frame, target) } : 'gone'
    }

    let m = await moveAndMeasure()
    if (m === 'failed' || m === 'gone') return { result: m }

    if (step.state === 'maximized') {
      p.maximize(step.hwnd)
      const r = await waitFor(step.hwnd, (s) => s.maximized)
      if (r === 'gone') return { result: 'gone' }
      return { result: r === 'ok' ? 'placed' : 'off' }
    }

    if (m.diff > T.tolerancePx) {
      await p.sleep(T.retryDelayMs)
      m = await moveAndMeasure()
      if (m === 'failed' || m === 'gone') return { result: m }
    }
    if (m.diff <= T.tolerancePx) return { result: 'placed', diff: m.diff }
    if (rectDiff(m.s.frame, before.frame) <= UNMOVED_PX) return { result: 'blocked', diff: m.diff }
    return { result: 'off', diff: m.diff }
  }

  async function run(plan: ReadyPlan): Promise<RestoreReport> {
    const start = p.now()
    const remembered = p.foreground()
    const outcomes: WindowOutcome[] = plan.skipped.map((k) => ({ ruleId: k.ruleId, app: k.app, result: k.reason }))
    let maxDiff = 0

    for (const step of plan.steps) {
      let r: { result: OutcomeResult; diff?: number }
      if (p.now() - start > T.maxTotalMs) {
        r = { result: 'timeout' }
      } else {
        try {
          r = await place(step)
        } catch {
          r = { result: 'failed' }
        }
      }
      if (r.diff !== undefined && r.diff > maxDiff) maxDiff = r.diff
      outcomes.push({ ruleId: step.ruleId, app: step.app, result: r.result, ...(r.diff !== undefined ? { diff: r.diff } : {}) })
      if (r.result === 'placed' || r.result === 'off') p.raise(step.hwnd)
    }

    // 최소화 해제·최대화가 다른 창을 활성화할 수 있으므로 시작 때 창으로 한 번 되돌린다.
    const restoredFocus = remembered ? p.setForeground(remembered) : false
    return {
      total: plan.total,
      placed: outcomes.filter((o) => o.result === 'placed').length,
      outcomes,
      gathered: plan.gathered,
      ms: p.now() - start,
      maxDiff,
      restoredFocus
    }
  }

  return { run }
}
