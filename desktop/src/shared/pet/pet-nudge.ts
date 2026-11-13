import { PET_NUDGE_LINES } from './pet-copy'

/**
 * 쉬어 가기 말(2026-11-13 사용자 의견 "업무 중간중간 '물도 마시고 해요!' 같은 멘트"). 시간은 ms.
 * 런타임이 1분에 한 번 확인하고, 일한 시간이 간격(±15%)에 닿으면 말한다. 판단은 모두 여기(순수)에 있다.
 */
export const NUDGE = {
  /** 확인 주기(런타임). 펫이 보이고 설정이 켜져 있는 동안만 돈다 */
  checkMs: 60_000,
  /** 입력 없는 시간(powerMonitor.getSystemIdleTime)이 이보다 짧으면 일하는 중으로 센다 */
  activeIdleMs: 5 * 60_000,
  /** 입력 없는 시간이나 확인 사이 빈 시간(절전·펫 숨김)이 이만큼이면 쉰 것으로 보고 처음부터 센다 */
  breakIdleMs: 10 * 60_000,
  /** 말할 때 마지막 입력이 이 안이어야 자리에 있는 것으로 본다(없으면 돌아올 때까지 기다린다) */
  presentIdleMs: 60_000,
  /** 간격 흔들기: 간격 × (1 ± 0.15) */
  jitter: 0.15,
  /** 말하지 못했을 때 한 번 더 확인하기까지 */
  retryMs: 3 * 60_000,
  /** 확인 사이가 이보다 길면 그 사이는 세지 않는다(그동안 일했는지 모른다) */
  maxStepMs: 2 * 60_000
} as const

/** 펫이 하던 일 때문에 지금 말을 걸 수 없는 까닭(컨트롤러가 알려 준다) */
export type PetBusy = 'held' | 'control' | 'menu' | 'moving' | 'reacting'
export type NudgeSkipReason = 'fullscreen' | 'hidden' | 'bubbles-off' | PetBusy
/** counting: 세는 중, paused: 입력 없음 5분 이상(세지 않음), break: 쉼(처음부터), away: 자리에 없음, retry-later: 한 번 더 확인 전 */
export type NudgeWaitReason = 'counting' | 'paused' | 'break' | 'away' | 'retry-later'

export interface NudgeState {
  /** 이번 차례에 센 일한 시간 */
  activeMs: number
  /** 마지막으로 확인한 시각(단조 시계) */
  lastAt: number | null
  /** 이번 차례 간격 흔들기(0~1, 0.5면 간격 그대로) */
  jitter: number
  /** 말하지 못한 뒤 한 번 더 확인할 시각. 없으면 null */
  retryAt: number | null
  /** 마지막으로 말한 문구 번호(PET_NUDGE_LINES) */
  lastLine: number | null
}

/** 말을 걸 수 있는지 정하는 지금 상태 */
export interface NudgeConditions {
  shown: boolean
  fullscreen: boolean
  bubbles: boolean
  busy: PetBusy | null
}

export interface NudgeInput extends NudgeConditions {
  /** 설정의 간격(분) */
  intervalMin: number
  random: () => number
}

export type NudgeDecision =
  | { action: 'speak'; line: number; state: NudgeState }
  | { action: 'skip'; reason: NudgeSkipReason; retry: boolean; state: NudgeState }
  | { action: 'wait'; reason: NudgeWaitReason; state: NudgeState }

/** 난수를 0~1로(숫자가 아니면 가운데) */
const unit = (r: number): number => (Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0.5)

/** 새 차례: 센 시간 0, 지금부터 센다. 흔들기는 random을 한 번 부른다 */
export function startNudge(o: { now: number; random: () => number; lastLine?: number | null }): NudgeState {
  return { activeMs: 0, lastAt: o.now, jitter: unit(o.random()), retryAt: null, lastLine: o.lastLine ?? null }
}

/** 이번 차례에 말할 일한 시간(ms): 간격 × (1 + 0.15 × (2 × 흔들기 − 1)) */
export function nudgeDueMs(intervalMin: number, jitter: number): number {
  return Math.round(intervalMin * 60_000 * (1 + NUDGE.jitter * (2 * unit(jitter) - 1)))
}

/** 말을 걸 수 없는 까닭 하나(전체 화면 → 숨김 → 말풍선 끔 → 펫이 하던 일). 걸 수 있으면 null */
export function nudgeBlock(c: NudgeConditions): NudgeSkipReason | null {
  if (c.fullscreen) return 'fullscreen'
  if (!c.shown) return 'hidden'
  if (!c.bubbles) return 'bubbles-off'
  return c.busy
}

/** 문구 번호 하나. 처음은 전체에서, 그 뒤에는 바로 앞 줄을 뺀 나머지에서 고른다(random 한 번) */
export function pickNudgeLine(last: number | null, count: number, random: () => number): number {
  const n = Math.max(1, Math.floor(count))
  const r = unit(random())
  if (last === null || n === 1 || !(last >= 0 && last < n)) return Math.min(n - 1, Math.floor(r * n))
  const i = Math.min(n - 2, Math.floor(r * (n - 1)))
  return i >= last ? i + 1 : i
}

/**
 * 확인 한 번(1분에 한 번 이하): 지난 확인 뒤 일한 시간을 더하고 말할지·건너뛸지·기다릴지 정한다.
 * - 입력 없는 시간 5분 미만이면 지난 확인 뒤 시간을 일한 시간으로 센다(확인 사이가 2분을 넘으면 그 사이는 세지 않는다).
 * - 입력 없는 시간이나 확인 사이 빈 시간이 10분 이상이면(시계가 뒤로 가도) 쉰 것으로 보고 처음부터 센다.
 * - 간격에 닿아도 마지막 입력이 1분 이상 전이면 돌아올 때까지 기다린다.
 * - 말할 수 없으면 건너뛰고 3분 뒤 한 번만 더 확인한다(말풍선 끔은 다시 확인하지 않는다). 그때도 안 되면 버리고 처음부터 센다.
 * - 말하면 바로 앞 줄이 아닌 문구를 고르고 처음부터 센다(새 흔들기).
 */
export function nextNudge(s: NudgeState, now: number, idleMs: number, c: NudgeInput): NudgeDecision {
  if (!Number.isFinite(now)) return { action: 'wait', reason: 'paused', state: s }
  const idle = Number.isFinite(idleMs) && idleMs > 0 ? idleMs : 0
  const back = s.lastAt !== null && now < s.lastAt
  const gap = s.lastAt === null || back ? null : now - s.lastAt
  const fresh = (lastLine: number | null): NudgeState => startNudge({ now, random: c.random, lastLine })

  if (back || idle >= NUDGE.breakIdleMs || (gap !== null && gap >= NUDGE.breakIdleMs)) {
    // 쉬는 동안 확인이 이어져도 이미 처음부터인 차례는 그대로 둔다(흔들기를 다시 뽑지 않는다)
    const state = s.activeMs === 0 && s.retryAt === null && !back ? { ...s, lastAt: now } : fresh(s.lastLine)
    return { action: 'wait', reason: 'break', state }
  }
  const working = idle < NUDGE.activeIdleMs
  const credit = working && gap !== null && gap <= NUDGE.maxStepMs ? gap : 0
  const counted: NudgeState = { ...s, lastAt: now, activeMs: s.activeMs + credit }
  if (!working) return { action: 'wait', reason: 'paused', state: counted }
  // 간격을 늘려 다시 세는 중이면 기다리던 한 번 더 확인도 없앤다
  if (counted.activeMs < nudgeDueMs(c.intervalMin, s.jitter)) return { action: 'wait', reason: 'counting', state: { ...counted, retryAt: null } }
  if (counted.retryAt !== null && now < counted.retryAt) return { action: 'wait', reason: 'retry-later', state: counted }
  if (idle >= NUDGE.presentIdleMs) return { action: 'wait', reason: 'away', state: counted }

  const reason = nudgeBlock(c)
  if (reason !== null) {
    const retry = counted.retryAt === null && reason !== 'bubbles-off'
    return retry
      ? { action: 'skip', reason, retry, state: { ...counted, retryAt: now + NUDGE.retryMs } }
      : { action: 'skip', reason, retry, state: fresh(s.lastLine) }
  }
  const line = pickNudgeLine(s.lastLine, PET_NUDGE_LINES.length, c.random)
  return { action: 'speak', line, state: fresh(line) }
}
