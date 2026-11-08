import type { MaskCategory } from './masking/types'
import type { MaskingMode } from './types'

const MASKING_LABELS: Record<MaskingMode, string> = {
  off: '끔',
  restore: '가명 후 되돌리기',
  remove: '결과에서 빼기'
}

export const maskingModeLabel = (mode: MaskingMode): string => MASKING_LABELS[mode]

/** 가명 처리 분류 이름(확인 화면의 감지 요약 등) */
export const MASK_CATEGORY_LABELS: Record<MaskCategory, string> = {
  client: '고객사',
  project: '프로젝트',
  person: '담당자',
  system: '시스템',
  ip: 'IP',
  path: '경로',
  email: '이메일',
  phone: '전화번호',
  url: '사내 URL'
}

/**
 * 트레이 툴팁. 실제로 등록된 팔레트 단축키(다른 앱과 겹쳐 바꿨거나 하나도 못 잡은 경우 포함)와
 * 가명 처리 모드(설계 문서 §8: 트레이 툴팁에 항상 보인다)를 보여 준다.
 */
export const trayTooltip = (paletteHotkey: string | null, suspended: boolean, masking: MaskingMode): string =>
  `Sure-Mate · 팔레트 ${paletteHotkey ?? '단축키 없음'}${suspended ? ' (단축키 일시 중지)' : ''} · 가명 처리: ${maskingModeLabel(masking)}`
