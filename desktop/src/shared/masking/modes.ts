import type { MaskingMode } from '../types'

/** 가명 처리 모드를 도는 순서(끔 → 되돌리기 → 빼기). 확인 화면 Alt+M과 기본값 바꾸기 명령이 같이 쓴다 */
export const MASKING_MODES: readonly MaskingMode[] = ['off', 'restore', 'remove']

export const nextMaskingMode = (mode: MaskingMode): MaskingMode => MASKING_MODES[(MASKING_MODES.indexOf(mode) + 1) % MASKING_MODES.length]
