import { pickAiTarget, type AiTarget } from '../../shared/ai-targets'
import type { PromptDraft, PromptPreview, PromptRequest, PromptRunResult } from '../../shared/ipc-channels'
import { withObjectParticle } from '../../shared/josa'
import type { MaskItem } from '../../shared/masking/types'
import type { FillResult, Template } from '../../shared/template/types'
import type { CaptureResult, MaskingMode } from '../../shared/types'

/** 넘으면 경고하는 입력 길이(설계 문서 §16: 2만 자 기준) */
export const INPUT_WARN_CHARS = 20000
/** 확인 화면에 보낼 미리 보기 길이 */
export const PREVIEW_CHARS = 4000
export const SESSION_TTL_MS = 10 * 60 * 1000

const EXPIRED = '시간이 지나 준비한 내용이 사라졌어요. 프롬프트를 다시 골라 주세요.'
const NO_INPUT = '넣을 글이 없어요. 글을 선택하거나 직접 입력해 주세요.'

/** 가리기 결과(가명 처리 서비스가 돌려주는 것 중 세션이 쓰는 것) */
export interface PromptMaskResult {
  text: string
  ranges: [number, number][]
  preamble: string | null
  items: MaskItem[]
  /** 가명 처리가 낸 경고·안내(가명 사전 오류 등) */
  warnings: string[]
  notes: string[]
  /** 설정에서 끈 분류가 있어 실명이 남을 수 있음 */
  partial: boolean
  mapRanges(ranges: [number, number][]): [number, number][]
}

export interface PromptSessionDeps {
  findTemplate(id: string): Template | null
  /** 프롬프트를 고른 Enter·보조키가 떼어질 때까지 기다린다. 시간 안에 안 떼면 false */
  waitKeysReleased(): Promise<boolean>
  /** 팔레트를 숨기고 직전 창을 앞으로. 직전 창이 없거나 못 가져오면 false */
  hidePaletteAndRefocus(): Promise<boolean>
  capture(): Promise<CaptureResult>
  readClipboard(): Promise<string>
  showConfirm(draft: PromptDraft): void
  fill(template: Template, input: string, clipboard: string): FillResult
  /** 가명 처리(설계 문서 §8). dryRun이면 대응표를 확정하지 않는다 */
  mask(text: string, o: { mode: MaskingMode; disabledKeys: string[]; dryRun: boolean }): Promise<PromptMaskResult>
  /** 설정의 전체 기본 모드 */
  defaultMasking(): MaskingMode
  /** excludeFromHistory면 Win+V 기록·클라우드 동기화에서 뺀다(실명이 든 글) */
  writeClipboard(text: string, o: { excludeFromHistory: boolean }): Promise<void>
  openUrl(url: string): Promise<void>
  notify(message: string): void
  /** 길이·id·건수만 넘긴다(글 내용·이름 금지) */
  log(event: string, data: Record<string, unknown>): void
  targets(): { list: AiTarget[]; defaultId: string }
  now(): number
}

interface Session {
  template: Template
  selection: string
  clipboard: string
  createdAt: number
}

export interface PromptSession {
  prepare(templateId: string): Promise<void>
  preview(req: PromptRequest): Promise<PromptPreview>
  run(req: PromptRequest): Promise<PromptRunResult>
  cancel(): void
}

const clip = (ranges: [number, number][], limit: number): [number, number][] =>
  ranges.filter(([start]) => start < limit).map(([start, end]): [number, number] => [start, Math.min(end, limit)])

/**
 * 프롬프트 하나를 고른 순간부터 실행까지(설계 문서 §7 흐름, §8 가명 처리).
 * 팔레트를 열 때가 아니라 프롬프트를 고를 때 선택 글을 가져온다(팔레트 표시 150ms 목표를 지키려고).
 * 선택 글은 main 메모리에만 두고, 세션은 하나만 10분 동안 둔다. 순서는 "채우기 → 가리기"다.
 */
export function createPromptSession(d: PromptSessionDeps): PromptSession {
  let session: Session | null = null

  const current = (): Session | null => {
    if (session && d.now() - session.createdAt > SESSION_TTL_MS) session = null
    return session
  }
  const inputOf = (s: Session, req: PromptRequest): string =>
    req.source === 'selection' ? s.selection : req.source === 'clipboard' ? s.clipboard : (req.input ?? '')
  /** 우선순위: 이번 실행 > 템플릿 기본값(default가 아니면) > 전체 기본값 */
  const modeOf = (template: Template, req?: PromptRequest): MaskingMode =>
    req?.masking ?? (template.masking && template.masking !== 'default' ? template.masking : d.defaultMasking())

  return {
    async prepare(templateId) {
      const template = d.findTemplate(templateId)
      if (!template) {
        d.log('prompt.prepare.missing', { templateId })
        return
      }
      let selection = ''
      let skipped: PromptDraft['selection']['skipped']
      // 키를 누른 채로 팔레트를 숨기면 자동 반복된 Enter가 원래 앱에 들어가 선택한 글을 지운다
      if (!(await d.waitKeysReleased())) {
        skipped = 'keys-held'
      } else if (!(await d.hidePaletteAndRefocus())) {
        skipped = 'no-foreground'
      } else {
        const result = await d.capture()
        if (result.skipped) skipped = result.skipped
        else if (result.text) selection = result.text
        else skipped = 'nothing-selected'
      }
      // 가져오기가 원래 클립보드를 되돌린 뒤에 읽는다
      const clipboard = await d.readClipboard()
      session = { template, selection, clipboard, createdAt: d.now() }

      const { list, defaultId } = d.targets()
      d.showConfirm({
        templateId: template.id,
        name: template.name,
        group: template.group,
        selection: skipped ? { length: 0, skipped } : { length: selection.length },
        clipboardLength: clipboard.length,
        defaultSource: selection ? 'selection' : clipboard.trim() ? 'clipboard' : 'input',
        targets: list.map((t) => ({ id: t.id, name: t.name })),
        target: pickAiTarget({ template: template.aiTarget, defaultId, targets: list }).id,
        masking: modeOf(template)
      })
      d.log('prompt.prepare', { templateId, selectionLength: selection.length, skipped: skipped ?? null, clipboardLength: clipboard.length })
    },

    async preview(req) {
      const s = current()
      if (!s) {
        return { text: '', truncated: false, inputLength: 0, warnings: [EXPIRED], notes: [], highlights: [], masking: { mode: d.defaultMasking(), items: [] }, maskRanges: [] }
      }
      const input = inputOf(s, req)
      const mode = modeOf(s.template, req)
      const filled = d.fill(s.template, input, s.clipboard)
      const masked = await d.mask(filled.text, { mode, disabledKeys: req.disabledKeys ?? [], dryRun: true })
      const warnings = [...filled.warnings, ...masked.warnings]
      if (input.length > INPUT_WARN_CHARS) {
        warnings.push(`입력이 2만 자를 넘어요(${input.length.toLocaleString('ko-KR')}자). AI가 앞부분만 읽을 수 있어요`)
      }
      const truncated = masked.text.length > PREVIEW_CHARS
      return {
        text: truncated ? masked.text.slice(0, PREVIEW_CHARS) : masked.text,
        truncated,
        inputLength: input.length,
        warnings,
        notes: [...filled.notes, ...masked.notes],
        highlights: clip(masked.mapRanges(filled.inputRanges), PREVIEW_CHARS),
        masking: { mode, items: masked.items },
        maskRanges: clip(masked.ranges, PREVIEW_CHARS)
      }
    },

    async run(req) {
      const s = current()
      if (!s) return { ok: false, message: EXPIRED }
      const input = inputOf(s, req)
      if (!input.trim()) return { ok: false, message: NO_INPUT }
      // 기다리기 전에 비워 두어야 Enter를 빠르게 두 번 눌러도 한 번만 실행된다
      session = null

      const mode = modeOf(s.template, req)
      const filled = d.fill(s.template, input, s.clipboard)
      const masked = await d.mask(filled.text, { mode, disabledKeys: req.disabledKeys ?? [], dryRun: false })
      const maskedCount = masked.items.filter((i) => i.enabled).reduce((n, i) => n + i.count, 0)
      // 실명이 남는 글(끔, 설정에서 끈 분류, 이번에 끈 항목)은 Win+V 기록에서 뺀다
      const excludeFromHistory = mode === 'off' || masked.partial || masked.items.some((i) => !i.enabled)

      const { list, defaultId } = d.targets()
      const target = pickAiTarget({ override: req.target, template: s.template.aiTarget, defaultId, targets: list })
      await d.writeClipboard(masked.text, { excludeFromHistory })
      if (target.url) await d.openUrl(target.url)
      const head = `복사했어요${mode === 'off' ? '(가명 처리 꺼짐)' : ''}${mode !== 'off' && maskedCount > 0 ? ` · 가명 ${maskedCount}건` : ''}`
      const message = target.url ? `${head} · ${withObjectParticle(target.name)} 열었어요. Ctrl+V로 붙여넣으세요.` : `${head}. 붙여넣을 곳에서 Ctrl+V를 누르세요.`
      d.notify(message)
      d.log('prompt.run', {
        templateId: s.template.id,
        source: req.source,
        inputLength: input.length,
        outputLength: masked.text.length,
        target: target.id,
        masking: mode,
        masked: maskedCount
      })
      return { ok: true, message }
    },

    cancel() {
      session = null
    }
  }
}
