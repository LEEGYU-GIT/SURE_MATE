import { AWAY, nextAway, type AwayState } from '../../shared/pet/pet-away'
import { petAwayCountdownLine, petAwayLine } from '../../shared/pet/pet-copy'
import type { PetSettings } from '../../shared/pet/pet-settings'
import { createErrorOnce } from '../error-once'
import { errorText } from '../error-text'
import type { Timers } from '../timers'

/** 이석 미리 알림이 쓰는 바깥 세계. 실제 값은 index.ts가 주고(앱이 준비된 뒤: powerMonitor), 시험은 가짜를 넣는다 */
export interface AwayWatchDeps {
  /** 지금 펫 설정(awayWarn·awayAfterMin·awayLeadMin) */
  settings(): PetSettings
  /** Ttree가 이 PC에 설치되어 있는지 */
  installed(): boolean
  /** 마지막 입력 뒤 지난 초(powerMonitor.getSystemIdleTime). Ttree가 이석을 잡는 값과 같다 */
  idleSeconds(): number
  /** Windows 잠금 화면인지(powerMonitor.getSystemIdleState(1) === 'locked') */
  locked(): boolean
  /** 말랑 메이트 말풍선으로 알린다(holdMs: 이석 기준까지). 펫이 보일 수 없으면 false */
  petWarn(text: string, holdMs: number): boolean
  /**
   * 떠 있는 이석 알림 말풍선의 글만 바꾼다(초 세기: 폴짝·새 말풍선 없음, 떠 있는 시간 그대로).
   * 이석 알림 말풍선이 떠 있지 않으면(Windows 알림으로 알렸거나 닫힘·다른 반응) false
   */
  petUpdate(text: string): boolean
  /** 떠 있는 이석 알림 말풍선을 닫는다(없으면 아무것도 하지 않는다) */
  petClear(): void
  /** Windows 알림(펫으로 알리지 못했을 때). 초 세기에는 쓰지 않는다 */
  notify(text: string): void
  log(event: string, data: Record<string, unknown>): void
  timers: Pick<Timers, 'setTimeout' | 'clearTimeout'>
}

export interface AwayWatch {
  /** 바로 한 번 보고 확인을 이어 간다(두 번째부터는 무시) */
  start(): void
  /** 설정이 바뀌었다: 기다리던 확인을 지우고 바로 다시 본다. 시작 전·끝낸 뒤에는 무시 */
  refresh(): void
  /** 기다리던 확인을 지우고 멈춘다 */
  dispose(): void
}

/**
 * Ttree 이석 미리 알림(2026-11-13)의 확인 고리. 판단은 pet-away(순수)가 하고 여기서는 바깥 값을 읽어 넘기고 알린다.
 * setInterval 없이 확인마다 다음 확인 하나(1초~1분, 알린 뒤 2초, 초 세기 중 0.25초)를 잡는다. 알릴 때는 말랑 메이트 말풍선으로,
 * 펫이 보일 수 없으면 Windows 알림으로 알리고, 입력이 돌아오거나 끄거나 잠그면 말풍선을 닫는다. 기준 30초 전부터는 숫자가 바뀔
 * 때마다 말풍선 글만 바꾸고(첫 숫자는 폴짝과 함께 새로 띄운다) Windows 알림은 보내지 않는다. 입력을 흉내 내거나 넣지 않는다(알리기만 한다).
 * 기록에는 경로·입력 없는 초·분·닫은 까닭만 남기고 문구는 남기지 않는다(초 세기는 이어지는 동안 첫 숫자에 한 번).
 * 바깥 값을 읽거나 부르다 던지면 종류(곳 + 오류 글)마다 한 번 away.error로 남기고 안전한 값(꺼짐·입력 있음·잠금 아님·
 * 펫으로 못 알림)으로 보고 확인을 이어 간다
 */
export function createAwayWatch(d: AwayWatchDeps): AwayWatch {
  let state: AwayState = { warned: false, seconds: null }
  let timer: unknown = null
  let started = false
  let disposed = false

  const firstTime = createErrorOnce()
  const log = (event: string, data: Record<string, unknown>): void => {
    try {
      d.log(event, data)
    } catch {
      // 기록하지 못해도 확인은 이어 간다
    }
  }
  const report = (where: string, e: unknown): void => {
    const error = errorText(e)
    if (firstTime(where, error)) log('away.error', { where, error })
  }
  /** 바깥 값 하나를 읽거나 부른다. 던지면 기록(종류마다 한 번)하고 fallback */
  const call = <V>(where: string, fn: () => V, fallback: V): V => {
    try {
      return fn()
    } catch (e) {
      report(where, e)
      return fallback
    }
  }

  function stopTimer(): void {
    if (timer === null) return
    const h = timer
    timer = null
    call('timers', () => d.timers.clearTimeout(h), undefined)
  }

  /** 한 번 보고 알리거나 닫는다. 다음 확인까지 ms를 돌려준다 */
  function step(): number {
    const pet = call<PetSettings | null>('settings', () => d.settings(), null)
    const enabled = pet?.awayWarn === true
    const afterMin = pet?.awayAfterMin ?? 0
    const leadMin = pet?.awayLeadMin ?? 0
    // 꺼져 있으면 설치·잠금·입력 없는 시간을 읽지 않는다(결정은 같다: 꺼짐이 먼저다)
    const installed = enabled && call('installed', () => d.installed() === true, false)
    const locked = installed && call('locked', () => d.locked() === true, false)
    const idleSec = installed && !locked ? call('idleSeconds', () => d.idleSeconds(), 0) : 0
    const decision = nextAway(state, {
      idleMs: idleSec * 1000,
      enabled,
      installed,
      locked,
      afterMin,
      leadMin
    })
    state = decision.state
    if (decision.action === 'warn') {
      // 남은 시간을 분으로 올려 적는다: 제때 알리면 미리 알림 분과 같고, 늦게 알리면(기준 직전에 켬) 실제 남은 분이다
      const text = petAwayLine(Math.max(1, Math.ceil(decision.holdMs / 60_000)))
      const byPet = call('petWarn', () => d.petWarn(text, decision.holdMs) === true, false)
      if (!byPet) call('notify', () => d.notify(text), undefined)
      log('away.warn', {
        via: byPet ? 'pet' : 'notify',
        idleSec: Math.round(idleSec),
        afterMin,
        leadMin
      })
    } else if (decision.action === 'tick') {
      // 첫 숫자는 새 말풍선(폴짝)으로, 그다음은 떠 있는 말풍선의 글만 바꾼다. 떠 있지 않으면(미리 알림이 Windows 알림으로 갔거나
      // 다른 반응·닫힘) 펫이 보일 수 있을 때 다시 띄운다. 못 띄워도 숫자마다 Windows 알림을 보내지는 않는다
      const text = petAwayCountdownLine(decision.seconds)
      const updated = !decision.first && call('petUpdate', () => d.petUpdate(text) === true, false)
      const byPet =
        updated || call('petWarn', () => d.petWarn(text, decision.holdMs) === true, false)
      if (decision.first) log('away.countdown', { via: byPet ? 'pet' : 'none' })
    } else if (decision.action === 'clear') {
      call('petClear', () => d.petClear(), undefined)
      log('away.clear', { reason: decision.reason })
    }
    return decision.nextMs
  }

  /** 확인 한 번과 다음 확인 잡기. 기다리던 확인이 있으면 지운다(refresh) */
  function check(): void {
    stopTimer()
    if (disposed) return
    let next: number = AWAY.maxCheckMs
    try {
      next = step()
    } catch (e) {
      // 판단·문구에서 던져도 고리는 멈추지 않는다(1분 뒤 다시 본다)
      report('check', e)
    }
    // 확인 중에 부른 바깥 일이 refresh()를 다시 불렀어도 다음 확인은 하나만 남긴다
    stopTimer()
    if (disposed) return
    timer = call('timers', () => d.timers.setTimeout(fire, next), null)
  }

  function fire(): void {
    timer = null
    check()
  }

  return {
    start() {
      if (disposed || started) return
      started = true
      check()
    },
    refresh() {
      if (disposed || !started) return
      check()
    },
    dispose() {
      if (disposed) return
      disposed = true
      stopTimer()
    }
  }
}
