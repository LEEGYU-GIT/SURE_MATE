/**
 * Ttree 이석 미리 알림(2026-11-13). Ttree는 Windows가 알려 주는 마지막 입력 뒤 시간(powerMonitor.getSystemIdleTime)이
 * 회사(서버)가 정한 기준(이 회사는 20분)에 닿으면 이석으로 잡고, 사용자는 이석 사유를 써서 결재를 받아야 한다.
 * Sure-Mate는 같은 값을 읽어 기준 몇 분 전에 알린다(자리에 있지만 종이를 읽거나 화면으로 회의를 보느라 입력이 없는 사람).
 * 알리기만 하고 입력을 흉내 내거나 넣지 않는다. 판단은 모두 여기(순수)에 있고 타이머·알림은 런타임(away-watch)이 맡는다. 시간은 ms
 */
export const AWAY = {
  /** 알린 뒤·기준을 넘긴 뒤 입력이 돌아왔는지 보는 간격 */
  watchMs: 2_000,
  /** 다음 확인까지 가장 짧은 간격(알릴 때가 1초 안으로 남았을 때) */
  minCheckMs: 1_000,
  /** 다음 확인까지 가장 긴 간격(꺼짐·잠금·알릴 때가 멀 때). 설정을 바꾸면 런타임이 바로 다시 본다 */
  maxCheckMs: 60_000
} as const

/** 이번에 입력 없이 이어지는 동안 이미 알렸는지(또는 기준을 넘겨 알리지 않기로 했는지). 입력이 돌아오면 false */
export interface AwayState {
  warned: boolean
}

export interface AwayInput {
  /** 마지막 입력 뒤 지난 시간(ms). 숫자가 아니거나 음수면 0(방금 입력이 있었다) */
  idleMs: number
  /** 설정 awayWarn */
  enabled: boolean
  /** Ttree가 이 PC에 설치되어 있는지 */
  installed: boolean
  /** Windows 잠금 화면(사용자가 자리를 비우기로 했다) */
  locked: boolean
  /** 이석 기준(분, 설정 awayAfterMin) */
  afterMin: number
  /** 기준 몇 분 전에 알릴지(설정 awayLeadMin) */
  leadMin: number
}

/**
 * warn: 지금 알린다(holdMs: 기준까지 남은 시간). clear: 떠 있는 알림을 닫는다(input: 입력이 돌아옴, off: 꺼짐·Ttree 없음,
 * locked: 잠금 화면). wait: 할 일 없음(active: 알릴 때 전, warned: 이미 알림, past-limit: 기준을 넘김). nextMs 뒤 다시 본다
 */
export type AwayDecision =
  | { action: 'warn'; holdMs: number; nextMs: number; state: AwayState }
  | { action: 'clear'; reason: 'input' | 'off' | 'locked'; nextMs: number; state: AwayState }
  | {
      action: 'wait'
      reason: 'off' | 'locked' | 'active' | 'warned' | 'past-limit'
      nextMs: number
      state: AwayState
    }

const MINUTE_MS = 60_000

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

/** 알리지 않는 동안(꺼짐·잠금): 떠 있던 알림은 닫고 1분 뒤 다시 본다 */
function standBy(s: AwayState, reason: 'off' | 'locked'): AwayDecision {
  const state: AwayState = { warned: false }
  return s.warned
    ? { action: 'clear', reason, nextMs: AWAY.maxCheckMs, state }
    : { action: 'wait', reason, nextMs: AWAY.maxCheckMs, state }
}

/**
 * 확인 한 번: 알릴 때(기준 − 미리 알림 분)와 기준 사이에서 입력 없이 이어지는 동안 한 번만 알린다.
 * - 꺼짐·Ttree 없음·분이 맞지 않음(미리 알림 분이 0 이하이거나 기준 이상)은 off, 잠금 화면은 locked: 알리지 않고 떠 있던 알림은 닫는다.
 * - 알릴 때 전이면 그때까지 기다린다(1초~1분). 알린 뒤 입력이 돌아오면 닫는다.
 * - 기준을 넘긴 뒤에는 늦게 알리지 않는다(Ttree가 이미 이석으로 잡았다). 입력이 돌아올 때까지 2초마다 본다.
 */
export function nextAway(s: AwayState, i: AwayInput): AwayDecision {
  const minutesOk =
    Number.isFinite(i.afterMin) &&
    Number.isFinite(i.leadMin) &&
    i.leadMin > 0 &&
    i.leadMin < i.afterMin
  if (!i.enabled || !i.installed || !minutesOk) return standBy(s, 'off')
  if (i.locked) return standBy(s, 'locked')

  const idle = Number.isFinite(i.idleMs) && i.idleMs > 0 ? i.idleMs : 0
  const warnAt = (i.afterMin - i.leadMin) * MINUTE_MS
  const limit = i.afterMin * MINUTE_MS
  if (idle < warnAt) {
    const nextMs = clamp(warnAt - idle, AWAY.minCheckMs, AWAY.maxCheckMs)
    const state: AwayState = { warned: false }
    return s.warned
      ? { action: 'clear', reason: 'input', nextMs, state }
      : { action: 'wait', reason: 'active', nextMs, state }
  }
  if (idle >= limit) {
    return { action: 'wait', reason: 'past-limit', nextMs: AWAY.watchMs, state: { warned: true } }
  }
  if (s.warned) {
    return { action: 'wait', reason: 'warned', nextMs: AWAY.watchMs, state: { warned: true } }
  }
  return {
    action: 'warn',
    holdMs: limit - idle,
    nextMs: AWAY.watchMs,
    state: { warned: true }
  }
}
