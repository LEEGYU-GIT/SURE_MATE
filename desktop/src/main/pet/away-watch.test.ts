import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AWAY } from '../../shared/pet/pet-away'
import { petAwayCountdownLine, petAwayLine } from '../../shared/pet/pet-copy'
import { DEFAULT_PET_SETTINGS, type PetSettings } from '../../shared/pet/pet-settings'
import { globalTimers } from '../bar/test-timers'
import { createAwayWatch, type AwayWatch } from './away-watch'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const MIN = 60_000
/** 기본 설정(20분 기준, 2분 전)의 문구 */
const TEXT = petAwayLine(2)

/** 시험이 바꾸는 바깥 값. 입력 없는 시간은 마지막 입력(가짜 시계) 뒤 초(Windows처럼 내림) */
type Env = {
  settings: PetSettings
  installed: boolean
  locked: boolean
  lastInput: number
  /** 펫이 말풍선으로 알릴 수 있는지 */
  pet: boolean
  /** 떠 있는 이석 알림 말풍선 문구(가짜 펫: petWarn이 띄우고 petUpdate가 바꾸고 petClear가 닫는다) */
  bubble: string | null
}

type Harness = {
  w: AwayWatch
  env: Env
  /** 키보드·마우스 입력(마지막 입력 시각을 지금으로) */
  input(): void
  settings: Mock<() => PetSettings>
  installed: Mock<() => boolean>
  idleSeconds: Mock<() => number>
  locked: Mock<() => boolean>
  petWarn: Mock<(text: string, holdMs: number) => boolean>
  petUpdate: Mock<(text: string) => boolean>
  petClear: Mock<() => void>
  notify: Mock<(text: string) => void>
  log: Mock<(event: string, data: Record<string, unknown>) => void>
}

function make(
  o: { settings?: Partial<PetSettings>; installed?: boolean; pet?: boolean } = {}
): Harness {
  const env: Env = {
    settings: { ...DEFAULT_PET_SETTINGS, ...o.settings },
    installed: o.installed ?? true,
    locked: false,
    lastInput: Date.now(),
    pet: o.pet ?? true,
    bubble: null
  }
  const settings = vi.fn(() => env.settings)
  const installed = vi.fn(() => env.installed)
  const idleSeconds = vi.fn(() => Math.floor((Date.now() - env.lastInput) / 1000))
  const locked = vi.fn(() => env.locked)
  const petWarn = vi.fn<(text: string, holdMs: number) => boolean>((text) => {
    if (!env.pet) return false
    env.bubble = text
    return true
  })
  const petUpdate = vi.fn<(text: string) => boolean>((text) => {
    if (env.bubble === null) return false
    env.bubble = text
    return true
  })
  const petClear = vi.fn<() => void>(() => {
    env.bubble = null
  })
  const notify = vi.fn<(text: string) => void>()
  const log = vi.fn<(event: string, data: Record<string, unknown>) => void>()
  const w = createAwayWatch({
    settings,
    installed,
    idleSeconds,
    locked,
    petWarn,
    petUpdate,
    petClear,
    notify,
    log,
    timers: globalTimers()
  })
  return {
    w,
    env,
    input: () => {
      env.lastInput = Date.now()
    },
    settings,
    installed,
    idleSeconds,
    locked,
    petWarn,
    petUpdate,
    petClear,
    notify,
    log
  }
}

const logs = (t: Harness, event: string): unknown[] =>
  t.log.mock.calls.filter(([e]) => e === event).map(([, d]) => d)
const errors = (t: Harness): unknown[] => logs(t, 'away.error')

describe('createAwayWatch: Ttree 이석 미리 알림(2026-11-13)의 확인 고리', () => {
  it('입력 없이 18분(20분 기준 2분 전)이 되면 말랑 메이트로 한 번 알린다. 그 전에는 알릴 때까지 남은 시간(1분 이하)마다 본다', () => {
    const t = make()
    t.w.start()
    // 바로 한 번 보고, 다음 확인은 늘 하나다(setInterval 없음)
    expect(t.idleSeconds).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(18 * MIN - 1)
    expect(t.petWarn).not.toHaveBeenCalled()
    expect(t.idleSeconds).toHaveBeenCalledTimes(18) // 0·1·…·17분
    vi.advanceTimersByTime(1)
    expect(t.petWarn).toHaveBeenCalledTimes(1)
    // 말풍선은 이석 기준까지 2분
    expect(t.petWarn).toHaveBeenCalledWith(TEXT, 2 * MIN)
    expect(t.notify).not.toHaveBeenCalled()
    expect(logs(t, 'away.warn')).toEqual([{ via: 'pet', idleSec: 1080, afterMin: 20, leadMin: 2 }])
    expect(vi.getTimerCount()).toBe(1)

    // 알린 뒤 초 세기(19분 30초) 전까지는 2초마다 본다
    vi.advanceTimersByTime(90_000 - 1)
    expect(t.idleSeconds).toHaveBeenCalledTimes(19 + 44)
    expect(t.petWarn).toHaveBeenCalledTimes(1)
    // 기준을 넘긴 뒤에는 다시(늦게) 알리지 않고 2초마다 본다
    vi.advanceTimersByTime(30_000 + 1)
    const atLimit = t.idleSeconds.mock.calls.length
    vi.advanceTimersByTime(10 * MIN)
    expect(t.idleSeconds).toHaveBeenCalledTimes(atLimit + (10 * MIN) / AWAY.watchMs)
    expect(t.petWarn).toHaveBeenCalledTimes(2) // 미리 알림 + 초 세기 첫 숫자
    expect(t.notify).not.toHaveBeenCalled()
    expect(t.petClear).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('알린 뒤 입력이 돌아오면 2초 안에 말풍선을 닫고, 다음에 입력이 끊기면 그때부터 다시 18분에 알린다', () => {
    const t = make()
    t.w.start()
    vi.advanceTimersByTime(18 * MIN + 30_000)
    expect(t.petWarn).toHaveBeenCalledTimes(1)
    t.input()
    vi.advanceTimersByTime(AWAY.watchMs - 1)
    expect(t.petClear).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(t.petClear).toHaveBeenCalledTimes(1)
    expect(logs(t, 'away.clear')).toEqual([{ reason: 'input' }])
    // 입력 뒤 18분(닫은 확인은 입력 2초 뒤였다)
    vi.advanceTimersByTime(18 * MIN - AWAY.watchMs - 1)
    expect(t.petWarn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(t.petWarn).toHaveBeenCalledTimes(2)
    expect(t.petClear).toHaveBeenCalledTimes(1)
  })

  it('중간에 입력이 있으면 처음부터 센다(알리지 않는다)', () => {
    const t = make()
    t.w.start()
    vi.advanceTimersByTime(17 * MIN + 59_000)
    t.input()
    vi.advanceTimersByTime(17 * MIN)
    expect(t.petWarn).not.toHaveBeenCalled()
    expect(t.petClear).not.toHaveBeenCalled()
    expect(logs(t, 'away.clear')).toEqual([])
    vi.advanceTimersByTime(MIN)
    expect(t.petWarn).toHaveBeenCalledTimes(1)
  })

  it('펫이 알릴 수 없으면(숨김·말풍선 끔·바쁨) Windows 알림으로 같은 문구를 알린다. 문구는 로그에 남기지 않는다', () => {
    const t = make({ pet: false })
    t.w.start()
    vi.advanceTimersByTime(18 * MIN)
    expect(t.petWarn).toHaveBeenCalledWith(TEXT, 2 * MIN)
    expect(t.notify).toHaveBeenCalledTimes(1)
    expect(t.notify).toHaveBeenCalledWith(TEXT)
    expect(logs(t, 'away.warn')).toEqual([
      { via: 'notify', idleSec: 1080, afterMin: 20, leadMin: 2 }
    ])
    // 한 번만
    vi.advanceTimersByTime(MIN)
    expect(t.notify).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(t.log.mock.calls)).not.toContain(TEXT)
  })

  it('설정의 기준·미리 알림 분을 쓴다(10분 기준 5분 전: 5분에 "5분 뒤", 말풍선 5분)', () => {
    const t = make({ settings: { awayAfterMin: 10, awayLeadMin: 5 } })
    t.w.start()
    vi.advanceTimersByTime(5 * MIN - 1)
    expect(t.petWarn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(t.petWarn).toHaveBeenCalledWith(petAwayLine(5), 5 * MIN)
    expect(logs(t, 'away.warn')).toEqual([{ via: 'pet', idleSec: 300, afterMin: 10, leadMin: 5 }])
  })

  it('끔: Ttree 설치·잠금·입력 없는 시간을 읽지 않고 1분마다 설정만 본다', () => {
    const t = make({ settings: { awayWarn: false } })
    t.w.start()
    vi.advanceTimersByTime(30 * MIN)
    expect(t.settings).toHaveBeenCalledTimes(31)
    expect(t.installed).not.toHaveBeenCalled()
    expect(t.locked).not.toHaveBeenCalled()
    expect(t.idleSeconds).not.toHaveBeenCalled()
    expect(t.petWarn).not.toHaveBeenCalled()
    expect(t.notify).not.toHaveBeenCalled()
    expect(t.log).not.toHaveBeenCalled()
  })

  it('refresh(설정 바뀜): 기다리던 확인을 지우고 바로 다시 본다. 켜자마자 알릴 때 안이면 남은 시간으로 알리고, 끄면 닫는다', () => {
    const t = make({ settings: { awayWarn: false } })
    t.w.start()
    vi.advanceTimersByTime(18 * MIN + 30_000)
    t.env.settings = { ...t.env.settings, awayWarn: true }
    t.w.refresh()
    expect(t.petWarn).toHaveBeenCalledWith(TEXT, 90_000)
    expect(vi.getTimerCount()).toBe(1)
    // 2초마다 본다(1분 기다림은 지웠다)
    vi.advanceTimersByTime(AWAY.watchMs)
    expect(t.idleSeconds).toHaveBeenCalledTimes(2)
    t.env.settings = { ...t.env.settings, awayWarn: false }
    t.w.refresh()
    expect(t.petClear).toHaveBeenCalledTimes(1)
    expect(logs(t, 'away.clear')).toEqual([{ reason: 'off' }])
    expect(vi.getTimerCount()).toBe(1)
    // 여러 번 불러도 다음 확인은 하나
    t.w.refresh()
    t.w.refresh()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('늦게 알리면(기준 1분 전 안쪽에서 켬) 문구는 실제 남은 분(올림)이다: 19분 10초면 "1분 뒤"', () => {
    const t = make({ settings: { awayWarn: false } })
    t.w.start()
    vi.advanceTimersByTime(19 * MIN + 10_000)
    t.env.settings = { ...t.env.settings, awayWarn: true }
    t.w.refresh()
    expect(t.petWarn).toHaveBeenCalledWith(petAwayLine(1), 50_000)
  })

  it('켰을 때 이미 기준을 넘겼으면 늦게 알리지 않고, 입력이 돌아올 때까지 2초마다 본다', () => {
    const t = make({ settings: { awayWarn: false } })
    t.w.start()
    vi.advanceTimersByTime(25 * MIN)
    t.env.settings = { ...t.env.settings, awayWarn: true }
    t.w.refresh()
    vi.advanceTimersByTime(10 * MIN)
    expect(t.petWarn).not.toHaveBeenCalled()
    expect(t.notify).not.toHaveBeenCalled()
    expect(t.idleSeconds).toHaveBeenCalledTimes(1 + (10 * MIN) / AWAY.watchMs)
    // 돌아오면 닫기(떠 있는 알림이 없으면 펫은 아무것도 하지 않는다)
    t.input()
    vi.advanceTimersByTime(AWAY.watchMs)
    expect(logs(t, 'away.clear')).toEqual([{ reason: 'input' }])
  })

  it('미리 알림 분을 바꾸면 바로 새 기준으로 본다(알린 뒤 기준을 늘리면 닫는다)', () => {
    const t = make()
    t.w.start()
    vi.advanceTimersByTime(18 * MIN)
    expect(t.petWarn).toHaveBeenCalledTimes(1)
    t.env.settings = { ...t.env.settings, awayAfterMin: 30 }
    t.w.refresh()
    expect(t.petClear).toHaveBeenCalledTimes(1)
    // 30분 기준 2분 전(28분)에 다시 알린다
    vi.advanceTimersByTime(10 * MIN - 1)
    expect(t.petWarn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(t.petWarn).toHaveBeenCalledTimes(2)
    expect(t.petWarn).toHaveBeenLastCalledWith(TEXT, 2 * MIN)
  })

  it('Ttree가 없으면 알리지 않고 1분마다 다시 본다. 설치되면 다음 확인부터 센다', () => {
    const t = make({ installed: false })
    t.w.start()
    vi.advanceTimersByTime(30 * MIN)
    expect(t.installed).toHaveBeenCalledTimes(31)
    expect(t.idleSeconds).not.toHaveBeenCalled()
    expect(t.petWarn).not.toHaveBeenCalled()
    t.input()
    t.env.installed = true
    vi.advanceTimersByTime(18 * MIN - 1)
    expect(t.petWarn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(t.petWarn).toHaveBeenCalledTimes(1)
  })

  it('잠금 화면(자리를 비우기로 했다): 알리지 않고, 알린 뒤 잠그면 닫는다. 잠근 동안은 입력 없는 시간을 읽지 않는다', () => {
    const quiet = make()
    quiet.w.start()
    vi.advanceTimersByTime(17 * MIN)
    quiet.env.locked = true
    vi.advanceTimersByTime(30 * MIN)
    expect(quiet.petWarn).not.toHaveBeenCalled()
    expect(quiet.notify).not.toHaveBeenCalled()
    expect(quiet.idleSeconds).toHaveBeenCalledTimes(18)
    expect(quiet.log).not.toHaveBeenCalled()

    const t = make()
    t.w.start()
    vi.advanceTimersByTime(18 * MIN)
    expect(t.petWarn).toHaveBeenCalledTimes(1)
    t.env.locked = true
    vi.advanceTimersByTime(AWAY.watchMs)
    expect(t.petClear).toHaveBeenCalledTimes(1)
    expect(logs(t, 'away.clear')).toEqual([{ reason: 'locked' }])
    vi.advanceTimersByTime(30 * MIN)
    expect(t.petWarn).toHaveBeenCalledTimes(1)
    // 풀면(입력) 다시 처음부터 센다
    t.env.locked = false
    t.input()
    vi.advanceTimersByTime(MIN)
    vi.advanceTimersByTime(18 * MIN)
    expect(t.petWarn).toHaveBeenCalledTimes(2)
  })

  it('start는 한 번만, refresh는 시작 전·끝낸 뒤에는 무시한다', () => {
    const t = make()
    t.w.refresh()
    expect(t.settings).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    t.w.start()
    t.w.start()
    expect(t.settings).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('dispose: 다음 확인을 지우고 멈춘다(그 뒤 start·refresh도 무시)', () => {
    const t = make()
    t.w.start()
    t.w.dispose()
    expect(vi.getTimerCount()).toBe(0)
    t.w.start()
    t.w.refresh()
    vi.advanceTimersByTime(60 * MIN)
    expect(t.settings).toHaveBeenCalledTimes(1)
    expect(t.petWarn).not.toHaveBeenCalled()
    t.w.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('입력 없는 시간이 숫자가 아니거나 음수면 방금 입력이 있었던 것으로 본다', () => {
    for (const value of [NaN, -5]) {
      const t = make()
      t.idleSeconds.mockImplementation(() => value)
      t.w.start()
      vi.advanceTimersByTime(60 * MIN)
      expect(t.petWarn, String(value)).not.toHaveBeenCalled()
      expect(errors(t)).toEqual([])
    }
  })
})

describe('createAwayWatch: 기준 30초 전부터 초 세기(2026-11-13 사용자 요청)', () => {
  const count = (n: number): string => petAwayCountdownLine(n)

  it('19분 30초에 첫 숫자 30을 새 말풍선(petWarn, 기준까지 30초)으로, 그다음 1초마다 29…1은 글만 바꾼다(petUpdate). 기준에서 끝난다', () => {
    const t = make()
    t.w.start()
    vi.advanceTimersByTime(18 * MIN)
    expect(t.petWarn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(90_000 - 1)
    expect(t.petWarn).toHaveBeenCalledTimes(1)
    expect(t.petUpdate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(t.petWarn).toHaveBeenCalledTimes(2)
    expect(t.petWarn).toHaveBeenLastCalledWith(count(30), 30_000)
    expect(t.petUpdate).not.toHaveBeenCalled()
    expect(logs(t, 'away.countdown')).toEqual([{ via: 'pet' }])

    // 초 세기 동안에는 0.25초마다 보고(다음 확인은 늘 하나), 숫자가 바뀔 때만 한 번씩 바꾼다
    const before = t.idleSeconds.mock.calls.length
    for (let n = 29; n >= 1; n -= 1) {
      vi.advanceTimersByTime(999)
      expect(t.petUpdate).toHaveBeenCalledTimes(29 - n)
      vi.advanceTimersByTime(1)
      expect(t.petUpdate).toHaveBeenCalledTimes(30 - n)
      expect(t.petUpdate).toHaveBeenLastCalledWith(count(n))
      expect(t.env.bubble).toBe(count(n))
      expect(vi.getTimerCount()).toBe(1)
    }
    expect(t.idleSeconds).toHaveBeenCalledTimes(before + (29 * 1000) / AWAY.tickMs)
    expect(t.petWarn).toHaveBeenCalledTimes(2)
    expect(t.notify).not.toHaveBeenCalled()
    expect(logs(t, 'away.countdown')).toHaveLength(1)

    // 20분(기준): 더 세지도 알리지도 않고 2초마다 본다. 말풍선은 펫의 반응 시간(기준까지)이 닫는다
    vi.advanceTimersByTime(1000)
    const atLimit = t.idleSeconds.mock.calls.length
    vi.advanceTimersByTime(10 * MIN)
    expect(t.idleSeconds).toHaveBeenCalledTimes(atLimit + (10 * MIN) / AWAY.watchMs)
    expect(t.petUpdate).toHaveBeenCalledTimes(29)
    expect(t.petWarn).toHaveBeenCalledTimes(2)
    expect(t.notify).not.toHaveBeenCalled()
    expect(t.petClear).not.toHaveBeenCalled()
    // 문구는 기록하지 않는다
    expect(JSON.stringify(t.log.mock.calls)).not.toContain('초 뒤')
  })

  it('초 세기 중 입력이 돌아오면 0.25초 안에 닫고 세기를 멈춘다. 다음에 이어지면 첫 숫자부터 다시 띄우고 한 번 기록한다', () => {
    const t = make()
    t.w.start()
    vi.advanceTimersByTime(19 * MIN + 45_000)
    expect(t.petUpdate).toHaveBeenLastCalledWith(count(15))
    t.input()
    vi.advanceTimersByTime(AWAY.tickMs - 1)
    expect(t.petClear).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(t.petClear).toHaveBeenCalledTimes(1)
    expect(t.env.bubble).toBeNull()
    expect(logs(t, 'away.clear')).toEqual([{ reason: 'input' }])
    const updates = t.petUpdate.mock.calls.length
    // 입력 뒤 19분 30초 직전까지: 18분에 다시 미리 알림만(초 세기 없음)
    vi.advanceTimersByTime(19 * MIN + 30_000 - 1)
    expect(t.petUpdate).toHaveBeenCalledTimes(updates)
    expect(t.petWarn).toHaveBeenCalledTimes(3)
    expect(t.petWarn).toHaveBeenLastCalledWith(TEXT, 2 * MIN)
    vi.advanceTimersByTime(1)
    expect(t.petWarn).toHaveBeenCalledTimes(4)
    expect(t.petWarn).toHaveBeenLastCalledWith(count(30), 30_000)
    expect(logs(t, 'away.countdown')).toEqual([{ via: 'pet' }, { via: 'pet' }])
  })

  it('미리 알림이 Windows 알림으로 갔으면(펫이 못 보임) 숫자마다 Windows 알림을 보내지 않고, 펫이 보일 수 있게 되면 그때 띄운다', () => {
    const t = make({ pet: false })
    t.w.start()
    vi.advanceTimersByTime(18 * MIN)
    expect(t.notify).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(90_000)
    expect(t.petWarn).toHaveBeenLastCalledWith(count(30), 30_000)
    expect(logs(t, 'away.countdown')).toEqual([{ via: 'none' }])
    // 떠 있는 말풍선이 없어 글을 못 바꾸면 띄우기를 다시 해 본다(못 띄워도 Windows 알림은 없다)
    vi.advanceTimersByTime(5_000)
    expect(t.petUpdate).toHaveBeenCalledTimes(5)
    expect(t.petWarn).toHaveBeenCalledTimes(2 + 5)
    expect(t.notify).toHaveBeenCalledTimes(1)
    // 펫이 보일 수 있게 되면 다음 숫자에 띄우고(폴짝), 그다음은 글만 바꾼다
    t.env.pet = true
    vi.advanceTimersByTime(1_000)
    expect(t.petWarn).toHaveBeenCalledTimes(8)
    expect(t.petWarn).toHaveBeenLastCalledWith(count(24), 24_000)
    vi.advanceTimersByTime(23_000)
    expect(t.petWarn).toHaveBeenCalledTimes(8)
    expect(t.petUpdate).toHaveBeenLastCalledWith(count(1))
    expect(t.env.bubble).toBe(count(1))
    expect(t.notify).toHaveBeenCalledTimes(1)
    expect(logs(t, 'away.countdown')).toHaveLength(1)
  })

  it('말풍선이 사라지면(다른 반응·숨김 등) 다음 숫자에 다시 띄운다', () => {
    const t = make()
    t.w.start()
    vi.advanceTimersByTime(19 * MIN + 35_000)
    expect(t.petWarn).toHaveBeenCalledTimes(2)
    t.env.bubble = null
    vi.advanceTimersByTime(1_000)
    expect(t.petWarn).toHaveBeenCalledTimes(3)
    expect(t.petWarn).toHaveBeenLastCalledWith(count(24), 24_000)
    vi.advanceTimersByTime(1_000)
    expect(t.petWarn).toHaveBeenCalledTimes(3)
    expect(t.petUpdate).toHaveBeenLastCalledWith(count(23))
    expect(logs(t, 'away.countdown')).toHaveLength(1)
  })

  it('알리지 않은 채 초 세기에 닿으면(19분 40초에 켬) 첫 숫자가 알림이다: 20부터 새 말풍선, 미리 알림(away.warn)은 없다', () => {
    const t = make({ settings: { awayWarn: false } })
    t.w.start()
    vi.advanceTimersByTime(19 * MIN + 40_000)
    t.env.settings = { ...t.env.settings, awayWarn: true }
    t.w.refresh()
    expect(t.petWarn).toHaveBeenCalledTimes(1)
    expect(t.petWarn).toHaveBeenCalledWith(count(20), 20_000)
    expect(logs(t, 'away.warn')).toEqual([])
    expect(logs(t, 'away.countdown')).toEqual([{ via: 'pet' }])
    vi.advanceTimersByTime(1_000)
    expect(t.petUpdate).toHaveBeenCalledWith(count(19))
    expect(t.notify).not.toHaveBeenCalled()
  })

  it('초 세기 중 잠그거나 끄면 닫고 세기를 멈춘다', () => {
    const l = make()
    l.w.start()
    vi.advanceTimersByTime(19 * MIN + 40_000)
    l.env.locked = true
    vi.advanceTimersByTime(AWAY.tickMs)
    expect(l.petClear).toHaveBeenCalledTimes(1)
    expect(logs(l, 'away.clear')).toEqual([{ reason: 'locked' }])
    const updates = l.petUpdate.mock.calls.length
    vi.advanceTimersByTime(MIN)
    expect(l.petUpdate).toHaveBeenCalledTimes(updates)

    const o = make()
    o.w.start()
    vi.advanceTimersByTime(19 * MIN + 40_000)
    o.env.settings = { ...o.env.settings, awayWarn: false }
    o.w.refresh()
    expect(o.petClear).toHaveBeenCalledTimes(1)
    expect(logs(o, 'away.clear')).toEqual([{ reason: 'off' }])
    vi.advanceTimersByTime(MIN)
    expect(o.petWarn).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(2) // 두 고리가 각각 다음 확인 하나
  })
})

describe('createAwayWatch: 바깥 값이 던져도 확인은 이어 간다(종류마다 한 번 away.error)', () => {
  it('초 세기 중 글 바꾸기가 던지면 한 번 기록하고 새 말풍선으로 띄운다(Windows 알림은 없다)', () => {
    const t = make()
    t.petUpdate.mockImplementation(() => {
      throw new Error('gone')
    })
    t.w.start()
    vi.advanceTimersByTime(19 * MIN + 32_000)
    expect(errors(t)).toEqual([{ where: 'petUpdate', error: 'gone' }])
    expect(t.petWarn).toHaveBeenCalledTimes(4) // 미리 알림, 30, 29, 28
    expect(t.petWarn).toHaveBeenLastCalledWith(petAwayCountdownLine(28), 28_000)
    expect(t.notify).not.toHaveBeenCalled()
  })

  it('입력 없는 시간을 읽지 못하면 0(입력 있음)으로 보고 오류는 한 번만 남긴다', () => {
    const t = make()
    t.idleSeconds.mockImplementation(() => {
      throw new Error('boom')
    })
    t.w.start()
    vi.advanceTimersByTime(60 * MIN)
    expect(t.idleSeconds).toHaveBeenCalledTimes(61)
    expect(t.petWarn).not.toHaveBeenCalled()
    expect(errors(t)).toEqual([{ where: 'idleSeconds', error: 'boom' }])
    expect(vi.getTimerCount()).toBe(1)
    // 다시 읽히면 이어 간다
    t.idleSeconds.mockImplementation(() => Math.floor((Date.now() - t.env.lastInput) / 1000))
    t.input()
    vi.advanceTimersByTime(19 * MIN)
    expect(t.petWarn).toHaveBeenCalledTimes(1)
  })

  it('펫이 던지면 Windows 알림으로 알리고, 알림도 던지면 기록만 남긴다', () => {
    const t = make()
    t.petWarn.mockImplementation(() => {
      throw new Error('pet gone')
    })
    t.w.start()
    vi.advanceTimersByTime(18 * MIN)
    expect(t.notify).toHaveBeenCalledWith(TEXT)
    expect(logs(t, 'away.warn')).toEqual([
      { via: 'notify', idleSec: 1080, afterMin: 20, leadMin: 2 }
    ])
    expect(errors(t)).toEqual([{ where: 'petWarn', error: 'pet gone' }])

    const n = make({ pet: false })
    n.notify.mockImplementation(() => {
      throw new Error('no toast')
    })
    n.w.start()
    vi.advanceTimersByTime(18 * MIN)
    expect(errors(n)).toEqual([{ where: 'notify', error: 'no toast' }])
    expect(logs(n, 'away.warn')).toEqual([
      { via: 'notify', idleSec: 1080, afterMin: 20, leadMin: 2 }
    ])
    expect(vi.getTimerCount()).toBe(2) // 두 고리가 각각 다음 확인 하나
  })

  it('말풍선을 닫다 던져도 닫기를 기록하고 이어 간다', () => {
    const t = make()
    t.petClear.mockImplementation(() => {
      throw new Error('closed')
    })
    t.w.start()
    vi.advanceTimersByTime(18 * MIN)
    t.input()
    vi.advanceTimersByTime(AWAY.watchMs)
    expect(logs(t, 'away.clear')).toEqual([{ reason: 'input' }])
    expect(errors(t)).toEqual([{ where: 'petClear', error: 'closed' }])
    vi.advanceTimersByTime(18 * MIN)
    expect(t.petWarn).toHaveBeenCalledTimes(2)
  })

  it('설정·Ttree 설치·잠금을 읽지 못하면 꺼짐·없음·잠금 아님으로 본다', () => {
    const s = make()
    s.settings.mockImplementation(() => {
      throw new Error('settings')
    })
    s.w.start()
    vi.advanceTimersByTime(30 * MIN)
    expect(s.petWarn).not.toHaveBeenCalled()
    expect(errors(s)).toEqual([{ where: 'settings', error: 'settings' }])

    const i = make()
    i.installed.mockImplementation(() => {
      throw new Error('fs')
    })
    i.w.start()
    vi.advanceTimersByTime(30 * MIN)
    expect(i.petWarn).not.toHaveBeenCalled()
    expect(i.idleSeconds).not.toHaveBeenCalled()
    expect(errors(i)).toEqual([{ where: 'installed', error: 'fs' }])

    const l = make()
    l.locked.mockImplementation(() => {
      throw new Error('power')
    })
    l.w.start()
    vi.advanceTimersByTime(18 * MIN)
    expect(l.petWarn).toHaveBeenCalledTimes(1)
    expect(errors(l)).toEqual([{ where: 'locked', error: 'power' }])
  })

  it('기록이 던져도 확인·알림은 이어 간다', () => {
    const t = make()
    t.log.mockImplementation(() => {
      throw new Error('disk full')
    })
    t.w.start()
    expect(() => vi.advanceTimersByTime(18 * MIN)).not.toThrow()
    expect(t.petWarn).toHaveBeenCalledTimes(1)
    t.input()
    expect(() => vi.advanceTimersByTime(AWAY.watchMs)).not.toThrow()
    expect(t.petClear).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('알리는 중에 refresh가 다시 불려도 다음 확인은 하나만 남는다', () => {
    let w: AwayWatch | null = null
    const t = make()
    t.petWarn.mockImplementation(() => {
      w?.refresh()
      return true
    })
    w = t.w
    t.w.start()
    vi.advanceTimersByTime(18 * MIN)
    expect(t.petWarn).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
  })
})

describe('입력을 흉내 내지 않는다(이석 미리 알림은 알리기만 한다)', () => {
  it('이석 미리 알림 코드는 입력·Win32 모듈을 쓰지 않는다', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url))
    for (const path of ['main/pet/away-watch.ts', 'shared/pet/pet-away.ts']) {
      const source = readFileSync(root + path, 'utf8')
      expect(source, path).not.toMatch(
        /native\/|koffi|SendInput|keybd_event|mouse_event|SetCursorPos/
      )
    }
  })
})
