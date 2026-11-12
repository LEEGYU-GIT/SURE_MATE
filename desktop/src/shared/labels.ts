import type { BarShape } from './bar/bar-settings'
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

/**
 * 가명 처리 모드 이름(트레이·바 메뉴·확인 화면·설정이 같이 쓴다). 무엇을 하는지 쉬운 말로(2026-11-12 사용자 의견:
 * '가명 후 되돌리기'·'결과에서 빼기'는 무슨 뜻인지 몰랐다)
 */
const MASKING_LABELS: Record<MaskingMode, string> = {
  off: '끔',
  restore: '바꾸고 되돌리기',
  remove: '바꾸기만'
}

export const maskingModeLabel = (mode: MaskingMode): string => MASKING_LABELS[mode]

const BAR_SHAPE_LABELS: Record<BarShape, string> = {
  edge: '가장자리 띠',
  capsule: '떠 있는 캡슐',
  off: '끔'
}

/** 바 모양 이름(바 메뉴·트레이·팔레트 명령·알림이 같이 쓴다) */
export const barShapeLabel = (shape: BarShape): string => BAR_SHAPE_LABELS[shape]

/**
 * 바 이름표의 "이름 · 보조 글" 구분(예: "팔레트 열기 · Ctrl+Alt+Space").
 * 펼침 창 이름표는 맨 뒤 구분 다음을 흐린 보조 글로 그린다(단축키면 키 모양).
 */
export const LABEL_HINT_SEPARATOR = ' · '

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
