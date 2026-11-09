import { createExecutionGuard } from '../../shared/execution-guard'
import type { ShownPayload } from '../../shared/ipc-channels'
import { errorText } from '../error-text'

/** 같은 단추를 이 시간 안에 두 번 누르면 한 번만 실행한다 */
export const BAR_REPEAT_MS = 300

export interface BarActionDeps {
  /** 지금 바에 있는 항목인지 */
  isKnown(id: string): boolean
  /** 단축키와 같은 동작 */
  togglePalette(): void
  openPalette(p: ShownPayload): void
  toggleMenu(kind: 'masking-menu' | 'workspace-menu', itemId: string): void
  runPrompt(templateId: string): Promise<unknown>
  setBusy(itemId: string | null): void
  togglePet(): Promise<void>
  openSettings(): Promise<void>
  /** 길이·id만(선택 글 금지) */
  log(event: string, data: Record<string, unknown>): void
}

/** 바 단추를 누르면 할 일(설계 문서 §14-1) */
export function createBarActions(d: BarActionDeps, now: () => number = Date.now): { run(id: string): Promise<void> } {
  const guard = createExecutionGuard(BAR_REPEAT_MS, now)
  return {
    async run(id) {
      if (!d.isKnown(id)) {
        d.log('bar.action.unknown', { length: id.length })
        return
      }
      if (!guard(id)) return
      switch (id) {
        case 'logo':
          d.togglePalette()
          return
        case 'masking':
          d.toggleMenu('masking-menu', 'masking')
          return
        case 'workspace':
          d.toggleMenu('workspace-menu', 'workspace')
          return
        case 'glossary':
          d.openPalette({ mode: 'search', query: '?' })
          return
        case 'pet':
          await d.togglePet()
          return
        case 'settings':
          await d.openSettings()
          return
      }
      if (!id.startsWith('prompt:')) return
      d.setBusy(id)
      try {
        await d.runPrompt(id.slice('prompt:'.length))
      } catch (e) {
        d.log('bar.prompt.failed', { error: errorText(e) })
      } finally {
        d.setBusy(null)
      }
    }
  }
}
