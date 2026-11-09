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
  busy: '다른 복사 작업과 겹쳤어요',
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
  /** Win32 기능(koffi)을 쓸 수 있는지. 보안 프로그램이 막으면 false이고, 그때는 직전 창 핸들도 늘 없다 */
  nativeOk(): boolean
  capture(): Promise<CaptureResult>
  readClipboard(): Promise<string>
  /** 자리표시자 채우기. 가명 처리는 하지 않는다(설계 문서 §12) */
  fill(body: string, input: string, clipboard: string): FillResult
  /** 클립보드에 넣고 붙여넣는다. 붙여넣은 뒤 클립보드는 되돌리지 않는다. busy면 아무것도 쓰지 않았다 */
  paste(hwnd: string, text: string): Promise<{ ok: boolean; reason?: PasteFailReason }>
  /** 붙여넣지 못할 때 복사만 한다(앞의 클립보드 작업이 끝날 때까지 기다렸다 쓴다) */
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

  /** 클립보드에 써 두고 까닭을 알린다. 로그에는 알림 글 대신 까닭 코드를 남긴다 */
  const copyOnly = async (templateId: string, text: string, reason: PasteFailReason): Promise<SnippetRunResult> => {
    await d.writeClipboard(text)
    d.notify(`붙여넣지 못해 복사만 했어요: ${REASON_TEXT[reason]}`)
    d.log('snippet.run', { templateId, length: text.length, result: 'copied', reason })
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

      if (!keysReleased) return copyOnly(templateId, text, 'modifiers-held')
      // Win32를 못 불러오면 직전 창 핸들을 얻을 수 없다(창이 사라진 것이 아니다)
      if (!hwnd) return copyOnly(templateId, text, d.nativeOk() ? 'target-gone' : 'native-unavailable')

      const r = await d.paste(hwnd, text)
      if (r.ok) {
        d.log('snippet.run', { templateId, length: text.length, result: 'pasted' })
        return { ok: true, result: 'pasted' }
      }
      // 다른 클립보드 작업과 겹치면 붙여넣기가 아무것도 쓰지 않는다. 그 작업이 끝나길 기다려 써 두어 "복사만 했어요"가 사실이 되게 한다
      if (r.reason === 'busy') return copyOnly(templateId, text, 'busy')
      d.notify(`붙여넣지 못해 복사만 했어요: ${r.reason ? REASON_TEXT[r.reason] : '알 수 없는 까닭'}`)
      d.log('snippet.run', { templateId, length: text.length, result: 'copied', reason: r.reason ?? null })
      return { ok: false, result: 'copied' }
    }
  }
}
