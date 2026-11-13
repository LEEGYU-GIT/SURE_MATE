import { useEffect, useReducer, useState } from 'react'
import type { SettingsSnapshot } from '../../../shared/settings/settings-snapshot'
import { MonitorIcon } from '../design/icons'
import { IntroStep } from './IntroStep'
import {
  canStart,
  hotkeyPickerForced,
  initialOnboarding,
  onboardingReducer,
  stepNumber,
  workspaceDone,
  type OnboardingState
} from './onboarding-state'
import { BigButton, GuideFrame } from './parts'
import { ReadyStep } from './ReadyStep'
import { useSystemReducedMotion } from './use-reduced-motion'
import { WorkspaceStep } from './WorkspaceStep'

/** 등록된 팔레트 단축키(설정 스냅숏). 없으면 null */
const registeredPalette = (s: SettingsSnapshot): string | null =>
  s.hotkeys.palette.registered ? s.hotkeys.palette.acc : null

/**
 * #/onboarding 첫 실행 안내(설계 문서 §6, 2026-11-12 사용자 확인): 소개 → 워크스페이스 체험 → 준비 완료 세 화면.
 * 30초 따라 해 보기는 따로 여는 화면(#/try, 트레이 "따라 해 보기"·팔레트 명령)이고, 가명 처리 설명은 확인 화면의 처음 한 번 안내다.
 * start: 미리 보기 장면이 그 화면·상태로 바로 그릴 때만 쓴다
 */
export function Onboarding({
  start
}: { start?: Partial<OnboardingState> } = {}): React.JSX.Element {
  const api = window.sureMate.settings
  const [snap, setSnap] = useState<SettingsSnapshot | null>(null)
  const [state, dispatch] = useReducer(onboardingReducer, null, () => ({
    ...initialOnboarding(),
    ...start
  }))
  const [canControl, setCanControl] = useState(true)
  const systemReduced = useSystemReducedMotion()

  useEffect(() => {
    let live = true
    /** 등록된 팔레트 단축키를 그대로 받는다(앱이 시작할 때 잡은 기본 조합·대체 조합, 다른 곳에서 바꾼 조합) */
    const take = (s: SettingsSnapshot): void => {
      setSnap(s)
      dispatch({ type: 'hotkey', acc: registeredPalette(s) })
    }
    void api.get().then((s) => {
      if (s && live) take(s)
    })
    const offChanged = api.onChanged((s) => {
      if (live) take(s)
    })
    // 워크스페이스를 어디서 불러오든(팔레트·단축키·바·이 창) main이 알린다
    const offProgress = api.onOnboardingProgress((progress) => {
      if (live) dispatch({ type: 'progress', progress })
    })
    // 보안 프로그램이 Win32를 막았으면 체험 화면이 처음부터 알린다(저장·불러오기를 쓸 수 없다)
    void window.sureMate
      .listWorkspaces()
      .then((v) => {
        if (live) setCanControl(v.canControl)
      })
      .catch(() => {})
    return () => {
      live = false
      offChanged()
      offProgress()
    }
  }, [api])

  const { n, total } = stepNumber(state)
  const reduceMotion = systemReduced || Boolean(snap?.settings.pet.reduceMotion)
  const back = (
    <BigButton kind="secondary" onClick={() => dispatch({ type: 'back' })}>
      뒤로
    </BigButton>
  )

  let footer: React.ReactNode
  if (state.step === 'intro') {
    footer = (
      <>
        <MonitorIcon size={16} className="shrink-0 text-fg-3" />
        <span className="text-small text-fg-2">모든 내용은 이 PC에만 저장돼요</span>
        <span className="ml-auto" />
        <BigButton onClick={() => dispatch({ type: 'next' })}>1분 만에 써 보기</BigButton>
      </>
    )
  } else if (state.step === 'workspace') {
    // 불러오기를 해냈거나 해 볼 수 없으면(Win32 막힘) 다음, 아니면 나중에 하기(체험은 건너뛸 수 있다)
    const done = workspaceDone(state) || !canControl
    footer = (
      <>
        {back}
        <span className="ml-auto" />
        <BigButton kind={done ? 'primary' : 'secondary'} onClick={() => dispatch({ type: 'next' })}>
          {done ? '다음' : '나중에 하기'}
        </BigButton>
      </>
    )
  } else {
    const ready = canStart(state)
    footer = (
      <>
        {back}
        <span className="ml-auto" />
        {ready ? null : (
          <span id="ready-blocked" className="text-small text-fg-2">
            팔레트 단축키를 정하면 시작할 수 있어요
          </span>
        )}
        <BigButton
          disabled={!ready}
          describedBy={ready ? undefined : 'ready-blocked'}
          onClick={() => void api.finishOnboarding()}
        >
          시작하기
        </BigButton>
      </>
    )
  }

  return (
    <GuideFrame
      name="Sure-Mate 시작하기"
      progress={{ n, total }}
      screenKey={snap ? state.step : 'loading'}
      footer={footer}
    >
      {!snap ? (
        <p className="text-small text-fg-2">준비하는 중이에요…</p>
      ) : state.step === 'intro' ? (
        <IntroStep reduceMotion={reduceMotion} />
      ) : state.step === 'workspace' ? (
        <WorkspaceStep
          state={state}
          canControl={canControl}
          onSaved={(workspace) => dispatch({ type: 'workspace-saved', workspace })}
          onRestored={(id) => dispatch({ type: 'progress', progress: { kind: 'workspace', id } })}
        />
      ) : (
        <ReadyStep
          snap={snap}
          setSnap={setSnap}
          hotkey={state.hotkey}
          forced={hotkeyPickerForced(state)}
          onHotkey={(acc) => dispatch({ type: 'hotkey', acc })}
          reduceMotion={reduceMotion}
        />
      )}
    </GuideFrame>
  )
}
