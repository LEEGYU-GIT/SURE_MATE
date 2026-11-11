import { sameAccelerator, UNKNOWN_KEY } from '../../shared/hotkeys/accelerator-input'
import type { HotkeyCandidate, HotkeyCheck, HotkeySetResult } from '../../shared/settings/settings-snapshot'
import { WORKSPACE_NOTES } from '../../shared/workspace/messages'
import type { Timers } from '../timers'
import { acceleratorKeyCode, checkAccelerator } from './accelerator-rules'
import { type HotkeyId, type HotkeyManager, isWorkspaceHotkey, type WorkspaceHotkeyId, workspaceHotkeyId, workspaceIdOf } from './hotkey-manager'

/** 녹화가 이만큼 이어지면(창을 떠났거나 잊음) 저절로 멈추고 단축키를 되살린다 */
export const RECORD_TIMEOUT_MS = 30000
/** 첫 실행 단축키 후보(설계 문서 §6): Alt+Space는 비어 있을 때만, Ctrl+Alt+Space를 제안, 쓰는 중이면 Alt+` */
export const ONBOARDING_CANDIDATES = ['Alt+Space', 'Ctrl+Alt+Space', 'Alt+`'] as const

export type { HotkeyCheck, HotkeySetResult }

type AppHotkeyId = Exclude<HotkeyId, WorkspaceHotkeyId>
/** 안내 문구에 쓰는 앱 단축키 이름 */
const APP_HOTKEY_NAMES: Record<AppHotkeyId, string> = { palette: '팔레트', lookup: '용어 찾기', 'pet-control': '말랑 메이트 조종' }
const IN_USE = '다른 앱이 이 조합을 쓰고 있어요'
const SAVE_FAILED = '단축키를 저장하지 못했어요. 다시 해 주세요'

/** 워크스페이스 이름(없으면 null). 안내 문구에만 쓰고 로그에는 넣지 않는다 */
type WorkspaceName = (workspaceId: string) => string | null

/** 안내 문구(설정 창·트레이)에 쓰는 단축키 이름. 워크스페이스 단축키는 ‘이름’ 워크스페이스(이름을 모르면 워크스페이스) */
export function hotkeyName(id: HotkeyId, workspaceName?: WorkspaceName): string {
  if (!isWorkspaceHotkey(id)) return APP_HOTKEY_NAMES[id]
  const name = workspaceName?.(workspaceIdOf(id))
  return name ? `‘${name}’ 워크스페이스` : '워크스페이스'
}

/** 일시 중지(녹화·트레이)를 풀 때 다시 등록하지 못한 단축키 알림 */
export function resumeFailedNotice(failed: HotkeyId[], workspaceName?: WorkspaceName): string {
  return `다시 등록하지 못한 단축키가 있어요: ${failed.map((id) => hotkeyName(id, workspaceName)).join(', ')}`
}

/** 워크스페이스 단축키(workspace:<id>)를 맡는 쪽(main/workspace/workspace-hotkeys.ts) */
export interface WorkspaceHotkeySide {
  /** 워크스페이스가 있으면 처리기(누르면 불러오기)를 붙이고 true, 없으면 false */
  prepare(workspaceId: string): Promise<boolean>
  /** workspaces.json에 저장한다. false면 저장하지 못함 */
  save(workspaceId: string, acc: string | null): Promise<boolean>
  name: WorkspaceName
  /**
   * workspaces.json에 저장된 워크스페이스 단축키([워크스페이스 id, 조합]). 시작할 때 다른 앱이 잡아 등록하지 못한 조합도 들어 있어
   * 겹침 검사가 함께 본다(A-M7)
   */
  saved?(): Iterable<readonly [string, string]>
}

export interface HotkeyChangerDeps {
  manager: Pick<HotkeyManager, 'rebind' | 'unbind' | 'suspendAll' | 'resumeAll' | 'current' | 'ids'>
  /** 등록해 보고 바로 풀어 다른 앱이 쓰는지 본다(true = 비어 있음) */
  probe(acc: string): boolean
  /** 설정 파일에 저장(settings.hotkeys[id], 조종 단축키는 settings.pet.controlHotkey). null은 단축키 없음. 워크스페이스 단축키는 workspaces.save */
  save(id: HotkeyId, acc: string | null): Promise<void>
  timers: Timers
  log(event: string, data: Record<string, unknown>): void
  /** 트레이 "단축키 일시 중지"가 켜져 있는지. 켜져 있으면 녹화가 끝나도 되살리지 않는다(일시 중지를 끌 때 되살린다) */
  userSuspended?(): boolean
  /** 녹화를 끝내며 다시 등록하지 못한 단축키 알림(트레이) */
  warn?(message: string): void
  /**
   * 녹화를 끝내며 단축키를 되살린 뒤(되살리지 못한 id와 함께). 설정 창이 '쓰는 중'·'등록 못 함'을 다시 그리게 알린다(A-M6).
   * 트레이에서 일시 중지해 되살리지 않았으면 부르지 않는다
   */
  resumed?(failed: HotkeyId[]): void
  /**
   * main이 스스로 녹화를 끝냈다(30초). 설정 창은 녹화 칸을 닫는다: 칸이 남아 포커스를 쥐고 있으면 되살린 단축키를 누를 때
   * 거절되지 않고 실행된다. 설정 창이 끝낸 녹화(멈춤·바꾸기)와 dispose에는 부르지 않는다
   */
  recordingEnded?(): void
  /** 워크스페이스 단축키. 없으면 workspace:<id>는 모두 없는 워크스페이스로 거절한다 */
  workspaces?: WorkspaceHotkeySide
}

export interface HotkeyChanger {
  check(id: HotkeyId, acc: string): HotkeyCheck
  /** 키 녹화 중에는 모든 단축키를 잠시 푼다(설계 문서 §6) */
  startRecording(): void
  stopRecording(): void
  /** 녹화 중인지(트레이 일시 중지를 끌 때 녹화 중이면 되살리지 않고 녹화가 끝날 때 되살린다) */
  recording(): boolean
  /** acc가 null이면 단축키를 비운다(조종·워크스페이스 단축키만, 팔레트·용어 찾기는 거절) */
  set(id: HotkeyId, acc: string | null): Promise<HotkeySetResult>
  candidates(): HotkeyCandidate[]
  dispose(): void
}

const same = (a: string | undefined, b: string): boolean => a !== undefined && sameAccelerator(a, b)

/**
 * 설정 창·온보딩의 단축키 바꾸기(설계 문서 §6). 바꿀 때는 기존 등록 해제 → 새로 등록 → 실패하면 되돌리기(HotkeyManager.bind).
 * 녹화가 어떻게 끝나든(멈춤·바꾸기·30초·dispose) 단축키를 되살린다. 다만 트레이에서 일시 중지했으면 그대로 둔다.
 * 말랑 메이트 조종·워크스페이스 단축키도 같은 길로 바꾸고, 비우면(null) 등록을 풀고 단축키 없음으로 저장한다.
 * 워크스페이스 단축키는 workspaces.json에 저장하고, 저장하지 못하면 등록도 되돌린다.
 */
export function createHotkeyChanger(d: HotkeyChangerDeps): HotkeyChanger {
  let recording = false
  let timer: unknown = null
  const name = (id: HotkeyId): string => hotkeyName(id, d.workspaces?.name)

  /** 녹화를 끝내고 단축키를 되살린다. 되살리지 못한 id 목록, 되살리지 않았으면(녹화 중이 아님·트레이 일시 중지 중) null */
  const endRecording = (): HotkeyId[] | null => {
    if (timer !== null) d.timers.clearTimeout(timer)
    timer = null
    if (!recording) return null
    recording = false
    // 녹화와 트레이 일시 중지는 따로 기록한다: 일시 중지 중이면 그것을 끌 때 되살린다
    if (d.userSuspended?.()) return null
    return d.manager.resumeAll().failed
  }

  /** 되살린 결과를 알린다: 설정 창 다시 그리기(resumed), 되살리지 못한 단축키의 기록·트레이 알림 */
  const reportResume = (failed: HotkeyId[] | null): void => {
    if (failed === null) return
    d.resumed?.(failed)
    if (!failed.length) return
    d.log('hotkey.resume.failed', { ids: failed })
    d.warn?.(resumeFailedNotice(failed, d.workspaces?.name))
  }

  const stopRecording = (): void => reportResume(endRecording())

  /** workspaces.json에 저장했지만 지금 조합이 없는(등록하지 못한) 워크스페이스 단축키 중 같은 조합(A-M7) */
  const savedOther = (id: HotkeyId, acc: string): HotkeyId | undefined => {
    for (const [workspaceId, saved] of d.workspaces?.saved?.() ?? []) {
      const other = workspaceHotkeyId(workspaceId)
      if (other !== id && same(saved, acc)) return other
    }
    return undefined
  }

  const check = (id: HotkeyId, acc: string): HotkeyCheck => {
    // 주 키를 모르면 누르고 있는지 알 수 없어 자동 반복을 거르지 못한다(키 녹화는 아는 키만 만든다)
    if (acceleratorKeyCode(acc) === null) return { level: 'block', reason: UNKNOWN_KEY }
    const rule = checkAccelerator(acc)
    if (rule.level === 'block') return { level: 'block', reason: rule.reason }
    // 등록된 모든 단축키(팔레트·용어 찾기·조종·워크스페이스)와 견준다. 보조키 순서·대소문자는 따지지 않는다
    const other = d.manager.ids().find((o) => o !== id && same(d.manager.current(o), acc))
    if (other) return { level: 'same-as-other', reason: `${name(other)} 단축키와 같은 조합이에요` }
    // 지금 잡고 있는 자기 조합은 그대로 고를 수 있다(팔레트 대체 조합이 등록하지 못한 워크스페이스 조합과 같아도)
    if (same(d.manager.current(id), acc)) return { level: 'ok' }
    // 저장했지만 등록하지 못한 워크스페이스 단축키와도 견준다(A-M7)
    const saved = savedOther(id, acc)
    if (saved) return { level: 'same-as-other', reason: `${name(saved)} 단축키와 같은 조합이에요` }
    if (!d.probe(acc)) return { level: 'in-use', reason: IN_USE }
    return rule.level === 'warn' ? { level: 'warn', reason: rule.reason } : { level: 'ok' }
  }

  /** 워크스페이스 단축키면 그 워크스페이스가 있는지 보고 처리기를 붙인다(앱 단축키는 늘 true) */
  const prepare = async (id: HotkeyId): Promise<boolean> =>
    !isWorkspaceHotkey(id) || ((await d.workspaces?.prepare(workspaceIdOf(id))) ?? false)

  /** 저장했는지. 설정 파일 저장은 실패해도 이번 실행에 적용하므로(설정 쓰기) 늘 true */
  const save = async (id: HotkeyId, acc: string | null): Promise<boolean> => {
    if (!isWorkspaceHotkey(id)) {
      await d.save(id, acc)
      return true
    }
    return (await d.workspaces?.save(workspaceIdOf(id), acc)) ?? false
  }

  /** 저장하지 못하면 등록도 바꾸기 전으로 되돌린다. 그사이 지워진 워크스페이스는 풀기만 한다 */
  const rollback = async (id: HotkeyId, previous: string | undefined): Promise<void> => {
    if (previous !== undefined && (await prepare(id))) d.manager.rebind(id, previous)
    else d.manager.unbind(id)
  }

  /** 단축키 하나를 바꾸거나(acc) 비운다(null). 녹화는 부른 쪽(set)이 먼저 끝낸다 */
  const change = async (id: HotkeyId, acc: string | null): Promise<HotkeySetResult> => {
    // 로그에는 id와 까닭만(워크스페이스 이름은 안내 문구에만)
    const fail = (reason: string, why: string): HotkeySetResult => {
      d.log('hotkey.change', { id, ok: false, reason: why })
      return { ok: false, reason }
    }
    if (!(await prepare(id))) return fail(WORKSPACE_NOTES.missing, 'missing')
    const previous = d.manager.current(id)
    if (acc === null) {
      if (!isWorkspaceHotkey(id) && id !== 'pet-control') return fail(`${name(id)} 단축키는 비워 둘 수 없어요`, 'not-clearable')
      d.manager.unbind(id)
      if (!(await save(id, null))) {
        await rollback(id, previous)
        return fail(SAVE_FAILED, 'save-failed')
      }
      d.log('hotkey.change', { id, ok: true, acc: null })
      return { ok: true, acc: null }
    }
    const c = check(id, acc)
    if (c.level === 'block' || c.level === 'same-as-other' || c.level === 'in-use') return fail(c.reason ?? '이 조합은 쓸 수 없어요', c.level)
    const r = d.manager.rebind(id, acc)
    if (!r.ok) return fail(r.reason === 'in-use' ? IN_USE : (r.detail ?? '이 조합은 쓸 수 없어요'), r.reason)
    if (!(await save(id, acc))) {
      await rollback(id, previous)
      return fail(SAVE_FAILED, 'save-failed')
    }
    d.log('hotkey.change', { id, ok: true, acc })
    return c.level === 'warn' ? { ok: true, acc, warning: c.reason } : { ok: true, acc }
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
        d.recordingEnded?.()
      }, RECORD_TIMEOUT_MS)
    },
    stopRecording,
    recording: () => recording,
    async set(id, acc) {
      // 녹화를 먼저 끝내 단축키를 되살린 뒤 바꾼다. 되살린 결과는 바꾸기가 완료된 뒤 알린다: 바꾸는 도중(등록은 새 조합, 저장은 아직
      // 이전 조합)에 설정 창이 다시 그리면 그 단축키가 잠시 '등록 못 함'으로 보인다
      const resumed = endRecording()
      try {
        return await change(id, acc)
      } finally {
        reportResume(resumed)
      }
    },
    candidates() {
      const own = d.manager.current('palette')
      // 저장했지만 등록하지 못한 워크스페이스 조합은 비어 있어 보여도 고르면 겹침으로 거절되므로 뺀다(팔레트가 지금 잡은 조합은 남긴다)
      const list = ONBOARDING_CANDIDATES.filter((acc) => same(own, acc) || !savedOther('palette', acc)).map((acc) => ({
        acc,
        available: same(own, acc) || d.probe(acc)
      }))
      const suggested = list.find((c) => c.acc !== 'Alt+Space' && c.available)?.acc
      return list.filter((c) => c.acc !== 'Alt+Space' || c.available).map((c) => ({ ...c, suggested: c.acc === suggested }))
    },
    dispose: stopRecording
  }
}
