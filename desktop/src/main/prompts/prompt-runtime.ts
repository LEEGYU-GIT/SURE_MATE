import { clipboard, Notification, shell } from 'electron'
import { allAiTargets, isOpenableUrl } from '../../shared/ai-targets'
import { fillTemplate } from '../../shared/template/fill'
import type { Template } from '../../shared/template/types'
import { log } from '../log'
import { captureSelection } from '../native/selection'
import type { Settings } from '../settings/settings-store'
import { hidePalette, hidePaletteAndRefocus, showPalette } from '../windows/palette-window'
import { createPromptSession, type PromptSession } from './prompt-session'
import { readReference } from './references'

/** 넘으면 경고하는 기준 예시 길이(설계 문서 §7: 4,000자 이하 권장) */
export const REFERENCE_WARN_CHARS = 4000

/** 프롬프트 세션에 실제 Electron·Win32 기능을 연결한다 */
export function createPromptRuntime(o: { userData: string; getSettings: () => Settings; getTemplates: () => Template[] }): PromptSession {
  return createPromptSession({
    findTemplate: (id) => o.getTemplates().find((t) => t.id === id) ?? null,
    hidePaletteAndRefocus,
    capture: captureSelection,
    readClipboard: () => clipboard.readText(),
    showConfirm: (draft) => showPalette({ mode: 'confirm', draft }),
    fill: (template, input, clip) => {
      const longKinds: string[] = []
      const result = fillTemplate(template.body, {
        input,
        clipboard: clip,
        now: new Date(),
        terms: () => [], // M4 용어 사전 전까지 빈 목록
        reference: (kind) => {
          const text = readReference(o.userData, kind)
          if (text && text.length > REFERENCE_WARN_CHARS) longKinds.push(kind)
          return text
        }
      })
      const warnings = longKinds.map((k) => `기준 예시(${k})가 4,000자를 넘어요. 프롬프트가 길어져 AI가 앞부분만 읽을 수 있어요`)
      return { text: result.text, warnings: [...result.warnings, ...warnings] }
    },
    writeClipboard: (text) => clipboard.writeText(text),
    openUrl: async (url) => {
      if (!isOpenableUrl(url)) return
      // 브라우저가 앞으로 오도록 팔레트를 먼저 숨긴다(포커스를 되돌리지 않음)
      hidePalette({ restoreFocus: false })
      await shell.openExternal(url)
    },
    notify: (message) => {
      if (Notification.isSupported()) new Notification({ title: 'Sure-Mate', body: message, silent: true }).show()
    },
    log,
    targets: () => {
      const s = o.getSettings()
      return { list: allAiTargets(s.ai.custom), defaultId: s.ai.defaultTarget }
    },
    now: Date.now
  })
}
