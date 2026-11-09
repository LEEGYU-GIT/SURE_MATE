import type { FillResult, Template } from '../../shared/template/types'
import type { CaptureResult, PasteFailReason } from '../../shared/types'

/** 같은 상용구를 이 시간 안에 두 번 실행하지 않는다(Enter 자동 반복·더블 클릭 방어) */
export const SNIPPET_DEDUPE_MS = 300

const HAS_SELECTION = /\{\{\s*selection\s*\}\}/
const HAS_CLIPBOARD = /\{\{\s*clipboard\s*\}\}/

const REASON_TEXT: Record<PasteFailReason, string> = {
  'target-gone': '붙여넣을 창이 없어졌어요',
  elevated: '관리자 권한 창',
  'not-foreground': '붙여넣을 창을 앞으로 가져오지 못했어요',
  'modifiers-held': '키를 누르고 있었어요',
  busy: '다른 복사 작업이 진행 중이에요',
  'native-unavailable': '이 PC에서는 키 입력을 보낼 수 없어요'
}

export interface SnippetRunnerDeps {
  findTemplate(id: string): Template | null
  /** 상용구를 고른 Enter·보조키가 떼어질 때까지 기다린다. 시간 안에 안 떼면 false */
  waitKeysReleased(): Promise<boolean>
  /** 팔레트를 숨기고 직전 창을 앞으로. 못 가져오면 false */
  hidePaletteAndRefocus(): Promise<boolean>
  /** 직전 창 핸들. 없으면 null */
  previousHwnd(): string | null
  capture(): Promise<CaptureResult>
  readClipboard(): Promise<string>
  /** 자리표시자 채우기. 가명 처리는 하지 않는다(설계 문서 §12) */
  fill(body: string, input: string, clipboard: string): FillResult
  /** 클립보드에 넣고 붙여넣는다. 붙여넣은 뒤 클립보드는 되돌리지 않는다 */
  paste(hwnd: string, text: string): Promise<{ ok: boolean; reason?: PasteFailReason }>
  /** 붙여넣지 못할 때 복사만 한다 */
  writeClipboard(text: string): Promise<void>
  notify(message: string): void
  /** id·길이·결과만 넘긴다(본문·선택 글 금지) */
  log(event: string, data: Record<string, unknown>): void
  now(): number
}

export interface SnippetRunResult {
  ok: boolean
  /** 붙여넣었으면 'pasted', 아니면 복사만 했거나 실행하지 않은 까닭 */
  result: 'pasted' | 'copied' | 'missing' | 'duplicate'
}

/**
 * 상용구 하나를 팔레트에서 골라 직전 창에 붙여넣는다(설계 문서 §10·§12).
 * 순서: 키 떼기 → 팔레트 숨기고 직전 창 앞으로 → (본문에 {{selection}}이 있을 때만 가져오기) → 채우기 → 붙여넣기.
 */
export function createSnippetRunner(d: SnippetRunnerDeps): { run(templateId: string): Promise<SnippetRunResult> } {
  const lastRun = new Map<string, number>()

  const copyOnly = async (templateId: string, text: string, why: string): Promise<SnippetRunResult> => {
    await d.writeClipboard(text)
    d.notify(`붙여넣지 못해 복사만 했어요: ${why}`)
    d.log('snippet.run', { templateId, length: text.length, result: 'copied', reason: why })
    return { ok: false, result: 'copied' }
  }

  return {
    async run(templateId) {
      const template = d.findTemplate(templateId)
      if (!template || template.kind !== 'snippet') {
        d.log('snippet.run', { templateId, result: 'missing' })
        return { ok: false, result: 'missing' }
      }
      const at = d.now()
      const prev = lastRun.get(templateId)
      if (prev !== undefined && at - prev < SNIPPET_DEDUPE_MS) {
        d.log('snippet.run', { templateId, result: 'duplicate' })
        return { ok: false, result: 'duplicate' }
      }
      lastRun.set(templateId, at)

      const keysReleased = await d.waitKeysReleased()
      // 키를 누른 채 붙여넣으면 자동 반복된 Enter가 함께 들어간다
      const refocused = keysReleased ? await d.hidePaletteAndRefocus() : false
      const hwnd = d.previousHwnd()

      let selection = ''
      if (keysReleased && refocused && HAS_SELECTION.test(template.body)) {
        const captured = await d.capture()
        selection = captured.text ?? ''
      }
      // 가져오기가 원래 클립보드를 되돌린 뒤에 읽는다. {{clipboard}}가 있을 때만 읽는다
      const clipboard = HAS_CLIPBOARD.test(template.body) ? await d.readClipboard() : ''
      const text = d.fill(template.body, selection, clipboard).text

      if (!keysReleased) return copyOnly(templateId, text, REASON_TEXT['modifiers-held'])
      if (!hwnd) return copyOnly(templateId, text, REASON_TEXT['target-gone'])

      const r = await d.paste(hwnd, text)
      if (r.ok) {
        d.log('snippet.run', { templateId, length: text.length, result: 'pasted' })
        return { ok: true, result: 'pasted' }
      }
      d.notify(`붙여넣지 못해 복사만 했어요: ${r.reason ? REASON_TEXT[r.reason] : '알 수 없는 까닭'}`)
      d.log('snippet.run', { templateId, length: text.length, result: 'copied', reason: r.reason ?? null })
      return { ok: false, result: 'copied' }
    }
  }
}
