import { clipboard, shell } from 'electron'
import type { MaskingMode } from '../../shared/types'
import { appEvents } from '../app-events'
import { errorText } from '../error-text'
import { log } from '../log'
import { waitPickKeysReleased } from '../native/input'
import { captureSelection, writeClipboardText } from '../native/selection'
import { notify } from '../notify'
import { PICK_KEYS_WAIT_MS } from '../prompts/prompt-runtime'
import { hidePalette, hidePaletteAndRefocus } from '../windows/palette-window'
import { ensureMaskDictionaryFile } from './dictionary-store'
import { createMaskingCommands, type MaskingCommands } from './masking-commands'
import type { MaskingService } from './masking-service'

/** 가명 처리 명령에 실제 Electron·Win32 기능을 연결한다 */
export function createMaskingCommandsRuntime(o: {
  userData: string
  masking: MaskingService
  getMode(): MaskingMode
  setMode(mode: MaskingMode): Promise<void>
}): MaskingCommands {
  return createMaskingCommands({
    masking: o.masking,
    getMode: o.getMode,
    setMode: o.setMode,
    readClipboard: async () => clipboard.readText(),
    writeClipboard: async (text, wo) => {
      const r = await writeClipboardText(text, wo)
      if (wo.excludeFromHistory && !r.excluded) log('clipboard.excludeFailed', { error: r.error ? errorText(r.error) : null })
    },
    hidePalette: (restoreFocus) => hidePalette({ restoreFocus }),
    waitKeysReleased: () => waitPickKeysReleased(PICK_KEYS_WAIT_MS),
    // 프롬프트 흐름과 같은 순서: 고른 Enter를 뗄 때까지 기다림 → 팔레트를 숨기고 직전 창을 앞으로 → 가져오기
    captureSelection: async () => {
      if (!(await waitPickKeysReleased(PICK_KEYS_WAIT_MS))) return { text: null, skipped: 'keys-held' }
      if (!(await hidePaletteAndRefocus())) return { text: null, skipped: 'no-foreground' }
      const r = await captureSelection()
      return { text: r.text, skipped: r.skipped }
    },
    ensureDictionary: () => ensureMaskDictionaryFile(o.userData),
    openFile: (path) => shell.openPath(path),
    showInFolder: (path) => shell.showItemInFolder(path),
    notify,
    log,
    // 말랑 메이트 반응(설계 §14-2 "앱과 연결")
    emit: appEvents.emit
  })
}
