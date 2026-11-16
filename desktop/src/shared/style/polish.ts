import { cleanAiTells, type AiTellCounts } from './ai-tells'
import { toGaejo } from './endings'
import type { StyleCard } from './style-card'

export interface PolishResult {
  text: string
  counts: AiTellCounts & { endings: number }
  flags: { label: string; count: number }[]
}

/**
 * AI 답을 내 말투로(설계 §7-1): AI 티를 지우고, 내 말투가 개조식이면 ~습니다·~요 끝맺음을 개조식으로 바꾼다.
 * card가 null(견본 없음)이면 AI 티만 지운다(끝맺음은 그대로).
 */
export function polishAnswer(text: string, card: StyleCard | null): PolishResult {
  const cleaned = cleanAiTells(text, {
    bullet: card?.bullet ?? null,
    keep: new Set(card?.uses ?? [])
  })
  const ended =
    card?.dominant === 'gaejo' ? toGaejo(cleaned.text) : { text: cleaned.text, count: 0 }
  return {
    text: ended.text,
    counts: { ...cleaned.counts, endings: ended.count },
    flags: cleaned.flags
  }
}

/** 고친 곳 요약(알림용): "끝맺음 6 · 군더더기 3 · 꾸밈 기호 2". 고친 것이 없으면 '' */
export function polishSummary(c: PolishResult['counts']): string {
  const parts: string[] = []
  if (c.endings) parts.push(`끝맺음 ${c.endings}`)
  const filler = c.phrases + (c.preamble ? 1 : 0) + c.closing
  if (filler) parts.push(`군더더기 ${filler}`)
  if (c.markdown) parts.push(`꾸밈 기호 ${c.markdown}`)
  return parts.join(' · ')
}
