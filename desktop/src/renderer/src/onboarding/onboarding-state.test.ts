import { expect, it } from 'vitest'
import { canContinue, canSkip, initialOnboarding, ONBOARDING_STEPS, onboardingReducer, STEP, type OnboardingAction, type OnboardingState } from './onboarding-state'

const start = (): OnboardingState => initialOnboarding({ aiTarget: 'claude', maskingMode: 'restore', launchAtLogin: true })
const run = (s: OnboardingState, ...actions: OnboardingAction[]): OnboardingState => actions.reduce(onboardingReducer, s)
const WS = { id: 'ws-1', name: '업무 배치', windows: 4 }

it('워크스페이스 따라 해 보기가 첫 단계이고, 불러오기 전에는 다음이 아니라 건너뛰기만 된다', () => {
  const s = start()
  expect(s.step).toBe(STEP.workspace)
  expect(canContinue(s)).toBe(false)
  expect(canSkip(s)).toBe(true)
  expect(onboardingReducer(s, { type: 'next' }).step).toBe(STEP.workspace)
  expect(onboardingReducer(s, { type: 'skip' }).step).toBe(STEP.hotkey)
})

it('저장한 워크스페이스를 불러오면(어디서든 같은 id) 해냄, 다른 워크스페이스나 다시 저장하면 아직이다', () => {
  let s = run(start(), { type: 'workspace-saved', workspace: WS })
  expect(s.restored).toBe(false)
  s = onboardingReducer(s, { type: 'progress', progress: { kind: 'workspace', id: 'other' } })
  expect(s.restored).toBe(false)
  s = onboardingReducer(s, { type: 'progress', progress: { kind: 'workspace', id: 'ws-1' } })
  expect(s.restored).toBe(true)
  expect(canContinue(s)).toBe(true)
  expect(canSkip(s)).toBe(false)
  // 다시 저장하면 새 배치를 불러와 봐야 한다
  expect(onboardingReducer(s, { type: 'workspace-saved', workspace: { ...WS, windows: 5 } })).toMatchObject({ restored: false, workspace: { windows: 5 } })
  expect(onboardingReducer(s, { type: 'next' }).step).toBe(STEP.hotkey)
})

it('저장 전에 온 불러오기 알림, 다른 단계에서 온 불러오기 알림은 무시한다', () => {
  expect(onboardingReducer(start(), { type: 'progress', progress: { kind: 'workspace', id: 'ws-1' } }).restored).toBe(false)
  const later = run(start(), { type: 'workspace-saved', workspace: WS }, { type: 'skip' })
  expect(onboardingReducer(later, { type: 'progress', progress: { kind: 'workspace', id: 'ws-1' } }).restored).toBe(false)
})

it('단축키 단계는 등록한 단축키가 있어야 다음으로 간다', () => {
  let s = run(start(), { type: 'skip' })
  expect(s.step).toBe(STEP.hotkey)
  expect(canContinue(s)).toBe(false)
  expect(canSkip(s)).toBe(false)
  s = run(s, { type: 'hotkey', acc: 'Ctrl+Alt+Space' }, { type: 'next' })
  expect(s.step).toBe(STEP.choices)
})

it('AI·가명 처리 단계에서 고친 값은 뒤로 갔다 와도 남는다', () => {
  let s = run(start(), { type: 'skip' }, { type: 'hotkey', acc: 'Alt+`' }, { type: 'next' })
  expect(s).toMatchObject({ step: STEP.choices, aiTarget: 'claude', maskingMode: 'restore', launchAtLogin: true })
  s = run(s, { type: 'choose', aiTarget: 'copy', maskingMode: 'remove', launchAtLogin: false }, { type: 'back' }, { type: 'next' })
  expect(s).toMatchObject({ step: STEP.choices, aiTarget: 'copy', maskingMode: 'remove', launchAtLogin: false, hotkey: 'Alt+`' })
})

it('프롬프트 따라 해 보기는 실행되면 해냄, 그 단계에서만 받고 건너뛸 수 있다', () => {
  const at = run(start(), { type: 'skip' }, { type: 'hotkey', acc: 'Alt+`' }, { type: 'next' }, { type: 'next' })
  expect(at).toMatchObject({ step: STEP.prompt, tried: false })
  expect(canSkip(at)).toBe(true)
  expect(onboardingReducer(at, { type: 'progress', progress: { kind: 'prompt' } })).toMatchObject({ tried: true })
  expect(onboardingReducer(start(), { type: 'progress', progress: { kind: 'prompt' } }).tried).toBe(false)
  expect(onboardingReducer(at, { type: 'skip' }).step).toBe(STEP.pet)
})

it('마지막 단계(말랑 메이트)에서는 다음·건너뛰기가 없다(시작하기는 화면이 main에 알림)', () => {
  const last = run(start(), { type: 'skip' }, { type: 'hotkey', acc: 'Alt+`' }, { type: 'next' }, { type: 'next' }, { type: 'skip' })
  expect(last.step).toBe(ONBOARDING_STEPS)
  expect(canContinue(last)).toBe(false)
  expect(canSkip(last)).toBe(false)
  expect(onboardingReducer(last, { type: 'next' }).step).toBe(ONBOARDING_STEPS)
  expect(onboardingReducer(last, { type: 'back' }).step).toBe(STEP.prompt)
})
