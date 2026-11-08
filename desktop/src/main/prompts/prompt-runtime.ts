import { clipboard, Notification, shell } from 'electron'
import { allAiTargets, isOpenableUrl } from '../../shared/ai-targets'
import { fillTemplate } from '../../shared/template/fill'
import type { Template } from '../../shared/template/types'
import { log } from '../log'
import type { MaskingService } from '../masking/masking-service'
import { waitPickKeysReleased } from '../native/input'
import { captureSelection, writeClipboardText } from '../native/selection'
import type { Settings } from '../settings/settings-store'
import { hidePalette, hidePaletteAndRefocus, showPalette } from '../windows/palette-window'
import { createPromptSession, type PromptSession } from './prompt-session'
import { readReference } from './references'

/** 넘으면 경고하는 기준 예시 길이(설계 문서 §7: 4,000자 이하 권장) */
export const REFERENCE_WARN_CHARS = 4000
/** 프롬프트를 고른 Enter를 떼길 기다리는 시간. Windows 자동 반복은 기본 0.5초 뒤 시작한다 */
export const PICK_KEYS_WAIT_MS = 600

/** 프롬프트 세션에 실제 Electron·Win32 기능을 연결한다 */
export function createPromptRuntime(o: {
  userData: string
  getSettings: () => Settings
  getTemplates: () => Template[]
  masking: MaskingService
}): PromptSession {
  return createPromptSession({
    findTemplate: (id) => o.getTemplates().find((t) => t.id === id) ?? null,
    waitKeysReleased: () => waitPickKeysReleased(PICK_KEYS_WAIT_MS),
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
      return { ...result, warnings: [...result.warnings, ...warnings] }
    },
    mask: (text, mo) => o.masking.mask(text, mo),
    defaultMasking: () => o.getSettings().masking.mode,
    writeClipboard: async (text, wo) => {
      // 실명이 든 글은 Win+V 기록·클라우드 동기화에서 뺀다. 가져오기의 늦은 복사 지켜보기가 끝난 뒤에 쓴다
      await writeClipboardText(text, wo)
    },
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
