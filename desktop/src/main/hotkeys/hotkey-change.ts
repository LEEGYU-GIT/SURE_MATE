import type { Timers } from '../timers'
import { checkAccelerator } from './accelerator-rules'
import type { HotkeyId, HotkeyManager } from './hotkey-manager'

/** 녹화가 이만큼 이어지면(창을 떠났거나 잊음) 저절로 멈추고 단축키를 되살린다 */
export const RECORD_TIMEOUT_MS = 30000
/** 첫 실행 단축키 후보(설계 문서 §6): Alt+Space는 비어 있을 때만, Ctrl+Alt+Space를 제안, 쓰는 중이면 Alt+` */
export const ONBOARDING_CANDIDATES = ['Alt+Space', 'Ctrl+Alt+Space', 'Alt+`'] as const

export type HotkeyCheck = { level: 'ok' | 'warn' | 'block' | 'in-use' | 'same-as-other'; reason?: string }
export type HotkeySetResult = { ok: true; acc: string; warning?: string } | { ok: false; reason: string }

export interface HotkeyChangerDeps {
  manager: Pick<HotkeyManager, 'rebind' | 'suspendAll' | 'resumeAll' | 'current'>
  /** 등록해 보고 바로 풀어 다른 앱이 쓰는지 본다(true = 비어 있음) */
  probe(acc: string): boolean
  /** 설정 파일에 저장(settings.hotkeys[id]) */
  save(id: HotkeyId, acc: string): Promise<void>
  timers: Timers
  log(event: string, data: Record<string, unknown>): void
}

export interface HotkeyChanger {
  check(id: HotkeyId, acc: string): HotkeyCheck
  /** 키 녹화 중에는 모든 단축키를 잠시 푼다(설계 문서 §6) */
  startRecording(): void
  stopRecording(): void
  set(id: HotkeyId, acc: string): Promise<HotkeySetResult>
  candidates(): { acc: string; available: boolean; suggested: boolean }[]
  dispose(): void
}

const same = (a: string | undefined, b: string): boolean => a !== undefined && a.toLowerCase() === b.toLowerCase()

/**
 * 설정 창·온보딩의 단축키 바꾸기(설계 문서 §6). 바꿀 때는 기존 등록 해제 → 새로 등록 → 실패하면 되돌리기(HotkeyManager.bind).
 * 녹화가 어떻게 끝나든(멈춤·바꾸기·30초·dispose) 단축키를 되살린다.
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
    const other: HotkeyId = id === 'palette' ? 'lookup' : 'palette'
    if (same(d.manager.current(other), acc)) return { level: 'same-as-other', reason: '다른 단축키와 같은 조합이에요' }
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
