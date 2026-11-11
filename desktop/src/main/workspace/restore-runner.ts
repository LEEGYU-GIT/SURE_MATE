import { rectDiff } from '../../shared/geometry'
import type { Rect } from '../../shared/types'
import type { OutcomeResult, RestoreReport, WindowOutcome } from '../../shared/workspace/restore-result'
import type { ReadyPlan, RestoreStep } from '../../shared/workspace/restore-plan'

export interface RestorePorts {
  state(hwnd: string): { minimized: boolean; maximized: boolean; hung: boolean; frame: Rect /* 물리 */ } | null
  normalize(hwnd: string, o: { activate: boolean }): void
  move(hwnd: string, physical: Rect, dpi: number): Promise<void>
  maximize(hwnd: string): void
  raise(hwnd: string): void
  toPhysical(dip: Rect): Rect
  foreground(): string | null
  /** 그 창이 아직 있고 보이며 포커스를 받을 수 있는지(숨은 창·포커스를 받지 않는 Sure-Mate 창은 false) */
  focusable(hwnd: string): boolean
  setForeground(hwnd: string): boolean
  sleep(ms: number): Promise<void>
  now(): number
}

export type { OutcomeResult, RestoreReport, WindowOutcome }

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

/**
 * 끝에 시작 때 앞 창을 어떻게 돌려줄지(설계 §11 포커스 복귀, 2026-11-11 판정). 복원한 창들이 그 창을 가리면 포커스가 보이지 않는
 * 창에 남아 키 입력이 가려진 창으로 간다(설정 창에서 불러오면 Enter·Space가 가려진 '불러오기'를 다시 누른다). 그래서 그 창이 아직 있고
 * 보이며 포커스를 받을 수 있으면 맨 위로 올리고(그 창 하나만 저장한 z-순서에서 벗어난다), 앞 창이 아니면 포커스도 준다.
 * none: 시작 때 앞 창이 없었거나 돌려줄 수 없는 창(사라짐·숨음·포커스를 받지 않는 Sure-Mate 창), raise: 아직 앞 창이라 맨 위로 올리기만,
 * focus: 맨 위로 올린 뒤 SetForegroundWindow(끝의 앞 창을 읽지 못한 null도 앞 창이 아닌 것으로 본다)
 */
export function focusReturn(o: { remembered: string | null; focusable: boolean; foreground: string | null }): 'none' | 'raise' | 'focus' {
  if (o.remembered === null || !o.focusable) return 'none'
  return o.foreground === o.remembered ? 'raise' : 'focus'
}

/** Sure-Mate 자신의 창 하나(HWND는 10진 문자열) */
export interface OwnWindowState {
  hwnd: string
  visible: boolean
  focusable: boolean
}

/**
 * 포커스를 돌려주면 안 되는 Sure-Mate 자신의 창인지: 숨은 창(키를 누른 채 팔레트에서 불러오는 동안 숨은 팔레트가 키 입력을 받는다)과
 * 포커스를 받지 않는 창(바·펼침 창, 조종이 끝난 펫 창). Sure-Mate 창이 앞일 때 조종을 시작하면 돌아갈 창이 없어(control.prev null)
 * 불러오기가 시작 때 앞 창으로 펫 창을 기억할 수 있다
 */
export function unfocusableOwnWindow(hwnd: string, own: readonly OwnWindowState[]): boolean {
  return own.some((w) => w.hwnd === hwnd && (!w.visible || !w.focusable))
}

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

  async function place(step: RestoreStep, seen: { max: number }): Promise<{ result: OutcomeResult; diff?: number }> {
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
      if (!s) return 'gone'
      const diff = rectDiff(s.frame, target)
      if (diff > seen.max) seen.max = diff
      return { s, diff }
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
    const seen = { max: 0 }

    for (const step of plan.steps) {
      let r: { result: OutcomeResult; diff?: number }
      if (p.now() - start > T.maxTotalMs) {
        r = { result: 'timeout' }
      } else {
        try {
          r = await place(step, seen)
        } catch {
          r = { result: 'failed' }
        }
      }
      if (r.result === 'placed' || r.result === 'off') {
        try {
          p.raise(step.hwnd)
        } catch {
          r = { ...r, result: 'failed' }
        }
      }
      outcomes.push({
        ruleId: step.ruleId,
        app: step.app,
        result: r.result,
        ...(r.diff !== undefined ? { diff: r.diff } : {}),
        // 옮겨지지 않은 창: 관리자 권한인지(UIPI) 알림이 까닭을 고른다(A-M3)
        ...(r.result === 'blocked' ? { elevated: step.elevated } : {})
      })
    }

    // 시작 때 앞 창을 맨 위로 올리고(포커스를 바꾸지 않는 비동기 HWND_TOP), 앞 창이 아니면(최소화 해제·최대화가 다른 창을
    // 활성화했다) 포커스를 준다. restoredFocus는 끝에 그 창이 맨 앞이고 포커스가 있는지다
    let restoredFocus = false
    if (remembered !== null) {
      let focusable = false
      let now: string | null = null
      try {
        focusable = p.focusable(remembered)
        now = p.foreground()
      } catch {
        // 돌려줄 수 있는지 읽지 못했으면 돌려주지 않고, 앞 창을 읽지 못했으면(null) 앞 창이 아닌 것으로 본다
      }
      const focus = focusReturn({ remembered, focusable, foreground: now })
      if (focus !== 'none') {
        let raised = true
        try {
          p.raise(remembered)
        } catch {
          raised = false
        }
        if (focus === 'raise') restoredFocus = raised
        else {
          try {
            restoredFocus = p.setForeground(remembered)
          } catch {
            restoredFocus = false
          }
        }
      }
    }
    return {
      total: plan.total,
      placed: outcomes.filter((o) => o.result === 'placed').length,
      outcomes,
      gathered: plan.gathered,
      ms: p.now() - start,
      maxDiff: seen.max,
      restoredFocus
    }
  }

  return { run }
}
