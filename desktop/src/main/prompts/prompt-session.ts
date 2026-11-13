import { pickAiTarget, type AiTarget } from '../../shared/ai-targets'
import type { AppEvent } from '../../shared/app-events'
import type { PromptDraft, PromptPreview, PromptRequest, PromptRunResult } from '../../shared/ipc-channels'
import { withObjectParticle } from '../../shared/josa'
import { ALL_CATEGORIES, type MaskCategory, type MaskItem } from '../../shared/masking/types'
import type { FillResult, Template } from '../../shared/template/types'
import { errorCode } from '../error-text'
import type { CaptureResult, MaskingMode } from '../../shared/types'

/** 넘으면 경고하는 입력 길이(설계 문서 §16: 2만 자 기준) */
export const INPUT_WARN_CHARS = 20000
/** 확인 화면에 보낼 미리 보기 길이 */
export const PREVIEW_CHARS = 4000
export const SESSION_TTL_MS = 10 * 60 * 1000

const EXPIRED = '시간이 지나 준비한 내용이 사라졌어요. 프롬프트를 다시 골라 주세요.'
const BUSY_NOTICE = '다른 프롬프트를 실행하고 있어요. 잠시 뒤에 다시 눌러 주세요.'
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
  /** 팔레트가 지금 보이는지(바에서 누를 때 팔레트를 먼저 숨겨야 하는지 판단) */
  paletteVisible(): boolean
  capture(): Promise<CaptureResult>
  readClipboard(): Promise<string>
  showConfirm(draft: PromptDraft): void
  fill(template: Template, input: string, clipboard: string): FillResult
  /** 가명 처리(설계 문서 §8). dryRun이면 대응표를 확정하지 않는다 */
  mask(text: string, o: { mode: MaskingMode; disabledKeys: string[]; dryRun: boolean }): Promise<PromptMaskResult>
  /** 설정의 전체 기본 모드 */
  defaultMasking(): MaskingMode
  /** 확인 화면의 가명 처리 첫 안내를 아직 보지 않았는지(설정 tips.maskingExampleSeen의 반대) */
  maskingTipDue(): boolean
  /** excludeFromHistory면 Win+V 기록·클라우드 동기화에서 뺀다(실명이 든 글) */
  writeClipboard(text: string, o: { excludeFromHistory: boolean }): Promise<void>
  openUrl(url: string): Promise<void>
  notify(message: string): void
  /** 길이·id·건수만 넘긴다(글 내용·이름 금지) */
  log(event: string, data: Record<string, unknown>): void
  targets(): { list: AiTarget[]; defaultId: string }
  now(): number
  /**
   * 말랑 메이트에 앱 일을 알린다(복사함, 가져오지 못함). 글·가린 이름은 담지 않는다:
   * 가린 것은 분류별 건수, AI는 열 대상 이름만(말풍선에 그대로 보여 줄 값, 로그에는 남기지 않음)
   */
  emit(e: AppEvent): void
}

/** 켠 항목의 분류별 건수 합(0건 제외, ALL_CATEGORIES 순서) */
function maskedCounts(items: MaskItem[]): { category: MaskCategory; count: number }[] {
  return ALL_CATEGORIES.map((category) => ({
    category,
    count: items.filter((i) => i.enabled && i.category === category).reduce((n, i) => n + i.count, 0)
  })).filter((m) => m.count > 0)
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
  /** 바의 고정 프롬프트: 선택 글이 있으면 확인 화면 없이 실행, 없으면 확인 화면 */
  runFromBar(templateId: string): Promise<'ran' | 'confirm' | 'missing' | 'busy'>
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
  /** 바 실행·준비 중(선택 글 가져오기 포함). 겹치는 호출을 막는다 */
  let busy = false

  const current = (): Session | null => {
    if (session && d.now() - session.createdAt > SESSION_TTL_MS) session = null
    return session
  }
  const inputOf = (s: Session, req: PromptRequest): string =>
    req.source === 'selection' ? s.selection : req.source === 'clipboard' ? s.clipboard : (req.input ?? '')
  /** 우선순위: 이번 실행 > 템플릿 기본값(default가 아니면) > 전체 기본값 */
  const modeOf = (template: Template, req?: PromptRequest): MaskingMode =>
    req?.masking ?? (template.masking && template.masking !== 'default' ? template.masking : d.defaultMasking())

  interface Grabbed {
    selection: string
    skipped?: PromptDraft['selection']['skipped']
  }
  /** 선택 글 가져오기(prepare·바 공통). hide가 true면 팔레트를 숨기고 직전 창으로 돌아간 뒤 가져온다 */
  const grab = async (hide: boolean): Promise<Grabbed> => {
    if (hide && !(await d.hidePaletteAndRefocus())) return { selection: '', skipped: 'no-foreground' }
    const result = await d.capture()
    if (result.skipped) return { selection: '', skipped: result.skipped }
    // 공백·줄바꿈만 가져온 것은 선택이 없는 것과 같다
    if (result.text?.trim()) return { selection: result.text }
    return { selection: '', skipped: 'nothing-selected' }
  }
  /** 확인 화면 초안을 만들어 띄운다(prepare·바 공통) */
  const showConfirmFor = async (template: Template, got: Grabbed, event: string): Promise<void> => {
    // 가져오기가 원래 클립보드를 되돌린 뒤에 읽는다
    const clipboard = await d.readClipboard()
    session = { template, selection: got.selection, clipboard, createdAt: d.now() }
    const { list, defaultId } = d.targets()
    d.showConfirm({
      templateId: template.id,
      name: template.name,
      group: template.group,
      selection: got.skipped ? { length: 0, skipped: got.skipped } : { length: got.selection.length },
      clipboardLength: clipboard.length,
      defaultSource: got.selection ? 'selection' : clipboard.trim() ? 'clipboard' : 'input',
      targets: list.map((t) => ({ id: t.id, name: t.name })),
      target: pickAiTarget({ template: template.aiTarget, defaultId, targets: list }).id,
      masking: modeOf(template),
      maskingTip: d.maskingTipDue()
    })
    if (event === 'prompt.prepare') d.log(event, { templateId: template.id, selectionLength: got.selection.length, skipped: got.skipped ?? null, clipboardLength: clipboard.length })
    // 가져오지 못했으면 펫이 까닭을 알린다. busy(다른 가져오기가 진행 중)는 먼저 시작한 쪽이 처리한다
    if (got.skipped && got.skipped !== 'busy') d.emit({ type: 'capture-failed', reason: got.skipped })
  }
  /** 채우기 → 가리기 → 클립보드 → AI 열기 → 알림(run·바 공통) */
  const execute = async (template: Template, input: string, clip: string, req: PromptRequest | undefined) => {
    const mode = modeOf(template, req)
    const filled = d.fill(template, input, clip)
    const masked = await d.mask(filled.text, { mode, disabledKeys: req?.disabledKeys ?? [], dryRun: false })
    const maskedCount = masked.items.filter((i) => i.enabled).reduce((n, i) => n + i.count, 0)
    // 실명이 남는 글(끔, 설정에서 끈 분류, 이번에 끈 항목)은 Win+V 기록에서 뺀다
    const excludeFromHistory = mode === 'off' || masked.partial || masked.items.some((i) => !i.enabled)

    const { list, defaultId } = d.targets()
    const target = pickAiTarget({ override: req?.target, template: template.aiTarget, defaultId, targets: list })
    await d.writeClipboard(masked.text, { excludeFromHistory })
    // 펫 반응은 복사한 직후, 브라우저를 열기 전에(여는 시간과 무관하게 1초 안에 반응한다)
    d.emit({ type: 'prompt-copied', masking: mode, masked: maskedCounts(masked.items), target: target.url ? target.name : null })
    if (target.url) await d.openUrl(target.url)
    const head = `복사했어요${mode === 'off' ? '(가명 처리 꺼짐)' : ''}${mode !== 'off' && maskedCount > 0 ? ` · 가명 ${maskedCount}건` : ''}`
    const message = target.url ? `${head} · ${withObjectParticle(target.name)} 열었어요. Ctrl+V로 붙여넣으세요.` : `${head}. 붙여넣을 곳에서 Ctrl+V를 누르세요.`
    d.notify(message)
    return { message, mode, maskedCount, outputLength: masked.text.length, targetId: target.id }
  }

  return {
    async prepare(templateId) {
      const template = d.findTemplate(templateId)
      if (!template) {
        d.log('prompt.prepare.missing', { templateId })
        return
      }
      if (busy) {
        d.log('prompt.prepare.busy', { templateId })
        d.notify(BUSY_NOTICE)
        return
      }
      busy = true
      try {
        // 키를 누른 채로 팔레트를 숨기면 자동 반복된 Enter가 원래 앱에 들어가 선택한 글을 지운다
        const got: Grabbed = (await d.waitKeysReleased()) ? await grab(true) : { selection: '', skipped: 'keys-held' }
        await showConfirmFor(template, got, 'prompt.prepare')
      } finally {
        busy = false
      }
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

      const r = await execute(s.template, input, s.clipboard, req)
      d.log('prompt.run', {
        templateId: s.template.id,
        source: req.source,
        inputLength: input.length,
        outputLength: r.outputLength,
        target: r.targetId,
        masking: r.mode,
        masked: r.maskedCount
      })
      return { ok: true, message: r.message }
    },

    async runFromBar(templateId) {
      if (busy) {
        d.log('prompt.bar', { templateId, result: 'busy', selectionLength: 0, skipped: null })
        return 'busy'
      }
      const template = d.findTemplate(templateId)
      // 상용구 같은 프롬프트가 아닌 템플릿은 바에서 실행하지 않는다(그사이 템플릿 파일이 바뀌었을 수 있다)
      if (!template || template.kind !== 'prompt') {
        d.log('prompt.bar', { templateId, result: 'missing', selectionLength: 0, skipped: null })
        return 'missing'
      }
      busy = true
      let selectionLength = 0
      try {
        // 바는 포커스를 받지 않아 원래 창이 그대로 앞에 있다. 팔레트가 열려 있을 때만 숨기고 돌아간다
        const got = await grab(d.paletteVisible())
        // 다른 클립보드 작업이 가져오기를 막았다: 선택이 없는 것이 아니므로 확인 화면을 열지 않는다(위키 카드와 같은 규칙)
        if (got.skipped === 'busy') {
          d.log('prompt.bar', { templateId, result: 'busy', selectionLength: 0, skipped: 'busy' })
          return 'busy'
        }
        selectionLength = got.selection.length
        if (got.selection) {
          const clip = await d.readClipboard()
          await execute(template, got.selection, clip, undefined)
          d.log('prompt.bar', { templateId, result: 'ran', selectionLength: got.selection.length, skipped: null })
          return 'ran'
        }
        await showConfirmFor(template, got, 'prompt.bar')
        d.log('prompt.bar', { templateId, result: 'confirm', selectionLength: 0, skipped: got.skipped ?? null })
        return 'confirm'
      } catch (e) {
        d.log('prompt.bar', { templateId, result: 'failed', selectionLength, skipped: null, error: errorCode(e) })
        throw e
      } finally {
        busy = false
      }
    },

    cancel() {
      session = null
    }
  }
}
