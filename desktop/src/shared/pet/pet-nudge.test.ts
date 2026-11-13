import { describe, expect, it } from 'vitest'
import { PET_NUDGE_LINES } from './pet-copy'
import {
  NUDGE,
  nextNudge,
  nudgeBlock,
  nudgeDueMs,
  pickNudgeLine,
  startNudge,
  type NudgeConditions,
  type NudgeDecision,
  type NudgeInput,
  type NudgeSkipReason,
  type NudgeState
} from './pet-nudge'

const MIN = 60_000

/** 차례로 돌려주고 다 쓰면 마지막 값을 되풀이하는 가짜 난수 */
function seq(...values: number[]): () => number {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

const FREE: NudgeConditions = { shown: true, fullscreen: false, bubbles: true, busy: null }
const reasonOf = (d: NudgeDecision): string | null => ('reason' in d ? d.reason : null)

/** 가짜 시계: 0분에 시작해 확인마다 1분씩 간다(런타임과 같이 1분에 한 번 확인) */
function sim(o: { random?: () => number; interval?: number } = {}) {
  const random = o.random ?? (() => 0.5)
  let now = 0
  let state: NudgeState = startNudge({ now, random })
  const log: NudgeDecision[] = []
  return {
    get state(): NudgeState {
      return state
    },
    get now(): number {
      return now
    },
    log,
    /** n번 확인한다. idleMin: 그때의 입력 없는 시간(분), c: 그때의 조건 */
    tick(n = 1, idleMin = 0, c: Partial<NudgeInput> = {}): NudgeDecision {
      let d: NudgeDecision | null = null
      for (let i = 0; i < n; i++) {
        now += MIN
        d = nextNudge(state, now, idleMin * MIN, { ...FREE, intervalMin: o.interval ?? 60, random, ...c })
        state = d.state
        log.push(d)
      }
      return d!
    }
  }
}

describe('간격과 흔들기', () => {
  it('간격은 ±15%로 흔든다: 흔들기 0이면 51분, 0.5면 60분, 1이면 69분. 30·45·90분도 같은 비율', () => {
    expect(NUDGE.jitter).toBe(0.15)
    expect(nudgeDueMs(60, 0)).toBe(51 * MIN)
    expect(nudgeDueMs(60, 0.5)).toBe(60 * MIN)
    expect(nudgeDueMs(60, 1)).toBe(69 * MIN)
    expect(nudgeDueMs(30, 0)).toBe(25.5 * MIN)
    expect(nudgeDueMs(45, 0.5)).toBe(45 * MIN)
    expect(nudgeDueMs(90, 1)).toBe(103.5 * MIN)
  })

  it('startNudge: 센 시간 0, 지금 시각에서 시작, 흔들기는 random 한 번(0~1로 자름), 마지막 줄은 이어받는다', () => {
    expect(startNudge({ now: 5, random: () => 0.25 })).toEqual({
      activeMs: 0,
      lastAt: 5,
      jitter: 0.25,
      retryAt: null,
      lastLine: null
    })
    expect(startNudge({ now: 0, random: () => 7, lastLine: 2 })).toMatchObject({ jitter: 1, lastLine: 2 })
    expect(startNudge({ now: 0, random: () => Number.NaN }).jitter).toBe(0.5)
  })

  it('1분마다 확인하며 일한 시간이 간격(흔들기 0.5 → 60분)에 닿은 첫 확인에서 말하고, 처음부터 다시 센다', () => {
    const s = sim()
    for (let k = 1; k < 60; k++) expect(s.tick(), `${k}분`).toMatchObject({ action: 'wait', reason: 'counting' })
    expect(s.tick()).toMatchObject({ action: 'speak', line: 3 })
    expect(s.state).toMatchObject({ activeMs: 0, lastAt: 60 * MIN, retryAt: null, lastLine: 3 })
    expect(s.tick()).toMatchObject({ action: 'wait', reason: 'counting' })
  })

  it('흔들기는 차례마다 새로 뽑는다: 흔들기 0이면 51분에, 다음 차례 흔들기 1이면 그 뒤 69분에 말한다', () => {
    // 시작 흔들기 0 → 51분. 말할 때 줄 뽑기 0.5, 다음 차례 흔들기 1 → 69분
    const s = sim({ random: seq(0, 0.5, 1) })
    s.tick(50)
    expect(s.log.every((d) => d.action === 'wait')).toBe(true)
    expect(s.tick()).toMatchObject({ action: 'speak', line: 3 })
    s.tick(68)
    expect(s.log.at(-1)).toMatchObject({ action: 'wait', reason: 'counting' })
    expect(s.tick()).toMatchObject({ action: 'speak' })
    expect(s.now).toBe((51 + 69) * MIN)
  })

  it('간격을 바꾸면 이번 차례에도 같은 흔들기로 새 간격을 쓴다(이미 넘었으면 다음 확인에서 말한다)', () => {
    const s = sim()
    s.tick(40)
    expect(s.tick(1, 0, { intervalMin: 30 })).toMatchObject({ action: 'speak' })
    const t = sim()
    t.tick(59)
    expect(t.tick(1, 0, { intervalMin: 90 })).toMatchObject({ action: 'wait', reason: 'counting' })
  })
})

describe('일한 시간 세기(입력 없는 시간 5분 미만 = 일하는 중, 10분 이상 = 쉼)', () => {
  it('입력 없는 시간이 5분 이상이면 그동안 세지 않고, 10분이 되기 전에 돌아오면 이어서 센다', () => {
    const s = sim()
    s.tick(30)
    expect(s.state.activeMs).toBe(30 * MIN)
    // 입력 없음 1~4분은 일하는 중(읽기 등)으로 세고, 5~9분은 세지 않는다
    for (let idle = 1; idle <= 9; idle++) s.tick(1, idle)
    expect(s.state.activeMs).toBe(34 * MIN)
    expect(s.log.slice(-5).map(reasonOf)).toEqual(['paused', 'paused', 'paused', 'paused', 'paused'])
    // 돌아와서 26분 더 일하면 60분
    for (let k = 0; k < 25; k++) expect(s.tick().action).toBe('wait')
    expect(s.tick()).toMatchObject({ action: 'speak' })
  })

  it('입력 없는 시간이 10분이 되면 쉰 것으로 보고 처음부터 센다(다시 60분을 채워야 말한다)', () => {
    const s = sim()
    s.tick(50)
    for (let idle = 1; idle <= 10; idle++) s.tick(1, idle)
    expect(s.log.at(-1)).toMatchObject({ action: 'wait', reason: 'break' })
    expect(s.state).toMatchObject({ activeMs: 0, lastAt: s.now, retryAt: null })
    for (let k = 1; k < 60; k++) expect(s.tick().action, `${k}분`).toBe('wait')
    expect(s.tick().action).toBe('speak')
  })

  it('쉬는 동안 확인이 이어져도 흔들기를 다시 뽑지 않는다(처음부터인 차례는 그대로)', () => {
    const random = seq(0.5, 0.1, 0.9)
    const s = sim({ random })
    s.tick(5)
    s.tick(1, 10)
    const jitter = s.state.jitter
    expect(jitter).toBe(0.1)
    s.tick(5, 12)
    expect(s.state.jitter).toBe(jitter)
    expect(s.log.slice(-5).every((d) => reasonOf(d) === 'break')).toBe(true)
  })

  it('확인 사이가 10분 이상 비면(절전·펫 숨김) 쉰 것으로 보고, 2분 넘게 비면 그 사이는 세지 않는다', () => {
    let d = nextNudge(startNudge({ now: 0, random: () => 0.5 }), 30 * MIN, 0, { ...FREE, intervalMin: 60, random: () => 0.5 })
    expect(d).toMatchObject({ action: 'wait', reason: 'break', state: { activeMs: 0, lastAt: 30 * MIN } })
    const at = (now: number): NudgeDecision => (d = nextNudge(d.state, now, 0, { ...FREE, intervalMin: 60, random: () => 0.5 }))
    expect(at(31 * MIN).state.activeMs).toBe(MIN)
    // 5분 비었다: 세지 않지만 쉰 것도 아니다
    expect(at(36 * MIN)).toMatchObject({ action: 'wait', reason: 'counting', state: { activeMs: MIN } })
    // 2분은 센다(타이머가 조금 늦은 것)
    expect(at(38 * MIN).state.activeMs).toBe(3 * MIN)
  })

  it('시계가 뒤로 가면 처음부터 세고, 시각이 숫자가 아니면 아무것도 바꾸지 않으며, 입력 없는 시간이 숫자가 아니면 0으로 본다', () => {
    const c = { ...FREE, intervalMin: 60, random: () => 0.5 }
    const s: NudgeState = { activeMs: 30 * MIN, lastAt: 10 * MIN, jitter: 0.5, retryAt: null, lastLine: 1 }
    expect(nextNudge(s, 5 * MIN, 0, c)).toMatchObject({ action: 'wait', reason: 'break', state: { activeMs: 0, lastAt: 5 * MIN, lastLine: 1 } })
    expect(nextNudge(s, Number.NaN, 0, c)).toEqual({ action: 'wait', reason: 'paused', state: s })
    expect(nextNudge(s, 11 * MIN, Number.NaN, c).state.activeMs).toBe(31 * MIN)
    expect(nextNudge(s, 11 * MIN, -5, c).state.activeMs).toBe(31 * MIN)
  })
})

describe('말할 때(자리에 있는지, 말할 수 없는 까닭, 한 번 더 확인)', () => {
  it('간격이 되어도 자리에 없으면(마지막 입력이 1분 이상 전) 기다렸다가 돌아오면 말한다', () => {
    const s = sim()
    s.tick(59)
    expect(s.tick(1, 2)).toMatchObject({ action: 'wait', reason: 'away' })
    expect(s.tick(1, 3)).toMatchObject({ action: 'wait', reason: 'away' })
    expect(s.tick(1, 0)).toMatchObject({ action: 'speak' })
  })

  const BLOCKED: [NudgeSkipReason, Partial<NudgeConditions>][] = [
    ['fullscreen', { shown: false, fullscreen: true }],
    ['hidden', { shown: false }],
    ['held', { busy: 'held' }],
    ['control', { busy: 'control' }],
    ['menu', { busy: 'menu' }],
    ['moving', { busy: 'moving' }],
    ['reacting', { busy: 'reacting' }]
  ]
  for (const [reason, c] of BLOCKED) {
    it(`말할 수 없으면(${reason}) 건너뛰고 3분 뒤 한 번 더 확인한다. 그때도 안 되면 버리고 처음부터 센다(쌓아 두지 않는다)`, () => {
      const s = sim()
      s.tick(59)
      expect(s.tick(1, 0, c)).toEqual({ action: 'skip', reason, retry: true, state: expect.objectContaining({ retryAt: 63 * MIN }) })
      // 그사이에는 조건이 풀려도 말하지 않는다
      expect(s.tick(1, 0)).toMatchObject({ action: 'wait', reason: 'retry-later' })
      expect(s.tick(1, 0, c)).toMatchObject({ action: 'wait', reason: 'retry-later' })
      expect(s.tick(1, 0, c)).toMatchObject({ action: 'skip', reason, retry: false })
      expect(s.state).toMatchObject({ activeMs: 0, retryAt: null, lastLine: null })
      for (let k = 1; k < 60; k++) expect(s.tick().action, `${k}분`).toBe('wait')
      expect(s.tick().action).toBe('speak')
    })
  }

  it('한 번 더 확인할 때 말할 수 있으면 말한다', () => {
    const s = sim()
    s.tick(59)
    expect(s.tick(1, 0, { busy: 'menu' })).toMatchObject({ action: 'skip', reason: 'menu', retry: true })
    s.tick(2)
    expect(s.tick()).toMatchObject({ action: 'speak' })
    expect(s.now).toBe(63 * MIN)
  })

  it('말풍선을 꺼 두었으면 다시 확인하지 않고 바로 버린다(처음부터 센다)', () => {
    const s = sim()
    s.tick(59)
    expect(s.tick(1, 0, { bubbles: false })).toMatchObject({ action: 'skip', reason: 'bubbles-off', retry: false })
    expect(s.state).toMatchObject({ activeMs: 0, retryAt: null })
  })

  it('한 번 더 확인하기 전에 쉬면(10분) 처음부터 센다', () => {
    const s = sim()
    s.tick(59)
    s.tick(1, 0, { busy: 'held' })
    s.tick(1, 10)
    expect(s.state).toMatchObject({ activeMs: 0, retryAt: null })
  })

  it('간격을 늘려 다시 세는 중이 되면 기다리던 한 번 더 확인은 없앤다(다음 간격에서 다시 한 번 더 확인할 수 있다)', () => {
    const s = sim()
    s.tick(59)
    s.tick(1, 0, { busy: 'menu' })
    expect(s.tick(1, 0, { intervalMin: 90 })).toMatchObject({ action: 'wait', reason: 'counting', state: { retryAt: null } })
    s.tick(28, 0, { intervalMin: 90 })
    expect(s.tick(1, 0, { intervalMin: 90, busy: 'menu' })).toMatchObject({ action: 'skip', reason: 'menu', retry: true })
  })

  it('까닭이 여럿이면 전체 화면 → 숨김 → 말풍선 끔 → 펫이 하던 일 순서로 하나만 알린다', () => {
    expect(nudgeBlock({ shown: false, fullscreen: true, bubbles: false, busy: 'held' })).toBe('fullscreen')
    expect(nudgeBlock({ shown: false, fullscreen: false, bubbles: false, busy: 'held' })).toBe('hidden')
    expect(nudgeBlock({ shown: true, fullscreen: false, bubbles: false, busy: 'held' })).toBe('bubbles-off')
    expect(nudgeBlock({ ...FREE, busy: 'control' })).toBe('control')
    expect(nudgeBlock(FREE)).toBeNull()
  })
})

describe('문구 고르기(바로 앞 줄은 다시 고르지 않는다)', () => {
  it('pickNudgeLine: 처음은 전체에서, 그 뒤에는 바로 앞 줄을 뺀 나머지에서 고른다', () => {
    const n = PET_NUDGE_LINES.length
    expect(pickNudgeLine(null, n, () => 0)).toBe(0)
    expect(pickNudgeLine(null, n, () => 0.999)).toBe(n - 1)
    for (let last = 0; last < n; last++) {
      const seen = new Set<number>()
      for (let k = 0; k < 100; k++) {
        const i = pickNudgeLine(last, n, () => k / 100)
        expect(i, `앞 줄 ${last}, 난수 ${k / 100}`).not.toBe(last)
        expect(i).toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThan(n)
        seen.add(i)
      }
      // 나머지 줄은 모두 나올 수 있다
      expect(seen.size).toBe(n - 1)
    }
  })

  it('난수가 1이거나 숫자가 아니어도, 앞 줄 번호가 목록 밖이어도 목록 안의 줄을 고른다', () => {
    const n = PET_NUDGE_LINES.length
    expect(pickNudgeLine(2, n, () => 1)).toBe(n - 1)
    expect(pickNudgeLine(null, n, () => Number.NaN)).toBe(Math.floor(n / 2))
    expect(pickNudgeLine(99, n, () => 0)).toBe(0)
    expect(pickNudgeLine(0, 1, () => 0.7)).toBe(0)
  })

  it('말할 때마다 바로 앞 줄과 다른 줄이다(같은 난수가 계속 나와도)', () => {
    const s = sim({ interval: 30 })
    const lines: number[] = []
    for (let i = 0; i < 12; i++) {
      s.tick(29)
      const d = s.tick()
      if (d.action !== 'speak') throw new Error(`${i}번째: ${d.action}`)
      lines.push(d.line)
    }
    for (let i = 1; i < lines.length; i++) expect(lines[i]).not.toBe(lines[i - 1])
    for (const i of lines) expect(PET_NUDGE_LINES[i]).toBeTruthy()
  })
})
