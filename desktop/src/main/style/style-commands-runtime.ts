import { clipboard } from 'electron'
import type { Template } from '../../shared/template/types'
import { appEvents } from '../app-events'
import { errorText } from '../error-text'
import { log } from '../log'
import type { MaskingService } from '../masking/masking-service'
import { waitPickKeysReleased } from '../native/input'
import { captureSelection, writeClipboardText } from '../native/selection'
import { notify } from '../notify'
import { PICK_KEYS_WAIT_MS } from '../prompts/prompt-runtime'
import { hidePalette, hidePaletteAndRefocus } from '../windows/palette-window'
import { createStyleCommands, type LastPrompt, type StyleCommands } from './style-commands'
import { addStyleSample, listStyleKinds, readStyleSamples } from './style-store'

/** 내 말투 명령에 실제 Electron·Win32 기능을 연결한다 */
export function createStyleCommandsRuntime(o: {
  userData: string
  masking: Pick<MaskingService, 'unmask'>
  getTemplates: () => Template[]
  lastPrompt: () => LastPrompt | null
}): StyleCommands {
  return createStyleCommands({
    kinds: () =>
      listStyleKinds(o.getTemplates(), o.userData).map(({ kind, samples }) => ({ kind, samples })),
    samples: (kind) => readStyleSamples(o.userData, kind).map((s) => s.text),
    addSample: (kind, text) => addStyleSample(o.userData, kind, text),
    // 프롬프트 흐름과 같은 순서: 고른 Enter를 뗄 때까지 기다림 → 팔레트를 숨기고 직전 창을 앞으로 → 가져오기
    captureSelection: async () => {
      if (!(await waitPickKeysReleased(PICK_KEYS_WAIT_MS)))
        return { text: null, skipped: 'keys-held' }
      if (!(await hidePaletteAndRefocus())) return { text: null, skipped: 'no-foreground' }
      const r = await captureSelection()
      return { text: r.text, skipped: r.skipped }
    },
    readClipboard: async () => clipboard.readText(),
    writeClipboard: async (text, wo) => {
      const r = await writeClipboardText(text, wo)
      if (wo.excludeFromHistory && !r.excluded)
        log('clipboard.excludeFailed', { error: r.error ? errorText(r.error) : null })
    },
    unmask: (text) => o.masking.unmask(text),
    lastPrompt: o.lastPrompt,
    waitKeysReleased: () => waitPickKeysReleased(PICK_KEYS_WAIT_MS),
    hidePalette: (restoreFocus) => hidePalette({ restoreFocus }),
    now: () => new Date(),
    notify,
    log,
    emit: appEvents.emit
  })
}
