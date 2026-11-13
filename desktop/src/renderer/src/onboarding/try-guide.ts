import { pickAiTarget, type AiTarget } from '../../../shared/ai-targets'
import { repickParticle } from '../../../shared/josa'
import { UNMASK_COMMAND_TITLE } from '../../../shared/labels'
import { findTerms, type MaskTerm } from '../../../shared/masking/dictionary'
import { MappingTable } from '../../../shared/masking/mapping-table'
import { maskText } from '../../../shared/masking/mask'
import { findAllPatterns } from '../../../shared/masking/patterns'
import type { Settings } from '../../../shared/settings/settings'
import type { MaskingMode } from '../../../shared/types'

/** 30초 따라 해 보기에 쓰는 가상 회의 메모(가상 이름만). 화면이 미리 선택해 두고, 팔레트가 이 글을 가져간다 */
export const TRY_MEMO = `가상자동차 주간 회의 (11/10)
- 참석: 김가상, 이예시
- 브레이크 제어기 시험 일정은 다음 주 금요일까지 확정
- XY방산 납품 문서 검토는 목요일에 공유
- 시험 결과는 10.0.3.15 서버의 C:\\가상자동차\\시험결과 폴더에 올림
- 할 일: 정적분석 결과 정리(김가상), 시험 장비 예약(이예시)`

/** 확인 화면에서 바뀌는 것 하나(원래 → 바뀐 이름) */
export interface TrySwap {
  from: string
  to: string
}

/** 이름 뒤 조사(이/가, 을/를, 로/으로). 받침을 모르면 준 조사 그대로 */
const josa = (word: string, particle: string): string =>
  repickParticle(word, particle)?.particle ?? particle

/**
 * 확인 화면에서 처음 보일 바뀐 부분. 앱의 가명 처리 서비스와 같은 순서(가명 사전·패턴으로 찾고, 설정의 분류·표기와 모드대로 바꾼다)로
 * 지금 사전·설정에서 계산한다. 처음 설치하면 가명 사전이 비어 있어(예시 사전은 '가명 사전 열기'를 할 때 만든다) 회사 이름은 바뀌지 않고
 * IP가 처음 바뀐다: 화면은 실제로 일어날 일만 약속한다. 대응표는 새 표로 센다(앱이 이미 다른 이름을 바꿨으면 번호가 다를 수 있어
 * 화면은 "예:"로 보인다). 끔이거나 바뀌는 것이 없으면 null
 */
export function tryExpectation(o: {
  terms: MaskTerm[]
  masking: Settings['masking']
}): TrySwap | null {
  const mode = o.masking.mode
  if (mode === 'off') return null
  const text = TRY_MEMO.normalize('NFC')
  const found = [
    ...findTerms(text, o.terms),
    ...findAllPatterns(text, { internalDomains: o.masking.internalDomains })
  ]
  const table = new MappingTable({ now: () => 0, ttlMs: 1 })
  const r = maskText(
    text,
    found,
    {
      mode,
      categories: o.masking.categories,
      disabledKeys: [],
      removeLabels: o.masking.removeLabels
    },
    table
  )
  const first = r.applied[0]
  return first ? { from: first.original, to: first.replacement } : null
}

/** 확인 화면에서 Enter를 누르면 열릴 AI(회의록 정리 템플릿은 AI를 따로 정하지 않아 기본 AI). opens: 주소가 있어 창이 열린다 */
export function tryTarget(o: { defaultTarget: string; targets: AiTarget[] }): {
  name: string
  opens: boolean
} {
  const t = pickAiTarget({ defaultId: o.defaultTarget, targets: o.targets })
  return { name: t.name, opens: Boolean(t.url) }
}

/** 해낸 뒤 클립보드에 무엇이 있는지 한 문장 */
export function tryDoneText(o: { mode: MaskingMode; swap: TrySwap | null }): string {
  if (o.mode === 'off') return '가명 처리가 꺼져 있어 원문 그대로 복사했어요.'
  return o.swap
    ? '임시 이름으로 바꾼 프롬프트가 클립보드에 있어요.'
    : '바꿀 이름이 없어 원문 그대로 복사했어요.'
}

/**
 * 해낸 뒤 할 일: AI 창에 붙여넣기, 그리고 바꾸고 되돌리기면 AI가 쓴 글을 복사한 뒤 팔레트의 가명 되돌리기(명령의 실제 제목)로
 * 바뀐 이름이 원래대로 돌아온다는 것(바뀐 것의 실제 예). 바꾸기만이면 되돌리지 않는다고 알리고, 바뀐 것이 없으면 붙여넣기만
 */
export function tryNextSteps(o: {
  mode: MaskingMode
  target: { name: string; opens: boolean }
  swap: TrySwap | null
}): string[] {
  const paste = o.target.opens
    ? `${o.target.name} 창에 Ctrl+V로 붙여넣어요.`
    : '붙여넣을 곳에서 Ctrl+V를 눌러요.'
  if (!o.swap || o.mode === 'off') return [paste]
  if (o.mode === 'remove')
    return [paste, '‘바꾸기만’이라 AI가 쓴 글에도 바꾼 이름이 그대로 남아요.']
  const { from, to } = o.swap
  return [
    paste,
    `AI가 쓴 글을 복사한 뒤 팔레트에서 ‘${UNMASK_COMMAND_TITLE}’${josa(UNMASK_COMMAND_TITLE, '를')} 실행하면 ${to}${josa(to, '이')} ${from}${josa(from, '로')} 돌아와요.`
  ]
}
