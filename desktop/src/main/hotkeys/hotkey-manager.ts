import { createRepeatFilter } from '../../shared/execution-guard'
import { checkAccelerator } from './accelerator-rules'

export interface ShortcutBackend {
  register(acc: string, cb: () => void): boolean
  unregister(acc: string): void
}

export type HotkeyId = 'palette' | 'lookup'

export type BindResult = { ok: true } | { ok: false; reason: 'in-use' | 'blocked'; detail?: string }

/** 키를 누르고 있을 때 반복 호출을 거르는 간격 */
const REPEAT_WINDOW_MS = 250

type Entry = { acc: string; handler: () => void; wrapped: () => void; active: boolean }

/**
 * 전역 단축키 등록을 관리한다.
 * Electron globalShortcut은 다른 앱이 잡은 조합이면 false만 돌려주므로, 결과를 확인하고 실패하면 이전 조합으로 되돌린다.
 */
export class HotkeyManager {
  private readonly entries = new Map<HotkeyId, Entry>()

  constructor(
    private readonly backend: ShortcutBackend,
    private readonly now: () => number = Date.now
  ) {}

  bind(id: HotkeyId, acc: string, handler: () => void): BindResult {
    const check = checkAccelerator(acc)
    if (check.level === 'block') return { ok: false, reason: 'blocked', detail: check.reason }

    const previous = this.entries.get(id)
    if (previous?.active) this.backend.unregister(previous.acc)

    const pass = createRepeatFilter(REPEAT_WINDOW_MS, this.now)
    const wrapped = (): void => {
      if (pass()) handler()
    }
    if (!this.backend.register(acc, wrapped)) {
      if (previous?.active) this.backend.register(previous.acc, previous.wrapped)
      return { ok: false, reason: 'in-use' }
    }
    this.entries.set(id, { acc, handler, wrapped, active: true })
    return { ok: true }
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
