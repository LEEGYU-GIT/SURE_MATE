import type { MaskingMode } from '../../../shared/types'

/** 첫 실행 안내(설계 문서 §6): 1 단축키 → 2 주로 쓰는 AI·가명 처리·자동 실행 → 3 따라 해 보기 */
export interface OnboardingState {
  step: 1 | 2 | 3
  /** 등록에 성공한 팔레트 단축키(없으면 null) */
  hotkey: string | null
  aiTarget: string
  maskingMode: MaskingMode
  launchAtLogin: boolean
  /** 따라 해 보기에서 회의록 정리 프롬프트가 실행됐다 */
  tried: boolean
}

export type OnboardingAction =
  | { type: 'hotkey'; acc: string }
  | { type: 'choose'; aiTarget?: string; maskingMode?: MaskingMode; launchAtLogin?: boolean }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'prompt-ran' }

export function initialOnboarding(d: { aiTarget: string; maskingMode: MaskingMode; launchAtLogin: boolean }): OnboardingState {
  return { step: 1, hotkey: null, tried: false, ...d }
}

/** 다음으로 갈 수 있는지: 1단계는 단축키 등록 뒤, 2단계는 언제나, 3단계는 끝내기(해 보기 전에도 건너뛸 수 있음) */
export const canContinue = (s: OnboardingState): boolean => (s.step === 1 ? s.hotkey !== null : true)

export function onboardingReducer(s: OnboardingState, a: OnboardingAction): OnboardingState {
  switch (a.type) {
    case 'hotkey':
      return { ...s, hotkey: a.acc }
    case 'choose':
      return {
        ...s,
        ...(a.aiTarget !== undefined ? { aiTarget: a.aiTarget } : {}),
        ...(a.maskingMode !== undefined ? { maskingMode: a.maskingMode } : {}),
        ...(a.launchAtLogin !== undefined ? { launchAtLogin: a.launchAtLogin } : {})
      }
    case 'next':
      if (s.step === 3 || !canContinue(s)) return s
      return { ...s, step: (s.step + 1) as 2 | 3 }
    case 'back':
      return s.step === 1 ? s : { ...s, step: (s.step - 1) as 1 | 2 }
    case 'prompt-ran':
      return s.step === 3 ? { ...s, tried: true } : s
  }
}
