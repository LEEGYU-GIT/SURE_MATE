import type { MaskCategory } from './masking/types'
import type { CaptureSkipReason, MaskingMode } from './types'

/**
 * 앱에서 일어난 일(설계 문서 §14-2 "앱과 연결"). 말랑 메이트가 받아 반응한다.
 * 글·이름은 담지 않는다: 가린 것은 분류별 건수, AI는 이름만(말풍선에 그대로 보여 줄 값).
 * 가명 처리 모드 변경은 앱 일이 아니다(설정 반영으로 선글라스가 바뀐다).
 */
export type AppEvent =
  /** 프롬프트를 클립보드에 쓴 직후(AI 창을 열기 전). masked는 켠 항목의 분류별 건수 합(0건 제외, ALL_CATEGORIES 순서), target은 열 AI 이름(복사만이면 null) */
  | {
      type: 'prompt-copied'
      masking: MaskingMode
      masked: { category: MaskCategory; count: number }[]
      target: string | null
    }
  /** 가명 되돌리기가 되돌린 글을 클립보드에 쓴 뒤(되돌린 것이 있을 때만) */
  | { type: 'unmasked'; restored: number }
  /** 선택한 글을 가져오지 못함(다른 가져오기가 진행 중인 busy는 제외) */
  | { type: 'capture-failed'; reason: CaptureSkipReason | 'nothing-selected' }

/** 앱 일을 내보내고 받는 통로 */
export interface AppEvents {
  emit(e: AppEvent): void
  /** 받는 쪽을 등록하고 해제 함수를 돌려준다 */
  on(cb: (e: AppEvent) => void): () => void
}
