import { clipboard } from 'electron'
import { fillTemplate } from '../../shared/template/fill'
import type { Template } from '../../shared/template/types'
import { log } from '../log'
import { waitPickKeysReleased } from '../native/input'
import { captureSelection, pasteText, writeClipboardText } from '../native/selection'
import { notify } from '../notify'
import { PICK_KEYS_WAIT_MS } from '../prompts/prompt-runtime'
import { getPreviousHwnd, hidePaletteAndRefocus } from '../windows/palette-window'
import { createSnippetRunner } from './snippet-runner'

/** 상용구 실행기에 실제 Electron·Win32 기능을 연결한다 */
export function createSnippetRuntime(o: { getTemplates: () => Template[] }): { run(templateId: string): Promise<unknown> } {
  return createSnippetRunner({
    findTemplate: (id) => o.getTemplates().find((t) => t.id === id) ?? null,
    waitKeysReleased: () => waitPickKeysReleased(PICK_KEYS_WAIT_MS),
    hidePaletteAndRefocus,
    previousHwnd: getPreviousHwnd,
    capture: captureSelection,
    readClipboard: () => clipboard.readText(),
    // 상용구는 용어·기준 예시를 붙이지 않고 가명 처리도 하지 않는다(설계 문서 §12)
    fill: (body, input, clip) => fillTemplate(body, { input, clipboard: clip, now: new Date(), terms: () => [], reference: () => null }),
    paste: pasteText,
    writeClipboard: async (text) => {
      await writeClipboardText(text, { excludeFromHistory: false })
    },
    notify,
    log,
    now: Date.now
  })
}
