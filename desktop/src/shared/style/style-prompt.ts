import { AI_FILLERS, AI_FLAGS, AI_OPENERS } from './ai-tells'
import type { StyleCard } from './style-card'

const ENDING_RULE: Record<NonNullable<StyleCard['dominant']>, string> = {
  gaejo: "끝맺음은 개조식으로(~함, ~됨, ~예정, ~필요). '~습니다'·'~요'로 끝내지 마세요",
  hamnida: "끝맺음은 '~습니다'로",
  haeyo: "끝맺음은 '~요'로(예: 확인했어요, 공유할게요)",
  plain: "끝맺음은 '~다'로(예: 확인했다, 공유한다)"
}

const DATE_EXAMPLE: Record<NonNullable<StyleCard['dateStyle']>, string> = {
  'M/D(요일)': '11/18(수)',
  'M/D': '11/18',
  'M월 D일': '11월 18일',
  'YYYY-MM-DD': '2026-11-18',
  'YYYY.MM.DD': '2026.11.18'
}

/** 프롬프트에서 늘 피하라고 하는 것(내가 쓰는 말은 뺀다) */
function avoidList(card: StyleCard): string {
  const uses = new Set(card.uses)
  const words = [...AI_FILLERS, ...AI_OPENERS, ...AI_FLAGS.map((f) => f.label)].filter(
    (w) => !uses.has(w)
  )
  return words.slice(0, 10).join(', ')
}

/**
 * {{style:종류}} 자리에 들어가는 '내 말투' 안내(설계 §7-1). 견본 글은 넣지 않고 말투 카드만 넣는다.
 * 견본이 없으면 null(그 줄은 프롬프트에서 빠진다).
 */
export function renderStylePrompt(kind: string, card: StyleCard): string | null {
  if (card.samples === 0) return null
  const rules: string[] = []
  if (card.dominant) rules.push(ENDING_RULE[card.dominant])
  if (card.lineLength !== null)
    rules.push(`한 줄은 ${Math.max(10, Math.round(card.lineLength / 5) * 5)}자 안팎으로 짧게`)
  if (card.bullet) rules.push(`목록은 '${card.bullet.trim()}'로 시작`)
  if (card.dateStyle) rules.push(`날짜는 ${DATE_EXAMPLE[card.dateStyle]}처럼`)
  if (card.arrow) rules.push('원인과 결과, 할 일은 화살표(→)로 이어 써도 좋아요')
  if (card.closers.length) rules.push(`제가 자주 쓰는 끝말: ${card.closers.join(', ')}`)
  rules.push(
    `쓰지 말 것: ${avoidList(card)}, 첫 줄 인사("다음은 ~입니다")와 마지막 맺음말, **굵게**·#제목·이모지`
  )
  return [
    `[내 말투] 제가 쓴 것처럼 써 주세요. 평소 제 ${kind} 말투예요.`,
    ...rules.map((r) => `- ${r}`)
  ].join('\n')
}
