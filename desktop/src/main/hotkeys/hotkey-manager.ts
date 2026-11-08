import { createHoldGate, createRepeatFilter } from '../../shared/execution-guard'
import { checkAccelerator } from './accelerator-rules'

export interface ShortcutBackend {
  register(acc: string, cb: () => void): boolean
  unregister(acc: string): void
}

export type HotkeyId = 'palette' | 'lookup'

export type BindResult = { ok: true } | { ok: false; reason: 'in-use' | 'blocked'; detail?: string }

/** 빠르게 두 번 눌렀거나 자동 반복이 이어질 때 거르는 간격 */
const REPEAT_WINDOW_MS = 250
/** 누르고 있는 키가 떼어졌는지 확인하는 간격과, 키 상태를 잘못 읽어도 다시 받기까지의 상한 */
const HOLD_POLL_MS = 30
const MAX_HOLD_MS = 3000

type Entry = { acc: string; handler: () => void; wrapped: () => void; active: boolean }

/**
 * 전역 단축키 등록을 관리한다.
 * Electron globalShortcut은 다른 앱이 잡은 조합이면 false만 돌려주므로, 결과를 확인하고 실패하면 이전 조합으로 되돌린다.
 */
export class HotkeyManager {
  private readonly entries = new Map<HotkeyId, Entry>()

  constructor(
    private readonly backend: ShortcutBackend,
    private readonly now: () => number = Date.now,
    /** 단축키의 주 키를 아직 누르고 있는지. 주면 누르고 있는 동안의 자동 반복을 모두 거른다. */
    private readonly isHeld?: (acc: string) => boolean
  ) {}

  bind(id: HotkeyId, acc: string, handler: () => void): BindResult {
    const check = checkAccelerator(acc)
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
    this.entries.set(id, { acc, handler, wrapped, active: true })
    return { ok: true }
  }

  /** 후보를 앞에서부터 시도해 처음 등록되는 조합을 쓴다(다른 앱이 기본 조합을 잡은 경우 대비). */
  bindFirst(id: HotkeyId, accs: string[], handler: () => void): { ok: true; acc: string } | { ok: false; tried: string[] } {
    for (const acc of accs) {
      if (this.bind(id, acc, handler).ok) return { ok: true, acc }
    }
    return { ok: false, tried: accs }
  }

  rebind(id: HotkeyId, acc: string): BindResult {
    const entry = this.entries.get(id)
    if (!entry) return { ok: false, reason: 'blocked', detail: '먼저 bind 해야 함' }
    return this.bind(id, acc, entry.handler)
  }

  suspendAll(): void {
    for (const entry of this.entries.values()) {
      if (entry.active) this.backend.unregister(entry.acc)
      entry.active = false
    }
  }

  resumeAll(): { failed: HotkeyId[] } {
    const failed: HotkeyId[] = []
    for (const [id, entry] of this.entries) {
      if (entry.active) continue
      entry.active = this.backend.register(entry.acc, entry.wrapped)
      if (!entry.active) failed.push(id)
    }
    return { failed }
  }

  current(id: HotkeyId): string | undefined {
    return this.entries.get(id)?.acc
  }
}
