import { expect, it } from 'vitest'
import { canContinue, initialOnboarding, onboardingReducer } from './onboarding-state'

it('1단계는 고른 단축키가 등록돼야 다음으로 간다', () => {
  let s = initialOnboarding({ aiTarget: 'claude', maskingMode: 'restore', launchAtLogin: true })
  expect(s.step).toBe(1)
  expect(canContinue(s)).toBe(false)
  s = onboardingReducer(s, { type: 'hotkey', acc: 'Ctrl+Alt+Space' })
  expect(canContinue(s)).toBe(true)
  s = onboardingReducer(s, { type: 'next' })
  expect(s.step).toBe(2)
})

it('2단계 기본값(제안 AI, 가명 후 되돌리기, 자동 실행 켬)을 고치고, 뒤로 가도 고른 값이 남는다', () => {
  let s = onboardingReducer(initialOnboarding({ aiTarget: 'claude', maskingMode: 'restore', launchAtLogin: true }), { type: 'hotkey', acc: 'Alt+`' })
  s = onboardingReducer(s, { type: 'next' })
  expect(s).toMatchObject({ aiTarget: 'claude', maskingMode: 'restore', launchAtLogin: true })
  s = onboardingReducer(s, { type: 'choose', aiTarget: 'copy', maskingMode: 'remove', launchAtLogin: false })
  s = onboardingReducer(s, { type: 'back' })
  expect(s.step).toBe(1)
  s = onboardingReducer(s, { type: 'next' })
  expect(s).toMatchObject({ step: 2, aiTarget: 'copy', maskingMode: 'remove', launchAtLogin: false, hotkey: 'Alt+`' })
})

it('3단계는 따라 해 보기가 실행되면 해냄으로, 건너뛰기로도 끝낼 수 있다', () => {
  let s = onboardingReducer(initialOnboarding({ aiTarget: 'claude', maskingMode: 'restore', launchAtLogin: true }), { type: 'hotkey', acc: 'Alt+`' })
  s = onboardingReducer(onboardingReducer(s, { type: 'next' }), { type: 'next' })
  expect(s).toMatchObject({ step: 3, tried: false })
  expect(onboardingReducer(s, { type: 'prompt-ran' })).toMatchObject({ step: 3, tried: true })
  expect(canContinue(s)).toBe(true)
  // 1·2단계에서는 따라 해 보기 알림을 무시한다
  const first = initialOnboarding({ aiTarget: 'claude', maskingMode: 'restore', launchAtLogin: true })
  expect(onboardingReducer(first, { type: 'prompt-ran' }).tried).toBe(false)
  // 3단계에서 다음은 없다(끝내기는 화면이 main에 알림)
  expect(onboardingReducer(s, { type: 'next' }).step).toBe(3)
})
