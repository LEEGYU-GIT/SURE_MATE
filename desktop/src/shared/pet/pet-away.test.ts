import { describe, expect, it } from 'vitest'
import { AWAY, nextAway, type AwayInput, type AwayState } from './pet-away'

const MIN = 60_000
/** 기본 설정: 20분 기준, 2분 전 → 18분에 알린다 */
const WARN_AT = 18 * MIN
const LIMIT = 20 * MIN

const fresh: AwayState = { warned: false }
const warned: AwayState = { warned: true }
const input = (o: Partial<AwayInput> = {}): AwayInput => ({
  idleMs: 0,
  enabled: true,
  installed: true,
  locked: false,
  afterMin: 20,
  leadMin: 2,
  ...o
})

describe('AWAY: 확인 간격', () => {
  it('알린 뒤 2초마다, 알릴 때 전에는 1초~1분', () => {
    expect(AWAY).toEqual({ watchMs: 2_000, minCheckMs: 1_000, maxCheckMs: 60_000 })
  })
})

describe('nextAway: Ttree 이석 미리 알림(2026-11-13)', () => {
  it('알릴 때(기준 − 미리 알림 분) 전: 기다린다. 다음 확인은 알릴 때까지 남은 시간(1초~1분)', () => {
    expect(nextAway(fresh, input({ idleMs: 0 }))).toEqual({
      action: 'wait',
      reason: 'active',
      nextMs: AWAY.maxCheckMs,
      state: { warned: false }
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
      state: { warned: true }
    })
    // 늦게 봤으면 남은 시간만큼(기준 1밀리초 전까지)
    expect(nextAway(fresh, input({ idleMs: 19 * MIN }))).toMatchObject({
      action: 'warn',
      holdMs: MIN
    })
    expect(nextAway(fresh, input({ idleMs: LIMIT - 1 }))).toMatchObject({
      action: 'warn',
      holdMs: 1
    })
  })

  it('이미 알렸으면 다시 알리지 않고 2초마다 본다', () => {
    expect(nextAway(warned, input({ idleMs: WARN_AT }))).toEqual({
      action: 'wait',
      reason: 'warned',
      nextMs: AWAY.watchMs,
      state: { warned: true }
    })
    expect(nextAway(warned, input({ idleMs: LIMIT - 1 })).action).toBe('wait')
  })

  it('기준에 닿았거나 넘겼으면 늦게 알리지 않는다(Ttree가 이미 잡았다). 알린 것으로 치고 2초마다 본다', () => {
    for (const s of [fresh, warned]) {
      for (const idleMs of [LIMIT, LIMIT + 1, 3 * 60 * MIN]) {
        expect(nextAway(s, input({ idleMs })), `${s.warned} ${idleMs}`).toEqual({
          action: 'wait',
          reason: 'past-limit',
          nextMs: AWAY.watchMs,
          state: { warned: true }
        })
      }
    }
  })

  it('알린 뒤(기준을 넘긴 뒤에도) 입력이 돌아오면 알림을 닫고 다음 알릴 때를 기다린다', () => {
    expect(nextAway(warned, input({ idleMs: 3_000 }))).toEqual({
      action: 'clear',
      reason: 'input',
      nextMs: AWAY.maxCheckMs,
      state: { warned: false }
    })
    expect(nextAway(warned, input({ idleMs: WARN_AT - 1 }))).toMatchObject({
      action: 'clear',
      reason: 'input',
      nextMs: AWAY.minCheckMs
    })
  })

  it('한 번 이어지는 동안: 기다림 → 알림 → 알림 유지 → 기준 넘김 → 입력이 돌아와 닫음 → 다시 기다림', () => {
    let s: AwayState = fresh
    const seen: string[] = []
    for (const idleMs of [
      0,
      10 * MIN,
      WARN_AT,
      WARN_AT + 2_000,
      LIMIT,
      LIMIT + 2_000,
      1_000,
      2_000
    ]) {
      const d = nextAway(s, input({ idleMs }))
      s = d.state
      seen.push(d.action === 'warn' ? 'warn' : `${d.action}:${d.reason}`)
    }
    expect(seen).toEqual([
      'wait:active',
      'wait:active',
      'warn',
      'wait:warned',
      'wait:past-limit',
      'wait:past-limit',
      'clear:input',
      'wait:active'
    ])
    // 다음에 이어질 때 다시 한 번 알린다
    expect(nextAway(s, input({ idleMs: WARN_AT })).action).toBe('warn')
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
        state: { warned: false }
      })
      expect(nextAway(warned, input({ idleMs })), String(idleMs)).toMatchObject({
        action: 'clear',
        reason: 'input'
      })
    }
  })

  it('꺼짐·Ttree 없음: 알리지 않고 1분 뒤 다시 본다. 떠 있던 알림은 닫는다', () => {
    for (const o of [
      { enabled: false },
      { installed: false },
      { enabled: false, installed: false }
    ]) {
      // 알릴 때 안이어도
      expect(nextAway(fresh, input({ ...o, idleMs: WARN_AT })), JSON.stringify(o)).toEqual({
        action: 'wait',
        reason: 'off',
        nextMs: AWAY.maxCheckMs,
        state: { warned: false }
      })
      expect(nextAway(warned, input({ ...o, idleMs: WARN_AT })), JSON.stringify(o)).toEqual({
        action: 'clear',
        reason: 'off',
        nextMs: AWAY.maxCheckMs,
        state: { warned: false }
      })
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
      expect(nextAway(fresh, input({ ...o, idleMs: WARN_AT })), JSON.stringify(o)).toMatchObject({
        action: 'wait',
        reason: 'off',
        nextMs: AWAY.maxCheckMs
      })
      expect(nextAway(warned, input({ ...o, idleMs: WARN_AT })), JSON.stringify(o)).toMatchObject({
        action: 'clear',
        reason: 'off'
      })
    }
    // 1분 전·기준 바로 아래는 맞는 값이다
    expect(nextAway(fresh, input({ afterMin: 10, leadMin: 9, idleMs: MIN })).action).toBe('warn')
  })

  it('잠금 화면(자리를 비우기로 했다): 알리지 않고 1분 뒤 다시 본다. 떠 있던 알림은 닫는다', () => {
    expect(nextAway(fresh, input({ locked: true, idleMs: WARN_AT }))).toEqual({
      action: 'wait',
      reason: 'locked',
      nextMs: AWAY.maxCheckMs,
      state: { warned: false }
    })
    expect(nextAway(warned, input({ locked: true, idleMs: WARN_AT }))).toEqual({
      action: 'clear',
      reason: 'locked',
      nextMs: AWAY.maxCheckMs,
      state: { warned: false }
    })
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
    const s: AwayState = { warned: false }
    nextAway(s, input({ idleMs: WARN_AT }))
    expect(s).toEqual({ warned: false })
    const w: AwayState = { warned: true }
    nextAway(w, input({ idleMs: 0 }))
    expect(w).toEqual({ warned: true })
  })
})
