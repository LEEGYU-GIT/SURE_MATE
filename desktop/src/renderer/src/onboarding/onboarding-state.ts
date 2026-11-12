import type { OnboardingProgress } from '../../../shared/ipc-channels'
import type { MaskingMode } from '../../../shared/types'

/**
 * 첫 실행 안내(설계 문서 §6, 2026-11-12 개편): 1 워크스페이스 따라 해 보기 → 2 팔레트 단축키 → 3 AI·가명 처리 →
 * 4 프롬프트 따라 해 보기 → 5 말랑 메이트 소개. 핵심 기능인 창 배치를 가장 먼저 해 보고, 펫은 마지막에 소개한다(사용자 의견).
 * 따라 해 보기 두 단계는 해 본 뒤에 '다음', 해 보지 않았으면 '건너뛰기'로 넘어간다.
 */
export const ONBOARDING_STEPS = 5
export type OnboardingStep = 1 | 2 | 3 | 4 | 5

export const STEP = { workspace: 1, hotkey: 2, choices: 3, prompt: 4, pet: 5 } as const satisfies Record<string, OnboardingStep>

/** 워크스페이스 따라 해 보기에서 저장한 워크스페이스 */
export interface TryWorkspace {
  id: string
  name: string
  windows: number
}

export interface OnboardingState {
  step: OnboardingStep
  /** 등록에 성공한 팔레트 단축키(없으면 null) */
  hotkey: string | null
  aiTarget: string
  maskingMode: MaskingMode
  launchAtLogin: boolean
  /** 따라 해 보기에서 저장한 워크스페이스(다시 저장하면 바뀐다) */
  workspace: TryWorkspace | null
  /** 저장한 워크스페이스를 불러왔다(팔레트·단축키·바·안내 창 어디서든) */
  restored: boolean
  /** 따라 해 보기에서 회의록 정리 프롬프트를 실행했다 */
  tried: boolean
}

export type OnboardingAction =
  | { type: 'hotkey'; acc: string }
  | { type: 'choose'; aiTarget?: string; maskingMode?: MaskingMode; launchAtLogin?: boolean }
  | { type: 'next' }
  | { type: 'skip' }
  | { type: 'back' }
  | { type: 'workspace-saved'; workspace: TryWorkspace }
  | { type: 'progress'; progress: OnboardingProgress }

export function initialOnboarding(d: { aiTarget: string; maskingMode: MaskingMode; launchAtLogin: boolean }): OnboardingState {
  return { step: STEP.workspace, hotkey: null, workspace: null, restored: false, tried: false, ...d }
}

/** '다음'으로 갈 수 있는지: 단축키는 등록한 뒤, 따라 해 보기는 해 본 뒤. 마지막 단계는 '시작하기'(화면이 main에 알림) */
export function canContinue(s: OnboardingState): boolean {
  if (s.step === STEP.hotkey) return s.hotkey !== null
  if (s.step === STEP.workspace) return s.restored
  if (s.step === STEP.prompt) return s.tried
  return s.step !== ONBOARDING_STEPS
}

/** '건너뛰기'를 보일지: 따라 해 보기를 아직 해 보지 않았을 때만 */
export const canSkip = (s: OnboardingState): boolean => (s.step === STEP.workspace && !s.restored) || (s.step === STEP.prompt && !s.tried)

const forward = (s: OnboardingState): OnboardingState => (s.step === ONBOARDING_STEPS ? s : { ...s, step: (s.step + 1) as OnboardingStep })

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
      return canContinue(s) ? forward(s) : s
    case 'skip':
      return canSkip(s) ? forward(s) : s
    case 'back':
      return s.step === 1 ? s : { ...s, step: (s.step - 1) as OnboardingStep }
    case 'workspace-saved':
      // 다시 저장하면 새 배치를 불러와 봐야 한다
      return { ...s, workspace: a.workspace, restored: false }
    case 'progress':
      // 그 단계에서 일어난 일만 받는다(다른 단계에서 프롬프트를 실행하거나 다른 워크스페이스를 불러온 것은 무시)
      if (a.progress.kind === 'prompt') return s.step === STEP.prompt ? { ...s, tried: true } : s
      return s.step === STEP.workspace && s.workspace?.id === a.progress.id ? { ...s, restored: true } : s
  }
}
