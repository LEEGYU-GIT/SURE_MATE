import type { Settings } from '../../shared/settings/settings'

/**
 * 첫 실행 안내를 띄울지(설계 문서 §6). 끝내지 않았으면 다음 실행에도 띄운다(창을 닫거나 앱을 끝낸 경우, Review Focus 5).
 * 로그인 자동 실행(--hidden)이어도 안내를 끝내지 않았으면 띄운다 — 자동 실행은 온보딩에서 고르는 값이라 그 전에는 켜질 일이 드물다.
 */
export const shouldShowOnboarding = (s: Settings): boolean => !s.onboardingDone
