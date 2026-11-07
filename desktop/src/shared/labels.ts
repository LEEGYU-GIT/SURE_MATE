import type { MaskingMode } from './types'

const MASKING_LABELS: Record<MaskingMode, string> = {
  off: '끔',
  restore: '가명 후 되돌리기',
  remove: '결과에서 빼기'
}

export const maskingModeLabel = (mode: MaskingMode): string => MASKING_LABELS[mode]
