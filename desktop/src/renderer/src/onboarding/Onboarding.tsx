import { useEffect, useReducer, useRef, useState } from 'react'
import { maskingModeLabel } from '../../../shared/labels'
import { SETTING_MASKING_MODES } from '../../../shared/settings/settings'
import type { HotkeyCandidate, SettingsSnapshot } from '../../../shared/settings/settings-snapshot'
import type { MaskingMode } from '../../../shared/types'
import { MASKING_DETAILS } from '../flyout/menu-model'
import { Button, RadioList, Toggle } from '../settings/controls'
import { HotkeyRecorder } from '../settings/HotkeyRecorder'
import { canContinue, initialOnboarding, onboardingReducer, type OnboardingState } from './onboarding-state'

/** 따라 해 보기에 쓰는 가상 회의 메모(가상 이름만) */
export const SAMPLE_MEMO = `가상자동차 주간 회의 (11/10)
- 참석: 김가상, 이예시
- 브레이크 제어기 시험 일정은 다음 주 금요일까지 확정
- XY방산 납품 문서 검토는 목요일에 공유
- 시험 결과는 10.0.3.15 서버의 C:\\가상자동차\\시험결과 폴더에 올림
- 할 일: 정적분석 결과 정리(김가상), 시험 장비 예약(이예시)`

/** #/onboarding 첫 실행 안내(설계 문서 §6): ① 단축키 ② 주로 쓰는 AI·가명 처리·자동 실행 ③ 30초 따라 해 보기 */
export function Onboarding({ start }: { start?: Partial<OnboardingState> } = {}): React.JSX.Element {
  const api = window.sureMate.settings
  const [snap, setSnap] = useState<SettingsSnapshot | null>(null)
  // start: 미리 보기 장면이 2·3단계를 바로 그릴 때만 쓴다
  const [state, dispatch] = useReducer(onboardingReducer, null, () => ({ ...initialOnboarding({ aiTarget: 'claude', maskingMode: 'restore', launchAtLogin: true }), ...start }))
  const ready = useRef(false)

  useEffect(() => {
    const off = api.onOnboardingProgress(() => dispatch({ type: 'prompt-ran' }))
    void api.get().then((s) => {
      if (!s || ready.current) return
      ready.current = true
      setSnap(s)
      dispatch({ type: 'choose', aiTarget: s.settings.ai.defaultTarget, maskingMode: s.settings.masking.mode, launchAtLogin: s.settings.launchAtLogin })
      // 시작할 때 이미 등록한 팔레트 단축키가 있으면 그대로 다음으로 갈 수 있다
      if (s.hotkeys.palette.registered && s.hotkeys.palette.acc) dispatch({ type: 'hotkey', acc: s.hotkeys.palette.acc })
    })
    return off
  }, [api])

  const next = async (): Promise<void> => {
    if (state.step === 2) {
      // 2단계에서 고른 값을 저장한다(실패하면 다음으로 가지 않음)
      const r = await api.update({ ai: { defaultTarget: state.aiTarget }, masking: { mode: state.maskingMode }, launchAtLogin: state.launchAtLogin })
      if (!r.ok) return
    }
    dispatch({ type: 'next' })
  }

  return (
    <div className="flex h-full flex-col bg-surface-solid font-ui text-fg select-none">
      <header className="flex h-10 shrink-0 items-center gap-2 pr-[140px] pl-5 [-webkit-app-region:drag]">
        <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
        <span className="text-small font-semibold text-fg-2">Sure-Mate 시작하기</span>
        <span className="ml-auto text-small text-fg-3" aria-label={`3단계 중 ${state.step}단계`}>
          {state.step} / 3
        </span>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-8 pt-3 pb-6">
        {!snap ? <p className="text-small text-fg-2">준비하는 중이에요…</p> : state.step === 1 ? <StepHotkey state={state} onPick={(acc) => dispatch({ type: 'hotkey', acc })} /> : null}
        {snap && state.step === 2 ? <StepChoices snap={snap} state={state} onChoose={(c) => dispatch({ type: 'choose', ...c })} /> : null}
        {snap && state.step === 3 ? <StepTry state={state} /> : null}
      </main>
      <footer className="flex shrink-0 items-center gap-2 border-t border-line px-6 py-3">
        {state.step > 1 ? <Button onClick={() => dispatch({ type: 'back' })}>뒤로</Button> : null}
        <span className="ml-auto" />
        {state.step === 3 ? (
          <>
            {!state.tried ? <Button onClick={() => void api.finishOnboarding()}>건너뛰고 시작하기</Button> : null}
            <Button kind="primary" disabled={!state.tried} onClick={() => void api.finishOnboarding()}>
              시작하기
            </Button>
          </>
        ) : (
          <Button kind="primary" disabled={!canContinue(state)} onClick={() => void next()}>
            다음
          </Button>
        )}
      </footer>
    </div>
  )
}

function StepTitle({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mb-5">
      <h1 className="text-title leading-8 font-semibold text-fg">{title}</h1>
      <p className="mt-1 text-body leading-6 text-balance break-keep text-fg-2">{children}</p>
    </div>
  )
}

function StepHotkey({ state, onPick }: { state: OnboardingState; onPick(acc: string): void }): React.JSX.Element {
  const api = window.sureMate.settings
  const [candidates, setCandidates] = useState<HotkeyCandidate[] | null>(null)
  const [recording, setRecording] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    void api.onboardingCandidates().then(setCandidates)
  }, [api])

  const pick = async (acc: string): Promise<void> => {
    setProblem(null)
    const r = await api.hotkeySet('palette', acc)
    if (r.ok) onPick(r.acc)
    else setProblem(`${acc}: ${r.reason}`)
  }

  return (
    <>
      <StepTitle title="팔레트를 여는 단축키를 고르세요">어느 창에서든 이 단축키를 누르면 팔레트가 떠요. 다른 앱이 쓰는 조합은 고를 수 없어요.</StepTitle>
      <div role="radiogroup" aria-label="팔레트 단축키" className="flex flex-col gap-2">
        {(candidates ?? []).map((c) => {
          const on = state.hotkey === c.acc
          return (
            <button
              key={c.acc}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!c.available}
              onClick={() => void pick(c.acc)}
              className={`flex items-center gap-3 rounded-window border px-4 py-3 text-left transition-colors duration-(--dur-hover) disabled:cursor-not-allowed disabled:opacity-50 ${
                on ? 'border-brand bg-row-selected' : 'border-line hover:bg-row-hover'
              }`}
            >
              <kbd className="rounded-control border border-line bg-surface-inset px-2 py-1 font-ui text-body text-fg">{c.acc}</kbd>
              <span className="text-small text-fg-2">{c.available ? '비어 있어요' : '다른 앱이 쓰고 있어요'}</span>
              {c.suggested ? <span className="ml-auto rounded-full bg-brand/15 px-2 py-0.5 text-caption font-semibold text-brand">추천</span> : null}
            </button>
          )
        })}
      </div>
      <div className="mt-4">
        {recording ? (
          <HotkeyRecorder
            id="palette"
            onDone={(r) => {
              setRecording(false)
              if (r) onPick(r.acc)
            }}
          />
        ) : (
          <Button onClick={() => setRecording(true)}>다른 조합 직접 고르기</Button>
        )}
      </div>
      {problem ? (
        <p role="alert" className="mt-3 text-small text-danger">
          {problem}
        </p>
      ) : null}
      {state.hotkey ? <p className="mt-4 text-small text-fg-2">지금 단축키: {state.hotkey}</p> : null}
    </>
  )
}

function StepChoices({
  snap,
  state,
  onChoose
}: {
  snap: SettingsSnapshot
  state: OnboardingState
  onChoose(c: { aiTarget?: string; maskingMode?: MaskingMode; launchAtLogin?: boolean }): void
}): React.JSX.Element {
  return (
    <>
      <StepTitle title="주로 쓰는 AI와 가명 처리">회사에서 쓰도록 허용된 AI를 고르세요. 고객사·IP·경로 같은 정보는 프롬프트를 만들 때 가명으로 바꿔요.</StepTitle>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-1">
          <h2 id="ob-ai" className="text-caption font-semibold text-fg-2">
            주로 쓰는 AI
          </h2>
          <RadioList labelId="ob-ai" value={state.aiTarget} options={snap.aiTargets.map((t) => ({ value: t.id, label: t.name }))} onChange={(aiTarget) => onChoose({ aiTarget })} />
        </section>
        <section className="flex flex-col gap-1">
          <h2 id="ob-mask" className="text-caption font-semibold text-fg-2">
            가명 처리 기본
          </h2>
          <RadioList<MaskingMode>
            labelId="ob-mask"
            value={state.maskingMode}
            options={SETTING_MASKING_MODES.map((m) => ({ value: m, label: maskingModeLabel(m), description: MASKING_DETAILS[m] }))}
            onChange={(maskingMode) => onChoose({ maskingMode })}
          />
        </section>
        <section className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div id="ob-login" className="text-body text-fg">
              로그인할 때 자동으로 실행
            </div>
            <div id="ob-login-desc" className="text-small text-fg-2">
              Windows에 로그인하면 트레이에서 기다려요
            </div>
          </div>
          <Toggle labelId="ob-login" descId="ob-login-desc" checked={state.launchAtLogin} onChange={(launchAtLogin) => onChoose({ launchAtLogin })} />
        </section>
      </div>
    </>
  )
}

function StepTry({ state }: { state: OnboardingState }): React.JSX.Element {
  const memo = useRef<HTMLPreElement>(null)
  // 메모를 미리 골라 둔다(팔레트가 이 창의 선택한 글을 가져간다)
  useEffect(() => {
    const el = memo.current
    if (!el) return
    const sel = window.getSelection()
    sel?.removeAllRanges()
    const range = document.createRange()
    range.selectNodeContents(el)
    sel?.addRange(range)
  }, [])
  const key = state.hotkey ?? '팔레트 단축키'
  return (
    <>
      <StepTitle title={state.tried ? '해냈어요!' : '30초 따라 해 보기'}>
        {state.tried
          ? '가명으로 바뀐 프롬프트가 클립보드에 들어갔어요. AI 창에 Ctrl+V로 붙여 넣으면 돼요. 이제 시작해 볼까요?'
          : '아래 메모가 선택돼 있어요. 그대로 따라 해 보세요.'}
      </StepTitle>
      {!state.tried ? (
        <ol className="mb-4 flex list-decimal flex-col gap-1 pl-5 text-body text-fg">
          <li>
            <kbd className="rounded-control border border-line bg-surface-inset px-1.5 font-ui text-small">{key}</kbd>를 눌러 팔레트를 열어요
          </li>
          <li>
            <span className="font-semibold">회의록</span>을 치고 Enter를 눌러요
          </li>
          <li>확인 화면에서 가명으로 바뀐 이름을 보고 Enter를 한 번 더 눌러요</li>
        </ol>
      ) : null}
      <pre
        ref={memo}
        aria-label="따라 해 보기 메모"
        className="rounded-window border border-line bg-surface-inset px-4 py-3 font-ui text-body leading-6 whitespace-pre-wrap text-fg select-text"
      >
        {SAMPLE_MEMO}
      </pre>
    </>
  )
}
