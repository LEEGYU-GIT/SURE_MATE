import type { OnboardingProgress } from '../../../shared/ipc-channels'

/**
 * 첫 실행 안내(설계 문서 §6, 2026-11-12 사용자 확인으로 세 화면): 소개 → 워크스페이스 체험 → 준비 완료.
 * 설치하고 1분 안에 "자주 쓰겠는데?"에 닿게 한다. 기본값이 좋은 설정(AI·가명 처리·자동 실행)은 미리 묻지 않고 준비 완료 화면에
 * 한 줄씩 요약해 그 자리에서 바꾼다(바꾸면 바로 저장하므로 이 상태에 두지 않는다: 설정 스냅숏이 원본).
 * 30초 따라 해 보기는 따로 여는 화면(#/try)이고, 가명 처리 설명은 확인 화면의 처음 한 번 안내로 옮겼다.
 */
export const ONBOARDING_FLOW = ['intro', 'workspace', 'ready'] as const
export type OnboardingStepId = (typeof ONBOARDING_FLOW)[number]

/** 워크스페이스 체험에서 저장한 워크스페이스 */
export interface TryWorkspace {
  id: string
  name: string
  windows: number
}

export interface OnboardingState {
  step: OnboardingStepId
  /** 등록에 성공한 팔레트 단축키(없으면 null). 없으면 시작할 수 없다 */
  hotkey: string | null
  /** 체험에서 저장한 워크스페이스(다시 저장하면 바뀐다) */
  workspace: TryWorkspace | null
  /** 저장한 워크스페이스를 불러왔다(팔레트·단축키·바·안내 창 어디서든) */
  restored: boolean
}

export type OnboardingAction =
  /** 팔레트 단축키가 등록됐다(acc null: 등록이 풀렸다는 설정 알림) */
  | { type: 'hotkey'; acc: string | null }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'workspace-saved'; workspace: TryWorkspace }
  | { type: 'progress'; progress: OnboardingProgress }

/** hotkey: 시작할 때 이미 등록돼 있는 팔레트 단축키(설정 스냅숏) */
export function initialOnboarding(o: { hotkey?: string | null } = {}): OnboardingState {
  return { step: ONBOARDING_FLOW[0], hotkey: o.hotkey ?? null, workspace: null, restored: false }
}

/** 머리에 보일 "n / 전체"(1부터) */
export function stepNumber(s: Pick<OnboardingState, 'step'>): { n: number; total: number } {
  return { n: ONBOARDING_FLOW.indexOf(s.step) + 1, total: ONBOARDING_FLOW.length }
}

/** 시작하기를 누를 수 있는지: 준비 완료 화면에서, 등록된 팔레트 단축키가 있을 때(없으면 팔레트를 열 수 없어 앱을 쓸 수 없다) */
export const canStart = (s: OnboardingState): boolean => s.step === 'ready' && s.hotkey !== null

/** 아래 단추 줄의 주 단추를 누를 수 있는지. 소개·체험은 언제나(체험은 나중에 해도 된다), 준비 완료는 시작할 수 있을 때 */
export const canContinue = (s: OnboardingState): boolean =>
  s.step === 'ready' ? canStart(s) : true

/** 준비 완료에서 팔레트 단축키 고르기를 펼쳐 둘지(접을 수 없게): 등록된 팔레트 단축키가 없을 때 */
export const hotkeyPickerForced = (s: Pick<OnboardingState, 'hotkey'>): boolean => s.hotkey === null

/** 체험을 해냈는지(아래 단추가 '나중에 하기' 대신 '다음') */
export const workspaceDone = (s: Pick<OnboardingState, 'restored'>): boolean => s.restored

/** 순서에서 한 칸 옮긴 단계. 순서 밖이면 그대로 */
function moved(s: OnboardingState, by: 1 | -1): OnboardingStepId {
  const i = ONBOARDING_FLOW.indexOf(s.step) + by
  return i >= 0 && i < ONBOARDING_FLOW.length ? ONBOARDING_FLOW[i] : s.step
}

export function onboardingReducer(s: OnboardingState, a: OnboardingAction): OnboardingState {
  switch (a.type) {
    case 'hotkey':
      return { ...s, hotkey: a.acc }
    case 'next':
      return canContinue(s) ? { ...s, step: moved(s, 1) } : s
    case 'back':
      return { ...s, step: moved(s, -1) }
    case 'workspace-saved':
      // 다시 저장하면 새 배치를 불러와 봐야 한다
      return { ...s, workspace: a.workspace, restored: false }
    case 'progress':
      // 체험 화면에서 저장한 그 워크스페이스를 불러온 것만 받는다(프롬프트 실행은 따로 여는 따라 해 보기 화면의 일)
      if (a.progress.kind !== 'workspace') return s
      return s.step === 'workspace' && s.workspace?.id === a.progress.id
        ? { ...s, restored: true }
        : s
  }
}
