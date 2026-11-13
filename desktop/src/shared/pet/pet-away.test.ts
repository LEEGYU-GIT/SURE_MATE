import { describe, expect, it } from 'vitest'
import { AWAY, nextAway, type AwayDecision, type AwayInput, type AwayState } from './pet-away'

const MIN = 60_000
const SEC = 1_000
/** 기본 설정: 20분 기준, 2분 전 → 18분에 알린다. 19분 30초부터 초를 센다 */
const WARN_AT = 18 * MIN
const LIMIT = 20 * MIN
const COUNT_AT = LIMIT - 30 * SEC

const fresh: AwayState = { warned: false, seconds: null }
const warned: AwayState = { warned: true, seconds: null }
/** 초 세기 중(마지막으로 보낸 숫자 n) */
const counting = (n: number): AwayState => ({ warned: true, seconds: n })
const input = (o: Partial<AwayInput> = {}): AwayInput => ({
  idleMs: 0,
  enabled: true,
  installed: true,
  locked: false,
  afterMin: 20,
  leadMin: 2,
  ...o
})
const label = (d: AwayDecision): string =>
  d.action === 'warn'
    ? 'warn'
    : d.action === 'tick'
      ? `tick:${d.seconds}${d.first ? ':first' : ''}`
      : `${d.action}:${d.reason}`

describe('AWAY: 확인 간격', () => {
  it('알린 뒤 2초마다, 알릴 때 전에는 1초~1분, 기준 30초 전부터 0.25초마다', () => {
    expect(AWAY).toEqual({
      watchMs: 2_000,
      minCheckMs: 1_000,
      maxCheckMs: 60_000,
      countdownMs: 30_000,
      tickMs: 250
    })
  })
})

describe('nextAway: Ttree 이석 미리 알림(2026-11-13)', () => {
  it('알릴 때(기준 − 미리 알림 분) 전: 기다린다. 다음 확인은 알릴 때까지 남은 시간(1초~1분)', () => {
    expect(nextAway(fresh, input({ idleMs: 0 }))).toEqual({
      action: 'wait',
      reason: 'active',
      nextMs: AWAY.maxCheckMs,
      state: { warned: false, seconds: null }
    })
    // 남은 시간이 1분 안이면 그만큼만
    expect(nextAway(fresh, input({ idleMs: WARN_AT - 30_000 })).nextMs).toBe(30_000)
    // 1초보다 짧게는 다시 보지 않는다
    expect(nextAway(fresh, input({ idleMs: WARN_AT - 500 })).nextMs).toBe(AWAY.minCheckMs)
    expect(nextAway(fresh, input({ idleMs: WARN_AT - 1 }))).toMatchObject({
      action: 'wait',
      reason: 'active',
      nextMs: AWAY.minCheckMs
    })
    // 1분 넘게 남았으면 1분 뒤
    expect(nextAway(fresh, input({ idleMs: WARN_AT - 61_000 })).nextMs).toBe(AWAY.maxCheckMs)
  })

  it('알릴 때에 딱 닿으면 알린다: 기준까지 남은 시간 동안, 2초마다 입력이 돌아왔는지 본다', () => {
    expect(nextAway(fresh, input({ idleMs: WARN_AT }))).toEqual({
      action: 'warn',
      holdMs: 2 * MIN,
      nextMs: AWAY.watchMs,
      state: { warned: true, seconds: null }
    })
    // 늦게 봤으면 남은 시간만큼(초 세기 전까지)
    expect(nextAway(fresh, input({ idleMs: 19 * MIN }))).toMatchObject({
      action: 'warn',
      holdMs: MIN
    })
    expect(nextAway(fresh, input({ idleMs: COUNT_AT - 1 }))).toMatchObject({
      action: 'warn',
      holdMs: 30 * SEC + 1
    })
  })

  it('이미 알렸으면 다시 알리지 않고 2초마다 본다', () => {
    expect(nextAway(warned, input({ idleMs: WARN_AT }))).toEqual({
      action: 'wait',
      reason: 'warned',
      nextMs: AWAY.watchMs,
      state: { warned: true, seconds: null }
    })
    expect(nextAway(warned, input({ idleMs: 19 * MIN })).action).toBe('wait')
  })

  it('기준에 닿았거나 넘겼으면 늦게 알리지 않는다(Ttree가 이미 잡았다). 알린 것으로 치고 2초마다 본다', () => {
    for (const s of [fresh, warned, counting(1)]) {
      for (const idleMs of [LIMIT, LIMIT + 1, 3 * 60 * MIN]) {
        expect(nextAway(s, input({ idleMs })), `${JSON.stringify(s)} ${idleMs}`).toEqual({
          action: 'wait',
          reason: 'past-limit',
          nextMs: AWAY.watchMs,
          state: { warned: true, seconds: null }
        })
      }
    }
  })

  it('알린 뒤(기준을 넘긴 뒤에도) 입력이 돌아오면 알림을 닫고 다음 알릴 때를 기다린다', () => {
    expect(nextAway(warned, input({ idleMs: 3_000 }))).toEqual({
      action: 'clear',
      reason: 'input',
      nextMs: AWAY.maxCheckMs,
      state: { warned: false, seconds: null }
    })
    expect(nextAway(warned, input({ idleMs: WARN_AT - 1 }))).toMatchObject({
      action: 'clear',
      reason: 'input',
      nextMs: AWAY.minCheckMs
    })
  })

  it('한 번 이어지는 동안: 기다림 → 알림 → 알림 유지 → 초 세기 → 기준 넘김 → 입력이 돌아와 닫음 → 다시 기다림', () => {
    let s: AwayState = fresh
    const seen: string[] = []
    for (const idleMs of [
      0,
      10 * MIN,
      WARN_AT,
      WARN_AT + 2_000,
      COUNT_AT,
      COUNT_AT + SEC,
      LIMIT,
      LIMIT + 2_000,
      1_000,
      2_000
    ]) {
      const d = nextAway(s, input({ idleMs }))
      s = d.state
      seen.push(label(d))
    }
    expect(seen).toEqual([
      'wait:active',
      'wait:active',
      'warn',
      'wait:warned',
      'tick:30:first',
      'tick:29',
      'wait:past-limit',
      'wait:past-limit',
      'clear:input',
      'wait:active'
    ])
    // 다음에 이어질 때 다시 한 번 알리고, 초 세기도 처음부터(첫 숫자) 다시 한다
    s = nextAway(s, input({ idleMs: WARN_AT })).state
    expect(s).toEqual({ warned: true, seconds: null })
    expect(nextAway(s, input({ idleMs: COUNT_AT }))).toMatchObject({
      action: 'tick',
      seconds: 30,
      first: true
    })
  })

  it('알리지 않은 채 기준을 넘긴 뒤 돌아와도 닫는다(닫을 것이 없어도 런타임이 기록만 한다)', () => {
    const past = nextAway(fresh, input({ idleMs: LIMIT })).state
    expect(nextAway(past, input({ idleMs: 0 })).action).toBe('clear')
  })

  it('입력 없는 시간이 숫자가 아니거나(끝없음 포함) 음수면 0(방금 입력이 있었다)으로 본다', () => {
    for (const idleMs of [NaN, -1, Infinity, -Infinity]) {
      expect(nextAway(fresh, input({ idleMs })), String(idleMs)).toEqual({
        action: 'wait',
        reason: 'active',
        nextMs: AWAY.maxCheckMs,
        state: { warned: false, seconds: null }
      })
      for (const s of [warned, counting(12)]) {
        expect(nextAway(s, input({ idleMs })), String(idleMs)).toMatchObject({
          action: 'clear',
          reason: 'input',
          state: { warned: false, seconds: null }
        })
      }
    }
  })

  it('꺼짐·Ttree 없음: 알리지 않고 1분 뒤 다시 본다. 떠 있던 알림(초 세기 포함)은 닫는다', () => {
    for (const o of [
      { enabled: false },
      { installed: false },
      { enabled: false, installed: false }
    ]) {
      // 알릴 때·초 세기 안이어도
      for (const idleMs of [WARN_AT, COUNT_AT + 5 * SEC]) {
        expect(nextAway(fresh, input({ ...o, idleMs })), JSON.stringify(o)).toEqual({
          action: 'wait',
          reason: 'off',
          nextMs: AWAY.maxCheckMs,
          state: { warned: false, seconds: null }
        })
      }
      for (const s of [warned, counting(25)]) {
        const d = nextAway(s, input({ ...o, idleMs: COUNT_AT + 5 * SEC }))
        expect(d, JSON.stringify(o)).toEqual({
          action: 'clear',
          reason: 'off',
          nextMs: AWAY.maxCheckMs,
          state: { warned: false, seconds: null }
        })
      }
    }
  })

  it('분이 맞지 않으면(미리 알림 분이 0 이하·기준 이상, 숫자가 아님) 꺼짐으로 본다', () => {
    const bad: Partial<AwayInput>[] = [
      { leadMin: 0 },
      { leadMin: -2 },
      { leadMin: 20 },
      { leadMin: 25 },
      { afterMin: 0, leadMin: 1 },
      { afterMin: NaN },
      { leadMin: NaN },
      { afterMin: Infinity },
      { leadMin: Infinity }
    ]
    for (const o of bad) {
      for (const idleMs of [WARN_AT, COUNT_AT]) {
        expect(nextAway(fresh, input({ ...o, idleMs })), JSON.stringify(o)).toMatchObject({
          action: 'wait',
          reason: 'off',
          nextMs: AWAY.maxCheckMs
        })
        expect(nextAway(warned, input({ ...o, idleMs })), JSON.stringify(o)).toMatchObject({
          action: 'clear',
          reason: 'off'
        })
      }
    }
    // 1분 전·기준 바로 아래는 맞는 값이다
    expect(nextAway(fresh, input({ afterMin: 10, leadMin: 9, idleMs: MIN })).action).toBe('warn')
  })

  it('잠금 화면(자리를 비우기로 했다): 알리지 않고 1분 뒤 다시 본다. 떠 있던 알림(초 세기 포함)은 닫는다', () => {
    expect(nextAway(fresh, input({ locked: true, idleMs: WARN_AT }))).toEqual({
      action: 'wait',
      reason: 'locked',
      nextMs: AWAY.maxCheckMs,
      state: { warned: false, seconds: null }
    })
    expect(nextAway(fresh, input({ locked: true, idleMs: COUNT_AT })).action).toBe('wait')
    for (const s of [warned, counting(3)]) {
      expect(nextAway(s, input({ locked: true, idleMs: COUNT_AT + 27 * SEC }))).toEqual({
        action: 'clear',
        reason: 'locked',
        nextMs: AWAY.maxCheckMs,
        state: { warned: false, seconds: null }
      })
    }
    // 꺼짐이 먼저다
    expect(nextAway(warned, input({ locked: true, enabled: false }))).toMatchObject({
      action: 'clear',
      reason: 'off'
    })
  })

  it('설정의 기준·미리 알림 분을 쓴다(10분 기준 5분 전 → 5분에 5분 동안, 30분 기준 1분 전 → 29분에 1분 동안)', () => {
    expect(nextAway(fresh, input({ afterMin: 10, leadMin: 5, idleMs: 5 * MIN - 1 })).action).toBe(
      'wait'
    )
    expect(nextAway(fresh, input({ afterMin: 10, leadMin: 5, idleMs: 5 * MIN }))).toMatchObject({
      action: 'warn',
      holdMs: 5 * MIN
    })
    expect(nextAway(fresh, input({ afterMin: 30, leadMin: 1, idleMs: 29 * MIN }))).toMatchObject({
      action: 'warn',
      holdMs: MIN
    })
    expect(nextAway(fresh, input({ afterMin: 30, leadMin: 1, idleMs: 30 * MIN })).action).toBe(
      'wait'
    )
  })

  it('받은 상태를 고치지 않는다', () => {
    const s: AwayState = { warned: false, seconds: null }
    nextAway(s, input({ idleMs: WARN_AT }))
    nextAway(s, input({ idleMs: COUNT_AT }))
    expect(s).toEqual({ warned: false, seconds: null })
    const w: AwayState = { warned: true, seconds: 7 }
    nextAway(w, input({ idleMs: 0 }))
    nextAway(w, input({ idleMs: LIMIT - 6 * SEC }))
    expect(w).toEqual({ warned: true, seconds: 7 })
  })
})

describe('nextAway: 기준 30초 전부터 초 세기(2026-11-13 사용자 요청 "19분 30초가 되면 초 단위로")', () => {
  it('알린 뒤 초 세기 전: 초 세기가 제때 시작하도록 다음 확인을 남은 시간으로 맞춘다(0.25초~2초)', () => {
    const next = (idleMs: number): number => nextAway(warned, input({ idleMs })).nextMs
    expect(next(WARN_AT)).toBe(AWAY.watchMs)
    expect(next(COUNT_AT - 2 * SEC)).toBe(AWAY.watchMs) // 19:28
    expect(next(COUNT_AT - SEC)).toBe(SEC) // 19:29
    expect(next(COUNT_AT - 500)).toBe(500) // 19:29.5
    expect(next(COUNT_AT - 100)).toBe(AWAY.tickMs) // 19:29.9 → 0.25초보다 짧게는 보지 않는다
    expect(next(COUNT_AT - 1)).toBe(AWAY.tickMs) // 19:29.999
    // 알리는 확인도 같다(19분 29.5초에 처음 알리면 0.5초 뒤 초 세기)
    expect(nextAway(fresh, input({ idleMs: COUNT_AT - 500 }))).toEqual({
      action: 'warn',
      holdMs: 30_500,
      nextMs: 500,
      state: { warned: true, seconds: null }
    })
  })

  it('19분 29.x초는 아직 세지 않고, 19분 30초에 첫 숫자 30(새로 알림, 기준까지 30초)', () => {
    for (const idleMs of [COUNT_AT - 999, COUNT_AT - 1]) {
      expect(nextAway(warned, input({ idleMs })), String(idleMs)).toMatchObject({
        action: 'wait',
        reason: 'warned'
      })
    }
    expect(nextAway(warned, input({ idleMs: COUNT_AT }))).toEqual({
      action: 'tick',
      seconds: 30,
      first: true,
      holdMs: 30 * SEC,
      nextMs: AWAY.tickMs,
      state: { warned: true, seconds: 30 }
    })
  })

  it('숫자는 기준까지 남은 초를 올린 값이다: 같은 숫자는 다시 보내지 않고(counting), 바뀌면 tick(첫 숫자 아님)', () => {
    // 19:30.2 → 남은 29.8초 → 30(이미 보냄)
    expect(nextAway(counting(30), input({ idleMs: COUNT_AT + 200 }))).toEqual({
      action: 'wait',
      reason: 'counting',
      nextMs: AWAY.tickMs,
      state: { warned: true, seconds: 30 }
    })
    // 19:30.001은 아직 30, 19:31은 29
    expect(nextAway(counting(30), input({ idleMs: COUNT_AT + 1 })).action).toBe('wait')
    expect(nextAway(counting(30), input({ idleMs: COUNT_AT + SEC }))).toEqual({
      action: 'tick',
      seconds: 29,
      first: false,
      holdMs: 29 * SEC,
      nextMs: AWAY.tickMs,
      state: { warned: true, seconds: 29 }
    })
  })

  it('19분 59초는 1, 19분 59.999초도 1, 20분(기준)에는 세지 않고 기준 넘김(2초마다)', () => {
    expect(nextAway(counting(2), input({ idleMs: LIMIT - SEC }))).toMatchObject({
      action: 'tick',
      seconds: 1,
      first: false,
      holdMs: SEC
    })
    expect(nextAway(counting(2), input({ idleMs: LIMIT - 1 }))).toMatchObject({
      action: 'tick',
      seconds: 1,
      holdMs: 1
    })
    expect(nextAway(counting(1), input({ idleMs: LIMIT - 1 })).action).toBe('wait')
    expect(nextAway(counting(1), input({ idleMs: LIMIT }))).toEqual({
      action: 'wait',
      reason: 'past-limit',
      nextMs: AWAY.watchMs,
      state: { warned: true, seconds: null }
    })
  })

  it('알리지 않은 채 초 세기에 닿으면(19분 40초에 켬) 첫 숫자가 알림이다: 남은 초부터 센다', () => {
    expect(nextAway(fresh, input({ idleMs: COUNT_AT + 10 * SEC }))).toEqual({
      action: 'tick',
      seconds: 20,
      first: true,
      holdMs: 20 * SEC,
      nextMs: AWAY.tickMs,
      state: { warned: true, seconds: 20 }
    })
    expect(nextAway(fresh, input({ idleMs: LIMIT - 1 }))).toMatchObject({
      action: 'tick',
      seconds: 1,
      first: true,
      holdMs: 1
    })
  })

  it('한 번 이어지는 동안(Windows처럼 초 단위 값을 0.25초마다 읽음): 30부터 1까지 한 번씩, 첫 숫자만 first', () => {
    let s: AwayState = warned
    const ticks: string[] = []
    // 19:29부터 20:00 넘어서까지 0.25초마다
    for (let t = COUNT_AT - SEC; t <= LIMIT + 2 * SEC; t += AWAY.tickMs) {
      const d = nextAway(s, input({ idleMs: Math.floor(t / SEC) * SEC }))
      s = d.state
      if (d.action === 'tick') ticks.push(label(d))
      else expect(d.action, String(t)).toBe('wait')
    }
    expect(ticks).toEqual([
      'tick:30:first',
      ...Array.from({ length: 29 }, (_, k) => `tick:${29 - k}`)
    ])
    expect(s).toEqual({ warned: true, seconds: null })
  })

  it('초 세기 중 입력이 돌아오면 닫고, 다음에 이어질 때 초 세기는 첫 숫자부터 다시 한다', () => {
    const d = nextAway(counting(12), input({ idleMs: 0 }))
    expect(d).toEqual({
      action: 'clear',
      reason: 'input',
      nextMs: AWAY.maxCheckMs,
      state: { warned: false, seconds: null }
    })
    expect(nextAway(d.state, input({ idleMs: COUNT_AT + 18 * SEC }))).toMatchObject({
      action: 'tick',
      seconds: 12,
      first: true
    })
  })

  it('미리 알림이 30초보다 짧으면 알릴 때 전에는 세지 않고, 알릴 때의 첫 숫자가 알림이다(15초 전 → 15부터)', () => {
    const short = { afterMin: 20, leadMin: 0.25 }
    expect(nextAway(fresh, input({ ...short, idleMs: COUNT_AT }))).toMatchObject({
      action: 'wait',
      reason: 'active'
    })
    expect(nextAway(fresh, input({ ...short, idleMs: LIMIT - 15 * SEC }))).toEqual({
      action: 'tick',
      seconds: 15,
      first: true,
      holdMs: 15 * SEC,
      nextMs: AWAY.tickMs,
      state: { warned: true, seconds: 15 }
    })
  })

  it('설정의 기준을 쓴다(10분 기준이면 9분 30초부터 30)', () => {
    const ten = (idleMs: number): AwayDecision =>
      nextAway(warned, input({ afterMin: 10, leadMin: 5, idleMs }))
    expect(ten(9 * MIN + 29 * SEC)).toMatchObject({
      action: 'wait',
      reason: 'warned',
      nextMs: SEC
    })
    expect(ten(9 * MIN + 30 * SEC)).toMatchObject({
      action: 'tick',
      seconds: 30,
      first: true
    })
  })
})
