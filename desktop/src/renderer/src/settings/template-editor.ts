import { fillTemplate } from '../../../shared/template/fill'
import type { FillResult, Template } from '../../../shared/template/types'

/** 편집기의 자리표시자 단추(설계 문서 §7) */
export const PLACEHOLDERS: { token: string; label: string }[] = [
  { token: '{{selection}}', label: '선택한 글' },
  { token: '{{clipboard}}', label: '클립보드' },
  { token: '{{terms}}', label: '글에 나온 용어' },
  { token: '{{date}}', label: '오늘 날짜' },
  { token: '{{time}}', label: '지금 시각' },
  { token: '{{reference:회의록}}', label: '기준 예시' }
]

/** 커서 자리(고른 글이 있으면 그 자리)에 넣고 넣은 뒤 커서 자리를 돌려준다 */
export function insertPlaceholder(body: string, selStart: number, selEnd: number, token: string): { body: string; caret: number } {
  const a = Math.max(0, Math.min(selStart, body.length))
  const b = Math.max(a, Math.min(selEnd, body.length))
  return { body: body.slice(0, a) + token + body.slice(b), caret: a + token.length }
}

/** 미리 보기에 넣는 가상 회의 메모(가상 이름만) */
export const PREVIEW_INPUT = '가상자동차 주간 회의 메모\n- 브레이크 제어기 시험 일정은 다음 주 금요일까지 확정\n- 정적분석 결과는 수요일에 공유'

/** 가짜 입력으로 채운 결과(용어·기준 예시는 없음으로 친다). 경고는 편집기에 그대로 보인다 */
export function previewTemplate(body: string, now: Date = new Date('2026-11-10T09:00:00+09:00')): FillResult {
  return fillTemplate(body, { input: PREVIEW_INPUT, clipboard: '(클립보드 글)', now, terms: () => [], reference: () => null })
}

export type TemplateSource = 'builtin' | 'builtin-edited' | 'mine' | 'other'

/**
 * 목록에 붙일 출처: 기본(고치면 내 파일에 같은 id로 덮음), 기본을 고침(지우면 기본값으로), 내 것(설정 창에서 만듦),
 * 다른 파일(손으로 넣은 팩·가져온 팩 — 복사해서 고치기만).
 */
export function templateSource(t: Template, mine: Set<string>, builtinIds: Set<string>): TemplateSource {
  if (mine.has(t.id)) return builtinIds.has(t.id) ? 'builtin-edited' : 'mine'
  return t.scope === 'builtin' ? 'builtin' : 'other'
}
