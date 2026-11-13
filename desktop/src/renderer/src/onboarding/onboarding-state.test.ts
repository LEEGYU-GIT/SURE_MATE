import { describe, expect, it } from 'vitest'
import {
  canContinue,
  canStart,
  hotkeyPickerForced,
  initialOnboarding,
  ONBOARDING_FLOW,
  onboardingReducer,
  stepNumber,
  workspaceDone,
  type OnboardingAction,
  type OnboardingState,
  type OnboardingStepId
} from './onboarding-state'

/** 그 화면으로 바로 간 상태(미리 보기 장면과 같은 방법) */
const at = (step: OnboardingStepId, patch: Partial<OnboardingState> = {}): OnboardingState => ({
  ...initialOnboarding(),
  step,
  ...patch
})
const run = (s: OnboardingState, ...actions: OnboardingAction[]): OnboardingState =>
  actions.reduce(onboardingReducer, s)
const WS = { id: 'ws-1', name: '업무 배치', windows: 4 }

describe('첫 실행 안내 세 화면(2026-11-12 사용자 확인): 소개 → 워크스페이스 체험 → 준비 완료', () => {
  it('세 화면이고 소개에서 시작한다. 머리의 "n / 3"은 순서에서 센다', () => {
    expect(ONBOARDING_FLOW).toEqual(['intro', 'workspace', 'ready'])
    const s = initialOnboarding()
    expect(s).toEqual({ step: 'intro', hotkey: null, workspace: null, restored: false })
    expect(stepNumber(s)).toEqual({ n: 1, total: 3 })
    expect(stepNumber(at('workspace'))).toEqual({ n: 2, total: 3 })
    expect(stepNumber(at('ready'))).toEqual({ n: 3, total: 3 })
  })

  it('다음·뒤로는 한 칸씩 움직이고, 첫 화면에서 뒤로·마지막 화면에서 다음은 움직이지 않는다', () => {
    let s = run(initialOnboarding({ hotkey: 'Alt+`' }), { type: 'back' })
    expect(s.step).toBe('intro')
    s = run(s, { type: 'next' }, { type: 'next' })
    expect(s.step).toBe('ready')
    expect(run(s, { type: 'next' }).step).toBe('ready')
    expect(run(s, { type: 'back' }).step).toBe('workspace')
  })

  it('소개와 워크스페이스 체험은 언제나 다음으로 간다(체험은 나중에 해도 된다)', () => {
    expect(canContinue(at('intro'))).toBe(true)
    expect(canContinue(at('workspace'))).toBe(true)
    expect(run(at('workspace'), { type: 'next' }).step).toBe('ready')
  })

  it('뒤로 갔다 와도 팔레트 단축키와 저장한 워크스페이스·불러오기 결과는 남는다', () => {
    const s = run(
      initialOnboarding({ hotkey: 'Ctrl+Alt+Space' }),
      { type: 'next' },
      { type: 'workspace-saved', workspace: WS },
      { type: 'progress', progress: { kind: 'workspace', id: 'ws-1' } },
      { type: 'next' },
      { type: 'back' },
      { type: 'back' },
      { type: 'next' }
    )
    expect(s).toEqual({
      step: 'workspace',
      hotkey: 'Ctrl+Alt+Space',
      workspace: WS,
      restored: true
    })
  })
})

describe('준비 완료: 등록된 팔레트 단축키가 있어야 시작할 수 있다(없으면 팔레트를 열 수 없다)', () => {
  it('시작할 때 이미 등록된 팔레트 단축키를 받으면 그대로 시작할 수 있고 단축키 고르기를 펼쳐 두지 않는다', () => {
    const s = at('ready', { hotkey: 'Ctrl+Alt+Space' })
    expect(canStart(s)).toBe(true)
    expect(canContinue(s)).toBe(true)
    expect(hotkeyPickerForced(s)).toBe(false)
  })

  it('등록된 단축키가 없으면 시작할 수 없고 단축키 고르기를 펼쳐 둔다. 고른 조합이 등록되면 시작할 수 있다', () => {
    const s = at('ready')
    expect(canStart(s)).toBe(false)
    expect(canContinue(s)).toBe(false)
    expect(hotkeyPickerForced(s)).toBe(true)
    const picked = run(s, { type: 'hotkey', acc: 'Alt+`' })
    expect(canStart(picked)).toBe(true)
    expect(hotkeyPickerForced(picked)).toBe(false)
  })

  it('등록이 풀렸다는 알림(설정 바뀜, acc null)을 받으면 다시 시작할 수 없다', () => {
    const s = run(at('ready', { hotkey: 'Alt+`' }), { type: 'hotkey', acc: null })
    expect(s.hotkey).toBeNull()
    expect(canStart(s)).toBe(false)
  })

  it('시작은 준비 완료 화면에서만(단축키가 있어도 소개·체험 화면에서는 시작하지 않는다)', () => {
    expect(canStart(at('intro', { hotkey: 'Alt+`' }))).toBe(false)
    expect(canStart(at('workspace', { hotkey: 'Alt+`' }))).toBe(false)
  })
})

describe('워크스페이스 체험(main의 ① 그대로): 저장 → 흐트러뜨리기 → 불러오기', () => {
  it('저장한 워크스페이스를 불러오면(어디서든 같은 id) 해냄, 다른 워크스페이스나 다시 저장하면 아직이다', () => {
    let s = run(at('workspace'), { type: 'workspace-saved', workspace: WS })
    expect(workspaceDone(s)).toBe(false)
    s = onboardingReducer(s, { type: 'progress', progress: { kind: 'workspace', id: 'other' } })
    expect(workspaceDone(s)).toBe(false)
    s = onboardingReducer(s, { type: 'progress', progress: { kind: 'workspace', id: 'ws-1' } })
    expect(workspaceDone(s)).toBe(true)
    // 다시 저장하면 새 배치를 불러와 봐야 한다
    expect(
      onboardingReducer(s, { type: 'workspace-saved', workspace: { ...WS, windows: 5 } })
    ).toMatchObject({ restored: false, workspace: { windows: 5 } })
  })

  it('저장 전에 온 불러오기 알림, 다른 화면에서 온 알림, 프롬프트 실행 알림은 무시한다', () => {
    expect(
      onboardingReducer(at('workspace'), {
        type: 'progress',
        progress: { kind: 'workspace', id: 'ws-1' }
      }).restored
    ).toBe(false)
    const ready = at('ready', { workspace: WS })
    expect(
      onboardingReducer(ready, { type: 'progress', progress: { kind: 'workspace', id: 'ws-1' } })
        .restored
    ).toBe(false)
    const saved = at('workspace', { workspace: WS })
    expect(onboardingReducer(saved, { type: 'progress', progress: { kind: 'prompt' } })).toEqual(
      saved
    )
  })
})
