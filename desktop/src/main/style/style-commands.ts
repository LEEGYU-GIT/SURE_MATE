import type { AppEvent } from '../../shared/app-events'
import { CAPTURE_NOTES } from '../../shared/labels'
import { withObjectParticle } from '../../shared/josa'
import { dateContext, unsupportedFacts } from '../../shared/style/fact-check'
import { polishAnswer, polishSummary } from '../../shared/style/polish'
import { analyzeStyle, describeStyle, type StyleCard } from '../../shared/style/style-card'
import type { CaptureSkipReason, PaletteItem } from '../../shared/types'
import { errorText } from '../error-text'
import type { AddSampleResult } from './style-store'

export const STYLE_POLISH_ID = 'cmd.style-polish'
export const STYLE_ADD_PREFIX = 'cmd.style-add:'
/** 마지막 프롬프트의 입력·말투 종류를 기억하는 시간(가명 대응표 기본 보관 시간과 같은 8시간) */
export const LAST_PROMPT_TTL_MS = 8 * 60 * 60 * 1000

/** 팔레트 명령: AI 티 지우기, 말투 종류마다 '내 말투로 등록'(설계 §7-1) */
export function styleCommandItems(
  kinds: readonly { kind: string; samples: number }[]
): PaletteItem[] {
  return [
    {
      id: STYLE_POLISH_ID,
      group: 'command',
      title: 'AI 티 지우기 · 내 말투로',
      subtitle:
        'AI 답을 복사한 뒤 실행하면 가명을 되돌리고, 끝맺음·군더더기를 내 말투로 고쳐 클립보드에 넣어요',
      keywords: [
        'AI 티',
        'AI티',
        '말투',
        '내 말투',
        '다듬기',
        '자연스럽게',
        '사람처럼',
        '티 안 나게',
        'polish',
        'tone'
      ]
    },
    ...kinds.map((k): PaletteItem => ({
      id: `${STYLE_ADD_PREFIX}${k.kind}`,
      group: 'command',
      title: `내 말투로 등록: ${k.kind}`,
      subtitle: `내가 쓴 ${withObjectParticle(k.kind)} 선택하고 실행하면 말투 견본으로 이 PC에만 저장해요(지금 ${k.samples}개)`,
      keywords: ['말투', '견본', '말투 학습', '내 글', '등록', k.kind]
    }))
  ]
}

/** 마지막으로 실행한 프롬프트(메모리에만, 8시간): 'AI 티 지우기'가 말투 종류와 원문 대조에 쓴다 */
export interface LastPrompt {
  /** 그 프롬프트 본문의 {{style:종류}}(없으면 null) */
  kind: string | null
  /** 프롬프트에 넣은 글(원문) */
  input: string
  at: number
}

export function createLastPrompt(now: () => number = Date.now): {
  set(kind: string | null, input: string): void
  get(): LastPrompt | null
} {
  let last: LastPrompt | null = null
  return {
    set(kind, input) {
      last = { kind, input, at: now() }
    },
    get() {
      if (last && now() - last.at > LAST_PROMPT_TTL_MS) last = null
      return last
    }
  }
}

export interface StyleCommandDeps {
  /** 지금 쓸 수 있는 말투 종류(템플릿의 {{style:종류}}와 견본 파일)와 견본 수 */
  kinds(): { kind: string; samples: number }[]
  samples(kind: string): string[]
  addSample(kind: string, text: string): Promise<AddSampleResult>
  /** 고른 Enter를 뗄 때까지 기다려 팔레트를 숨기고 직전 창에서 선택한 글을 가져온다 */
  captureSelection(): Promise<{ text: string | null; skipped?: CaptureSkipReason }>
  readClipboard(): Promise<string>
  /** excludeFromHistory면 Win+V 기록·클라우드 동기화에서 뺀다(실명이 든 글) */
  writeClipboard(text: string, o: { excludeFromHistory: boolean }): Promise<void>
  /** 가명 되돌리기(대응표에 없는 표시는 그대로 두고 알린다) */
  unmask(text: string): { text: string; restored: number; unknownTokens: string[] }
  lastPrompt(): LastPrompt | null
  waitKeysReleased(): Promise<boolean>
  hidePalette(restoreFocus: boolean): void
  now(): Date
  notify(message: string): void
  /** 건수·길이만 넘긴다(글·말투 종류 이름·숫자 값 금지) */
  log(event: string, data: Record<string, unknown>): void
  emit(e: AppEvent): void
}

export interface StyleCommands {
  /** 말투 명령이면 실행하고 true, 아니면 false */
  run(id: string): Promise<boolean>
}

const SHOWN_FACTS = 3
const SHOWN_TOKENS = 3

/** 내 말투 명령(설계 §7-1): AI 티 지우기, 내 말투로 등록 */
export function createStyleCommands(d: StyleCommandDeps): StyleCommands {
  /** 말투를 맞출 종류: 마지막 프롬프트의 종류, 없으면 견본이 가장 많은 종류 */
  const pickKind = (last: LastPrompt | null): string | null => {
    const kinds = d.kinds().filter((k) => k.samples > 0)
    if (last?.kind && kinds.some((k) => k.kind === last.kind)) return last.kind
    return [...kinds].sort((a, b) => b.samples - a.samples)[0]?.kind ?? null
  }

  const polish = async (): Promise<void> => {
    if (await d.waitKeysReleased()) d.hidePalette(true)
    const raw = await d.readClipboard()
    if (!raw.trim()) {
      d.notify('클립보드가 비어 있어요. AI 답을 복사한 뒤 다시 실행해 주세요.')
      return
    }
    const unmasked = d.unmask(raw)
    const last = d.lastPrompt()
    const kind = pickKind(last)
    const samples = kind ? d.samples(kind) : []
    const card: StyleCard | null = samples.length ? analyzeStyle(samples) : null
    const r = polishAnswer(unmasked.text, card)
    // 원문 대조는 마지막 프롬프트에 넣은 글과 오늘 날짜로(AI가 받은 글만 원문으로 본다)
    const facts = last ? unsupportedFacts(r.text, `${last.input}\n${dateContext(d.now())}`, 5) : []
    const summary = polishSummary(r.counts)
    d.log('style.polish', {
      inputLength: raw.length,
      outputLength: r.text.length,
      samples: samples.length,
      gaejo: card?.dominant === 'gaejo',
      endings: r.counts.endings,
      phrases: r.counts.phrases,
      markdown: r.counts.markdown,
      preamble: r.counts.preamble,
      closing: r.counts.closing,
      flags: r.flags.length,
      facts: facts.length,
      restored: unmasked.restored,
      checked: last !== null
    })
    if (r.text === raw && facts.length === 0) {
      d.notify('고칠 AI 티를 찾지 못했어요. 클립보드는 그대로예요.')
      return
    }
    await d.writeClipboard(r.text, { excludeFromHistory: unmasked.restored > 0 })
    if (unmasked.restored > 0) d.emit({ type: 'unmasked', restored: unmasked.restored })

    const head = card && kind ? `${kind} 말투로 고쳤어요` : 'AI 티를 지웠어요'
    const parts = [summary, unmasked.restored ? `이름 ${unmasked.restored}건 되돌림` : ''].filter(
      Boolean
    )
    const more = (xs: string[], shown: number): string =>
      xs.length > shown ? ` 외 ${xs.length - shown}개` : ''
    const tokens = unmasked.unknownTokens.length
      ? ` 모르는 가명은 그대로 둠: ${unmasked.unknownTokens.slice(0, SHOWN_TOKENS).join(', ')}${more(unmasked.unknownTokens, SHOWN_TOKENS)}.`
      : ''
    const factNote = facts.length
      ? ` 원문에 없는 값: ${facts.slice(0, SHOWN_FACTS).join(', ')}${more(facts, SHOWN_FACTS)}. 맞는지 확인해 주세요.`
      : ''
    const flagNote = r.flags.length ? ` 손볼 표현: ${r.flags.map((f) => f.label).join(', ')}.` : ''
    const hint = card ? '' : " 내가 쓴 글을 '내 말투로 등록'하면 끝맺음도 맞춰요."
    d.notify(
      `${head}${parts.length ? ` · ${parts.join(' · ')}` : ''}.${factNote}${flagNote}${tokens}${hint} 붙여넣을 곳에서 Ctrl+V를 누르세요.`
    )
  }

  const addSample = async (kind: string): Promise<void> => {
    if (!d.kinds().some((k) => k.kind === kind)) {
      d.notify('이 말투 종류가 없어졌어요. 팔레트를 다시 열어 주세요.')
      return
    }
    const captured = await d.captureSelection()
    const text = captured.text ?? ''
    if (!text.trim()) {
      const reason = captured.skipped ?? 'nothing-selected'
      d.notify(
        `${CAPTURE_NOTES[reason]}. 내가 쓴 ${withObjectParticle(kind)} 선택한 뒤 다시 실행해 주세요.`
      )
      if (reason !== 'busy') d.emit({ type: 'capture-failed', reason })
      return
    }
    const r = await d.addSample(kind, text)
    d.log(
      'style.sample',
      r.ok
        ? { ok: true, length: text.length, count: r.count, dropped: r.dropped }
        : { ok: false, length: text.length }
    )
    if (!r.ok) {
      d.notify(r.reason)
      return
    }
    const card = describeStyle(analyzeStyle(d.samples(kind)))
    const dropped = r.dropped ? ' 가장 오래된 견본은 뺐어요.' : ''
    d.notify(`${kind} 말투 견본을 ${r.count}개 모았어요.${dropped}${card[0] ? ` ${card[0]}` : ''}`)
  }

  return {
    async run(id) {
      if (id !== STYLE_POLISH_ID && !id.startsWith(STYLE_ADD_PREFIX)) return false
      try {
        if (id === STYLE_POLISH_ID) await polish()
        else await addSample(id.slice(STYLE_ADD_PREFIX.length))
      } catch (e) {
        d.log('style.commandError', { polish: id === STYLE_POLISH_ID, error: errorText(e) })
        d.notify('처리하지 못했어요. 다시 해 보고, 계속 안 되면 앱을 다시 켜 주세요.')
      }
      return true
    }
  }
}
