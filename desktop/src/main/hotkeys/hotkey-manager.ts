import { createHoldGate, createRepeatFilter } from '../../shared/execution-guard'
import { checkAccelerator } from './accelerator-rules'

export interface ShortcutBackend {
  register(acc: string, cb: () => void): boolean
  unregister(acc: string): void
}

/** 워크스페이스 단축키(설계 §11): workspace:<워크스페이스 id> */
export type WorkspaceHotkeyId = `workspace:${string}`
export type HotkeyId = 'palette' | 'lookup' | 'pet-control' | WorkspaceHotkeyId

export const WORKSPACE_HOTKEY_PREFIX = 'workspace:'
export const workspaceHotkeyId = (workspaceId: string): WorkspaceHotkeyId => `workspace:${workspaceId}`
export const isWorkspaceHotkey = (id: HotkeyId): id is WorkspaceHotkeyId => id.startsWith(WORKSPACE_HOTKEY_PREFIX)
export const workspaceIdOf = (id: WorkspaceHotkeyId): string => id.slice(WORKSPACE_HOTKEY_PREFIX.length)

export type BindResult = { ok: true } | { ok: false; reason: 'in-use' | 'blocked'; detail?: string }

/** 빠르게 두 번 눌렀거나 자동 반복이 이어질 때 거르는 간격 */
const REPEAT_WINDOW_MS = 250
/** 누르고 있는 키가 떼어졌는지 확인하는 간격과, 키 상태를 잘못 읽어도 다시 받기까지의 상한 */
const HOLD_POLL_MS = 30
const MAX_HOLD_MS = 3000

type Entry = { acc: string; wrapped: () => void; active: boolean }

/**
 * 전역 단축키 등록을 관리한다.
 * Electron globalShortcut은 다른 앱이 잡은 조합이면 false만 돌려주므로, 결과를 확인하고 실패하면 이전 조합으로 되돌린다.
 */
export class HotkeyManager {
  /** 지금 조합이 있는 단축키 */
  private readonly entries = new Map<HotkeyId, Entry>()
  /** id마다 하나인 처리기. 조합을 떼거나(unbind) 등록에 실패해도 남아 rebind로 다시 붙인다 */
  private readonly handlers = new Map<HotkeyId, () => void>()
  /** suspendAll 뒤 resumeAll 전(키 녹화·트레이 일시 중지). 이때 묶은 조합은 resumeAll이 다른 단축키와 함께 등록한다 */
  private suspended = false

  constructor(
    private readonly backend: ShortcutBackend,
    private readonly now: () => number = Date.now,
    /** 단축키의 주 키를 아직 누르고 있는지. 주면 누르고 있는 동안의 자동 반복을 모두 거른다. */
    private readonly isHeld?: (acc: string) => boolean
  ) {}

  /** acc가 null이면 등록하지 않고 처리기만 둔다(기본 조합이 없는 말랑 메이트 조종 단축키) */
  bind(id: HotkeyId, acc: string | null, handler: () => void): BindResult {
    this.handlers.set(id, handler)
    if (acc === null) {
      this.unbind(id)
      return { ok: true }
    }
    // 새로 고를 때만 막는 조합(기본 편집 단축키)은 여기서 막지 않는다(saved): 새 조합은 단축키 바꾸기(hotkey-change.ts의 check)가
    // 먼저 거르고, 시작할 때·바꾸기 실패 뒤 되돌릴 때는 그 규칙 전에 저장해 둔 조합도 그대로 등록해야 한다(말없이 사라지지 않게)
    const check = checkAccelerator(acc, { saved: true })
    if (check.level === 'block') return { ok: false, reason: 'blocked', detail: check.reason }

    const previous = this.entries.get(id)
    if (previous?.active) this.backend.unregister(previous.acc)

    const repeat = createRepeatFilter(REPEAT_WINDOW_MS, this.now)
    const isHeld = this.isHeld
    const hold = isHeld ? createHoldGate(() => isHeld(acc), { pollMs: HOLD_POLL_MS, maxHoldMs: MAX_HOLD_MS }, this.now) : null
    const wrapped = (): void => {
      // repeat()는 매번 불러 받은 시각을 남겨야 하므로 먼저 부른다
      if (repeat() && (hold ? hold() : true)) handler()
    }
    if (!this.backend.register(acc, wrapped)) {
      if (previous?.active) this.backend.register(previous.acc, previous.wrapped)
      return { ok: false, reason: 'in-use' }
    }
    // 일시 중지 중이면 다른 앱이 쓰는지만 확인하고 풀어 둔다(녹화 중에 워크스페이스 단축키를 다시 맞춰도 눌리지 않게)
    if (this.suspended) this.backend.unregister(acc)
    this.entries.set(id, { acc, wrapped, active: !this.suspended })
    return { ok: true }
  }

  /** 조합을 떼고 잊는다. 처리기는 남아 rebind로 다시 붙일 수 있다(조종 단축키 비우기) */
  unbind(id: HotkeyId): void {
    const entry = this.entries.get(id)
    if (entry?.active) this.backend.unregister(entry.acc)
    this.entries.delete(id)
  }

  /** 후보를 앞에서부터 시도해 처음 등록되는 조합을 쓴다(다른 앱이 기본 조합을 잡은 경우 대비). */
  bindFirst(id: HotkeyId, accs: string[], handler: () => void): { ok: true; acc: string } | { ok: false; tried: string[] } {
    for (const acc of accs) {
      if (this.bind(id, acc, handler).ok) return { ok: true, acc }
    }
    return { ok: false, tried: accs }
  }

  rebind(id: HotkeyId, acc: string): BindResult {
    const handler = this.handlers.get(id)
    if (!handler) return { ok: false, reason: 'blocked', detail: '먼저 bind 해야 함' }
    return this.bind(id, acc, handler)
  }

  suspendAll(): void {
    this.suspended = true
    for (const entry of this.entries.values()) {
      if (entry.active) this.backend.unregister(entry.acc)
      entry.active = false
    }
  }

  resumeAll(): { failed: HotkeyId[] } {
    this.suspended = false
    const failed: HotkeyId[] = []
    for (const [id, entry] of this.entries) {
      if (entry.active) continue
      entry.active = this.backend.register(entry.acc, entry.wrapped)
      if (!entry.active) failed.push(id)
    }
    return { failed }
  }

  /** 그 단축키의 조합. 되살리지 못해 등록되지 않은 조합도 돌려준다(등록됐는지는 isRegistered) */
  current(id: HotkeyId): string | undefined {
    return this.entries.get(id)?.acc
  }

  /**
   * 그 단축키가 지금 실제로 등록돼 있는지(설정 창의 '쓰는 중'·'등록 못 함', A-M6). 일시 중지 중(녹화·트레이)은 되살릴 때 다시
   * 등록하므로 등록된 것으로 본다. 되살리지 못한 단축키는 current가 조합을 돌려줘도 false
   */
  isRegistered(id: HotkeyId): boolean {
    const entry = this.entries.get(id)
    return entry !== undefined && (entry.active || this.suspended)
  }

  /** 지금 조합이 있는 단축키(일시 중지 중인 것 포함, 처리기만 둔 것은 빼고). 겹침 검사가 모두를 본다 */
  ids(): HotkeyId[] {
    return [...this.entries.keys()]
  }
}
