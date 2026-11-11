import type { HotkeyCandidate, HotkeyCheck, HotkeySetResult } from '../../shared/settings/settings-snapshot'
import type { Timers } from '../timers'
import { checkAccelerator } from './accelerator-rules'
import type { HotkeyId, HotkeyManager } from './hotkey-manager'

/** 녹화가 이만큼 이어지면(창을 떠났거나 잊음) 저절로 멈추고 단축키를 되살린다 */
export const RECORD_TIMEOUT_MS = 30000
/** 첫 실행 단축키 후보(설계 문서 §6): Alt+Space는 비어 있을 때만, Ctrl+Alt+Space를 제안, 쓰는 중이면 Alt+` */
export const ONBOARDING_CANDIDATES = ['Alt+Space', 'Ctrl+Alt+Space', 'Alt+`'] as const

export type { HotkeyCheck, HotkeySetResult }

/** 바꿀 수 있는 앱 단축키(겹침 검사는 서로를 본다) */
export const HOTKEY_IDS: readonly HotkeyId[] = ['palette', 'lookup', 'pet-control']
/** 비워 둘 수 있는 단축키(말랑 메이트 조종은 기본값이 없다, 설계 §14-2) */
const CLEARABLE: readonly HotkeyId[] = ['pet-control']
/** 겹침 안내에 쓰는 단축키 이름 */
const HOTKEY_NAMES: Record<HotkeyId, string> = { palette: '팔레트', lookup: '용어 찾기', 'pet-control': '말랑 메이트 조종' }

export interface HotkeyChangerDeps {
  manager: Pick<HotkeyManager, 'rebind' | 'unbind' | 'suspendAll' | 'resumeAll' | 'current'>
  /** 등록해 보고 바로 풀어 다른 앱이 쓰는지 본다(true = 비어 있음) */
  probe(acc: string): boolean
  /** 설정 파일에 저장(settings.hotkeys[id], 조종 단축키는 settings.pet.controlHotkey). null은 단축키 없음 */
  save(id: HotkeyId, acc: string | null): Promise<void>
  timers: Timers
  log(event: string, data: Record<string, unknown>): void
}

export interface HotkeyChanger {
  check(id: HotkeyId, acc: string): HotkeyCheck
  /** 키 녹화 중에는 모든 단축키를 잠시 푼다(설계 문서 §6) */
  startRecording(): void
  stopRecording(): void
  /** acc가 null이면 단축키를 비운다(조종 단축키만, 팔레트·용어 찾기는 거절) */
  set(id: HotkeyId, acc: string | null): Promise<HotkeySetResult>
  candidates(): HotkeyCandidate[]
  dispose(): void
}

const same = (a: string | undefined, b: string): boolean => a !== undefined && a.toLowerCase() === b.toLowerCase()

/**
 * 설정 창·온보딩의 단축키 바꾸기(설계 문서 §6). 바꿀 때는 기존 등록 해제 → 새로 등록 → 실패하면 되돌리기(HotkeyManager.bind).
 * 녹화가 어떻게 끝나든(멈춤·바꾸기·30초·dispose) 단축키를 되살린다.
 * 말랑 메이트 조종 단축키도 같은 길로 바꾸고, 비우면(null) 등록을 풀고 단축키 없음으로 저장한다.
 */
export function createHotkeyChanger(d: HotkeyChangerDeps): HotkeyChanger {
  let recording = false
  let timer: unknown = null

  const stopRecording = (): void => {
    if (timer !== null) d.timers.clearTimeout(timer)
    timer = null
    if (!recording) return
    recording = false
    const { failed } = d.manager.resumeAll()
    if (failed.length) d.log('hotkey.resume.failed', { ids: failed })
  }

  const check = (id: HotkeyId, acc: string): HotkeyCheck => {
    const rule = checkAccelerator(acc)
    if (rule.level === 'block') return { level: 'block', reason: rule.reason }
    const other = HOTKEY_IDS.find((o) => o !== id && same(d.manager.current(o), acc))
    if (other) return { level: 'same-as-other', reason: `${HOTKEY_NAMES[other]} 단축키와 같은 조합이에요` }
    if (same(d.manager.current(id), acc)) return { level: 'ok' }
    if (!d.probe(acc)) return { level: 'in-use', reason: '다른 앱이 이 조합을 쓰고 있어요' }
    return rule.level === 'warn' ? { level: 'warn', reason: rule.reason } : { level: 'ok' }
  }

  return {
    check,
    startRecording() {
      if (recording) return
      recording = true
      d.manager.suspendAll()
      timer = d.timers.setTimeout(() => {
        timer = null
        d.log('hotkey.record.timeout', {})
        stopRecording()
      }, RECORD_TIMEOUT_MS)
    },
    stopRecording,
    async set(id, acc) {
      stopRecording()
      if (acc === null) {
        if (!CLEARABLE.includes(id)) {
          d.log('hotkey.change', { id, ok: false, reason: 'not-clearable' })
          return { ok: false, reason: `${HOTKEY_NAMES[id]} 단축키는 비워 둘 수 없어요` }
        }
        d.manager.unbind(id)
        await d.save(id, null)
        d.log('hotkey.change', { id, ok: true, acc: null })
        return { ok: true, acc: null }
      }
      const c = check(id, acc)
      if (c.level === 'block' || c.level === 'same-as-other' || c.level === 'in-use') {
        d.log('hotkey.change', { id, ok: false, reason: c.level })
        return { ok: false, reason: c.reason ?? '이 조합은 쓸 수 없어요' }
      }
      const r = d.manager.rebind(id, acc)
      if (!r.ok) {
        d.log('hotkey.change', { id, ok: false, reason: r.reason })
        return { ok: false, reason: r.reason === 'in-use' ? '다른 앱이 이 조합을 쓰고 있어요' : (r.detail ?? '이 조합은 쓸 수 없어요') }
      }
      await d.save(id, acc)
      d.log('hotkey.change', { id, ok: true, acc })
      return c.level === 'warn' ? { ok: true, acc, warning: c.reason } : { ok: true, acc }
    },
    candidates() {
      const list = ONBOARDING_CANDIDATES.map((acc) => ({ acc, available: same(d.manager.current('palette'), acc) || d.probe(acc) }))
      const suggested = list.find((c) => c.acc !== 'Alt+Space' && c.available)?.acc
      return list.filter((c) => c.acc !== 'Alt+Space' || c.available).map((c) => ({ ...c, suggested: c.acc === suggested }))
    },
    dispose: stopRecording
  }
}
