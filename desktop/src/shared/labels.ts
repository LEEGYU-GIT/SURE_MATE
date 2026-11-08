import type { MaskCategory } from './masking/types'
import type { CaptureSkipReason, MaskingMode } from './types'

/** 선택한 글을 가져오지 못한 까닭(확인 화면 안내·명령 알림) */
export const CAPTURE_NOTES: Record<CaptureSkipReason | 'nothing-selected', string> = {
  terminal: '터미널에서는 가져오지 않아요',
  elevated: '관리자 권한 창이라 가져오지 못했어요',
  'no-foreground': '가져올 창이 없어요',
  'modifiers-held': '단축키를 누른 채라 가져오지 않았어요',
  busy: '다른 가져오기가 진행 중이었어요',
  'native-unavailable': '보안 프로그램이 막아 가져오지 못했어요',
  'keys-held': '키를 누르고 있어 가져오지 않았어요',
  'focus-changed': '가져오는 동안 다른 창으로 바뀌어 멈췄어요',
  'nothing-selected': '선택한 글이 없어요'
}

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
