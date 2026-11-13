import { clipboard, shell } from 'electron'
import { allAiTargets, isOpenableUrl } from '../../shared/ai-targets'
import { termsFor } from '../../shared/glossary/find-terms'
import type { GlossaryEntry } from '../../shared/glossary/types'
import { fillTemplate } from '../../shared/template/fill'
import type { Template } from '../../shared/template/types'
import { appEvents } from '../app-events'
import { errorText } from '../error-text'
import { log } from '../log'
import type { MaskingService } from '../masking/masking-service'
import { waitPickKeysReleased } from '../native/input'
import { captureSelection, writeClipboardText } from '../native/selection'
import { notify } from '../notify'
import type { Settings } from '../settings/settings-store'
import { hidePalette, hidePaletteAndRefocus, isPaletteVisible, showPalette } from '../windows/palette-window'
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
  /** 지금 용어 목록({{terms}}용, 팔레트를 열 때마다 새로 읽은 것) */
  getGlossary: () => GlossaryEntry[]
  masking: MaskingService
}): PromptSession {
  return createPromptSession({
    findTemplate: (id) => o.getTemplates().find((t) => t.id === id) ?? null,
    waitKeysReleased: () => waitPickKeysReleased(PICK_KEYS_WAIT_MS),
    hidePaletteAndRefocus,
    paletteVisible: isPaletteVisible,
    capture: captureSelection,
    readClipboard: () => clipboard.readText(),
    showConfirm: (draft) => showPalette({ mode: 'confirm', draft }),
    fill: (template, input, clip) => {
      const longKinds: string[] = []
      const result = fillTemplate(template.body, {
        input,
        clipboard: clip,
        now: new Date(),
        // 입력 글에 나온 용어의 설명을 붙인다(설계 문서 §7). 채운 뒤 가명 처리하므로 설명 속 이름도 가려진다
        terms: (text) => termsFor(text, o.getGlossary()),
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
    maskingTipDue: () => !o.getSettings().tips.maskingExampleSeen,
    writeClipboard: async (text, wo) => {
      // 실명이 든 글은 Win+V 기록·클라우드 동기화에서 뺀다. 가져오기의 늦은 복사 지켜보기가 끝난 뒤에 쓴다
      const r = await writeClipboardText(text, wo)
      // 기록 제외 표시를 못 붙였으면(보통으로는 썼다) 원인을 알 수 있게 남긴다
      if (wo.excludeFromHistory && !r.excluded) log('clipboard.excludeFailed', { error: r.error ? errorText(r.error) : null })
    },
    openUrl: async (url) => {
      if (!isOpenableUrl(url)) return
      // 브라우저가 앞으로 오도록 팔레트를 먼저 숨긴다(포커스를 되돌리지 않음)
      hidePalette({ restoreFocus: false })
      await shell.openExternal(url)
    },
    notify,
    log,
    targets: () => {
      const s = o.getSettings()
      return { list: allAiTargets(s.ai.custom), defaultId: s.ai.defaultTarget }
    },
    now: Date.now,
    // 말랑 메이트 반응(설계 §14-2 "앱과 연결")
    emit: appEvents.emit
  })
}
