import { expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/settings/settings'
import { shouldShowOnboarding } from './first-run'

it('처음 안내를 끝내지 않았으면 띄운다(로그인 자동 실행 --hidden이어도 첫 실행이면 띄움), 끝냈으면 띄우지 않는다', () => {
  expect(shouldShowOnboarding({ ...DEFAULT_SETTINGS, onboardingDone: false })).toBe(true)
  expect(shouldShowOnboarding({ ...DEFAULT_SETTINGS, onboardingDone: true })).toBe(false)
})
