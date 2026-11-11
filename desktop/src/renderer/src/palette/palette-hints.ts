// 팔레트 목록의 말하듯 입력 안내(설계 §6 빈 화면, §13 8단계 문장 기억하기)
import type { PaletteSearch } from './filter-items'

/**
 * 고른 행 오른쪽에 "Shift+Enter 기억하고 실행"을 보일지(설계 §13 8단계 "맨 위가 아닌 후보를 고르면 기억하기를 제안한다").
 * 말하듯 입력으로 해석했고 학습 키가 있으며, 고른 행이 맨 위가 아닌 검색 결과 항목일 때만이다.
 * 목록 끝에 붙인 줄('직접 추가하기'·'이름으로 저장')은 검색 결과가 아니라 기억하지 않는다.
 */
export function rememberHint(s: PaletteSearch, selected: string): boolean {
  if (!s.natural || s.key === null || !selected) return false
  if (s.top?.id === selected) return false
  return s.items.some((item) => item.id === selected)
}

/** 빈 화면의 사용 팁 한 줄(설계 §6). 머리글에 없는 접두어(@)와 말하듯 입력을 먼저 알린다 */
export const PALETTE_TIPS: string[] = ['말하듯 입력해도 돼요: ‘회의록 정리해줘’', '@로 시작하면 저장한 창 배치만 찾아요', '?로 시작하면 용어 뜻만 찾아요']

/** 팔레트를 보인 횟수(0부터)마다 팁을 차례로 바꾼다 */
export function tipFor(shownCount: number): string {
  const n = PALETTE_TIPS.length
  return PALETTE_TIPS[((Math.trunc(shownCount) % n) + n) % n]
}
