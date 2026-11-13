import { rectDiff } from '../../shared/geometry'
import type { Rect } from '../../shared/types'
import type { FocusTarget, OutcomeResult, RestoreReport, WindowOutcome } from '../../shared/workspace/restore-result'
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
  /** 그 창이 Sure-Mate 자신의 창(BrowserWindow)인지. 포커스를 받을 수 있는지는 focusable이 따로 본다 */
  own(hwnd: string): boolean
  setForeground(hwnd: string): boolean
  sleep(ms: number): Promise<void>
  now(): number
}

export type { FocusTarget, OutcomeResult, RestoreReport, WindowOutcome }

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
 * 끝에 포커스를 줄 창(chooseFocus). target null이면 아무 창도 올리지 않는다.
 * raise: 이미 앞 창이라 맨 위로 올리기만, focus: 맨 위로 올린 뒤 SetForegroundWindow
 */
export type FocusChoice = { target: null } | { target: FocusTarget; hwnd: string; action: 'raise' | 'focus' }

/**
 * 불러오기 끝에 어느 창을 맨 위로 올리고 포커스를 줄지(설계 §11 포커스 복귀, 2026-11-12 판정). 복원한 창들이 앞 창을 가리면 포커스가
 * 보이지 않는 창에 남아 키 입력이 가려진 창으로 간다(설정 창에서 불러오면 Enter·Space가 가려진 '불러오기'를 다시 누른다).
 * 1. 시작 때 앞 창이 이번에 올린 워크스페이스 창이거나, 포커스를 받을 수 있는 Sure-Mate 자신의 창(설정·첫 실행 안내 창)이면 그 창(start)을
 *    맨 위로 올리고(그 창 하나만 저장한 z-순서에서 벗어난다) 앞 창이 아니면 포커스도 준다.
 * 2. 그 밖(워크스페이스 밖의 다른 앱 창, 시작 때 앞 창이 없거나 사라졌거나 포커스를 받을 수 없음)이면 맨 위 복원 창(workspace)을 올리고
 *    포커스를 준다. 아래에서 위로 올리므로 마지막에 올린 창이 맨 위이고, 시작 때 앞 창은 워크스페이스 창들 뒤에 남는다(저장한 화면 그대로).
 * 3. 올린 창이 없으면(모두 못 찾음·실패·옮겨지지 않음) 시작 때 앞 창을 1처럼 돌려주고, 돌려줄 수 없으면 아무 창도 올리지 않는다.
 * focusable: 시작 때 앞 창이 아직 있고 보이며 포커스를 받을 수 있는지, own: 그 창이 Sure-Mate 자신의 창인지(focusable일 때만 따진다),
 * raised: 이번에 올린 워크스페이스 창(placed·off, 올린 차례), foreground: 끝의 앞 창(읽지 못한 null도 앞 창이 아닌 것으로 본다)
 */
export function chooseFocus(o: {
  remembered: string | null
  focusable: boolean
  own: boolean
  raised: readonly string[]
  foreground: string | null
}): FocusChoice {
  const start = o.remembered !== null && o.focusable ? o.remembered : null
  const top = o.raised.at(-1)
  if (start !== null && (o.own || o.raised.includes(start) || top === undefined)) {
    return { target: 'start', hwnd: start, action: o.foreground === start ? 'raise' : 'focus' }
  }
  if (top !== undefined) return { target: 'workspace', hwnd: top, action: 'focus' }
  return { target: null }
}

/** 포트를 부르고, 던지면 fallback(끝의 포커스는 읽지 못한 값을 돌려줄 수 없는 창·자신의 창이 아님·앞 창이 아님으로 본다) */
function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
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

/** 실행 옵션. hidden: 화면 감추기가 방금 내린 창(시작 때 앞 창이어도 돌려줄 창으로 보지 않는다: 최소화된 창에 포커스를 주지 않게) */
export interface RestoreRunOptions {
  hidden?: ReadonlySet<string>
}

export function createRestoreRunner(p: RestorePorts): { run(plan: ReadyPlan, o?: RestoreRunOptions): Promise<RestoreReport> } {
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

  async function run(plan: ReadyPlan, o: RestoreRunOptions = {}): Promise<RestoreReport> {
    const start = p.now()
    const remembered = p.foreground()
    const outcomes: WindowOutcome[] = plan.skipped.map((k) => ({ ruleId: k.ruleId, app: k.app, result: k.reason }))
    const seen = { max: 0 }
    /** 이번에 맨 위로 올린 워크스페이스 창(placed·off). steps가 아래에서 위 순서(planRestore)라 마지막이 맨 위 */
    const raised: string[] = []

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
          raised.push(step.hwnd)
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

    // 끝의 포커스(chooseFocus): 시작 때 앞 창이 이번에 올린 워크스페이스 창·Sure-Mate 자신의 창이면 그 창, 아니면 맨 위 복원 창
    let focusable = false
    let own = false
    if (remembered !== null && !o.hidden?.has(remembered)) {
      focusable = attempt(() => p.focusable(remembered), false)
      own = focusable && attempt(() => p.own(remembered), false)
    }
    const choice = chooseFocus({ remembered, focusable, own, raised, foreground: attempt(() => p.foreground(), null) })
    // 고른 창을 맨 위로 올리고(포커스를 바꾸지 않는 bringToFront: HWND_TOPMOST 뒤 HWND_NOTOPMOST, 비동기), focus면 포커스도 준다(시작 때 앞 창이 최소화 해제·최대화로
    // 앞 창이 아니게 됐거나, 맨 위 복원 창일 때). restoredFocus는 끝에 그 창이 맨 앞이고 포커스가 있는지다
    let restoredFocus = false
    if (choice.target !== null) {
      const { hwnd } = choice
      const up = attempt(() => {
        p.raise(hwnd)
        return true
      }, false)
      restoredFocus = choice.action === 'raise' ? up : attempt(() => p.setForeground(hwnd), false)
    }
    return {
      total: plan.total,
      placed: outcomes.filter((o) => o.result === 'placed').length,
      outcomes,
      gathered: plan.gathered,
      ms: p.now() - start,
      maxDiff: seen.max,
      restoredFocus,
      focusTarget: choice.target
    }
  }

  return { run }
}
