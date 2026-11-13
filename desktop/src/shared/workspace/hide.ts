import type { MonitorInfo, Rect, WindowInfo } from '../types'
import { EXCLUDED_CLASSES } from './capture'
import { assignWindows, type LiveWindow } from './match'
import { monitorFingerprint, monitorOfRect } from './monitors'
import type { FocusTarget, OutcomeResult } from './restore-result'
import type { Workspace } from './types'

// 화면 감추기(기본 워크스페이스, builtin.ts)의 순수 규칙. 창을 내리고 되돌리고 고정하는 일은 main/workspace/hide-runner.ts가 한다.

/** 감춘 뒤 이 시간 안에 한 번 더 누르면 내렸던 창을 되돌린다. 항상 위에 두기(옵션)도 이때 풀린다 */
export const HIDE_SESSION_MS = 10 * 60 * 1000

/** 내린 창 하나. maximized: 내리기 전에 최대화였는지(되돌릴 때 최대화로) */
export interface HiddenWindow {
  hwnd: string
  maximized: boolean
}

/** 내릴 창 하나. elevated: 관리자 권한인지(모르면 null). 내려가지 않았을 때 관리자 권한 창(UIPI)으로 셀지 고른다 */
export interface HideTarget extends HiddenWindow {
  elevated: boolean | null
}

/**
 * 화면 감추기 한 번의 결과(창 수만, 알림·설정 창·로그용). hide: 내린 창·관리자 권한이라 내리지 못한 창·그 밖에 내리지 못한 창(응답 없음
 * 등), 남길 창을 저장해 두었는지. unhide: 되돌린 창·되돌리지 못한 창
 */
export type HideOutcome =
  | { kind: 'hide'; minimized: number; elevated: number; skipped: number; saved: boolean }
  | { kind: 'unhide'; restored: number; skipped: number }

/** 감춘 기록(메모리에만): 감춘 시각, 내린 창(감추기 직전 z-순서, 맨 위부터), 감추기 직전 앞 창 */
export interface HideSession {
  at: number
  hidden: HiddenWindow[]
  front: string | null
}

/**
 * 그 워크스페이스가 불러올 창: 불러오기(planRestore)와 같은 배치(지금 모니터 구성의 배치, 없으면 첫 배치)의 켜진 규칙을 같은 짝짓기
 * (assignWindows)로 고른 창. 이 창들은 내리지 않는다(관리자 권한이라 불러오기가 건너뛰는 창도 업무 창이라 내리지 않는다)
 */
export function workspaceWindowIds(ws: Workspace, monitors: MonitorInfo[], windows: LiveWindow[]): Set<string> {
  const layouts = Object.values(ws.layouts)
  if (layouts.length === 0 || monitors.length === 0) return new Set()
  const layout = ws.layouts[monitorFingerprint(monitors)] ?? layouts[0]
  const rules = layout.windows.filter((r) => r.enabled)
  return new Set([...assignWindows(rules, windows).values()].map((w) => w.hwnd))
}

/**
 * 내릴 창(설계 §11 대상 창 규칙과 같다): listWindows가 이미 고른 창(보이는 최상위, 소유자 없음, 도구 창 아님) 가운데 제목이 있고
 * 가려지지 않았고(cloaked) Sure-Mate 자신의 창이 아니며, 바탕 화면·작업 표시줄이 아니고, 이미 최소화되지 않았고, 어느 모니터 위에 있으며
 * (모든 모니터), 업무 창(keep)이 아닌 것. z-순서를 지킨다. 관리자 권한 창은 Sure-Mate가 관리자 권한이 아니면 내릴 수 없어(UIPI)
 * 고르지 않고 세기만 한다(elevated). 관리자 권한인지 모르는 창(null)은 내려 본다
 */
export function hideCandidates(o: {
  windows: readonly WindowInfo[]
  monitors: readonly MonitorInfo[]
  toDip(physical: Rect): Rect
  keep: ReadonlySet<string>
  selfElevated: boolean | null
  selfPid: number
}): { targets: HideTarget[]; elevated: number } {
  const targets: HideTarget[] = []
  let elevated = 0
  for (const w of o.windows) {
    if (o.keep.has(w.hwnd) || !w.title || w.cloaked || w.pid === o.selfPid || w.minimized) continue
    if (EXCLUDED_CLASSES.includes(w.className)) continue
    if (monitorOfRect(o.toDip(w.frame), [...o.monitors]) < 0) continue
    if (w.elevated === true && o.selfElevated !== true) {
      elevated++
      continue
    }
    targets.push({ hwnd: w.hwnd, maximized: w.maximized, elevated: w.elevated })
  }
  return { targets, elevated }
}

/**
 * 누를 때 할 일. restore: windows(아래에서 위 차례로 되돌린다)와 끝에 포커스를 줄 창. hide: 다시 감춘다(why는 기록용).
 * carry는 다시 감출 때 이어서 기억할 창(changed: 아직 최소화된 내린 창)이다
 */
export type PressDecision =
  | { kind: 'restore'; windows: HiddenWindow[]; focus: string | null }
  | { kind: 'hide'; why: 'first' | 'expired' | 'changed' | 'nothing'; carry: HiddenWindow[] }

/**
 * 다시 누름(2026-11-12): 감춘 지 10분이 안 됐고 내린 창 가운데 남은 창이 모두 아직 최소화돼 있으면 그 창들을 되돌린다. 사라진 창은
 * 건너뛰고, 아래에서 위 차례로 되돌려 감추기 전 z-순서를 지키며, 끝에 감추기 직전 앞 창(사라졌으면 맨 위로 되돌릴 창)에 포커스를 준다.
 * 감춘 적이 없거나, 10분이 지났거나(시계가 거꾸로 가도), 사용자가 내린 창을 직접 되살렸거나(changed), 되돌릴 창이 없으면 다시 감춘다.
 * changed는 아직 최소화된 내린 창을 carry로 넘겨 다음 누름이 함께 되돌리게 한다(되살린 창 하나 때문에 나머지를 잊지 않게).
 * state: 그 창의 지금 상태(없어졌으면 null)
 */
export function decidePress(o: { session: HideSession | null; now: number; state(hwnd: string): { minimized: boolean } | null }): PressDecision {
  const s = o.session
  if (!s) return { kind: 'hide', why: 'first', carry: [] }
  if (o.now < s.at || o.now - s.at >= HIDE_SESSION_MS) return { kind: 'hide', why: 'expired', carry: [] }
  const alive = s.hidden.map((w) => ({ w, st: o.state(w.hwnd) })).filter((x) => x.st !== null)
  if (alive.some((x) => !x.st!.minimized)) return { kind: 'hide', why: 'changed', carry: alive.filter((x) => x.st!.minimized).map((x) => x.w) }
  if (alive.length === 0) return { kind: 'hide', why: 'nothing', carry: [] }
  const focus = s.front !== null && o.state(s.front) !== null ? s.front : alive[0].w.hwnd
  return { kind: 'restore', windows: alive.map((x) => x.w).reverse(), focus }
}

/** 새로 감춘 기록: 이번에 내린 창(z-순서) 다음에 이어서 기억할 창(carry, 이번에 다시 내린 창은 한 번만) */
export function startSession(o: { now: number; front: string | null; hidden: readonly HiddenWindow[]; carry: readonly HiddenWindow[] }): HideSession {
  const mine = new Set(o.hidden.map((w) => w.hwnd))
  return { at: o.now, hidden: [...o.hidden, ...o.carry.filter((w) => !mine.has(w.hwnd))], front: o.front }
}

/**
 * 감춘 뒤 바탕 화면에 포커스를 줄지: 불러오기가 포커스를 줄 창을 고르지 못했고(저장 전이거나 업무 창을 못 찾음) 감추기 직전 앞 창을
 * 내렸으면 true. 활성화 없이 내린(SW_SHOWMINNOACTIVE) 앞 창은 최소화된 채 포커스를 쥐고 있어 키 입력이 내린 창으로 간다
 */
export function needsDesktopFocus(o: { focusTarget: FocusTarget | null | undefined; front: string | null; hidden: ReadonlySet<string> }): boolean {
  return (o.focusTarget ?? null) === null && o.front !== null && o.hidden.has(o.front)
}

// 감춘 동안 업무 창을 항상 위에 두기(기본 워크스페이스의 옵션 keepOnTop, 기본 끔, 2026-11-12 사용자 결정)

/** 고정을 푼 까닭: 다시 누름·10분 지남·사용자가 다른 창으로 옮김·다른 워크스페이스를 불러옴·옵션을 끔·앱 끝냄·고정한 창이 모두 사라짐 */
export type PinTrigger = 'press' | 'expired' | 'switched' | 'workspace' | 'off' | 'quit' | 'gone'

/**
 * 항상 위에 둘 창: 이번에 배치한(placed·off) 업무 창을 불러오기 차례(steps, 아래에서 위)대로. 감추기 전에 이미 항상 위였던 창
 * (topmostBefore)은 Sure-Mate가 고정한 창이 아니라 고르지 않는다(풀 때도 건드리지 않게)
 */
export function pinTargets(o: {
  steps: readonly { ruleId: string; hwnd: string }[]
  outcomes: readonly { ruleId: string; result: OutcomeResult }[]
  topmostBefore: ReadonlySet<string>
}): string[] {
  const placed = new Set(o.outcomes.filter((x) => x.result === 'placed' || x.result === 'off').map((x) => x.ruleId))
  return o.steps.filter((s) => placed.has(s.ruleId) && !o.topmostBefore.has(s.hwnd)).map((s) => s.hwnd)
}

/**
 * 고정한 동안 약 0.5초마다 살핀다: 감춘 지 10분이 지났으면 expired, 앞 창이 업무 창(keep)도 Sure-Mate 창(팔레트·설정 등)도 아닌
 * 다른 창이면 사용자가 옮긴 것이라 switched(그대로 두면 새로 연 창이 고정한 창 밑에 깔린다). 앞 창을 읽지 못했으면 그대로 둔다.
 * foreground.hwnd는 앞 창의 맨 위 소유 창(대화상자는 그 앱 창으로 본다)
 */
export function pinCheck(o: { until: number; now: number; keep: ReadonlySet<string>; foreground: { hwnd: string; own: boolean } | null }): 'expired' | 'switched' | null {
  if (o.now >= o.until) return 'expired'
  const fg = o.foreground
  if (!fg || fg.own || o.keep.has(fg.hwnd)) return null
  return 'switched'
}

/** 풀 창: Sure-Mate가 고정한 창(pinned) 가운데 아직 있는 창. 사라진 창은 버리고 세기만 한다 */
export function pinRelease(o: { pinned: readonly string[]; alive(hwnd: string): boolean }): { release: string[]; dropped: number } {
  const release = o.pinned.filter((h) => o.alive(h))
  return { release, dropped: o.pinned.length - release.length }
}
