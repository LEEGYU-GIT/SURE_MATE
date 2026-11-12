import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { isImeComposing } from '../../../shared/ime'
import { maskingModeLabel } from '../../../shared/labels'
import { PET_RECALL_HINT } from '../../../shared/pet/pet-copy'
import type { PetLook } from '../../../shared/pet/pet-view'
import { SETTING_MASKING_MODES } from '../../../shared/settings/settings'
import type { HotkeyCandidate, SettingsSnapshot } from '../../../shared/settings/settings-snapshot'
import type { MaskingMode } from '../../../shared/types'
import { skippedParts } from '../../../shared/workspace/messages'
import { WORKSPACE_LIMITS } from '../../../shared/workspace/types'
import { CheckIcon, CopyIcon, EyeOffIcon, GamepadIcon, TriangleAlertIcon } from '../design/icons'
import { MASKING_EXPLAIN } from '../flyout/menu-model'
import { PetSprite } from '../pet/PetSprite'
import { Button, NoticeLine, RadioList, Segmented, Toggle, type Notice } from '../settings/controls'
import { HotkeyRecorder } from '../settings/HotkeyRecorder'
import { MaskingExample } from '../settings/MaskingExample'
import { canContinue, canSkip, initialOnboarding, ONBOARDING_STEPS, onboardingReducer, STEP, type OnboardingState, type TryWorkspace } from './onboarding-state'

/** 따라 해 보기에 쓰는 가상 회의 메모(가상 이름만) */
export const SAMPLE_MEMO = `가상자동차 주간 회의 (11/10)
- 참석: 김가상, 이예시
- 브레이크 제어기 시험 일정은 다음 주 금요일까지 확정
- XY방산 납품 문서 검토는 목요일에 공유
- 시험 결과는 10.0.3.15 서버의 C:\\가상자동차\\시험결과 폴더에 올림
- 할 일: 정적분석 결과 정리(김가상), 시험 장비 예약(이예시)`

/** 워크스페이스 따라 해 보기의 처음 이름(팔레트에서 `@업무 배치`로 찾는다) */
const TRY_WORKSPACE_NAME = '업무 배치'

/** 단계 이름(머리줄 진행 표시와 화면 읽기 프로그램) */
const STEP_NAMES: Record<number, string> = {
  [STEP.workspace]: '창 배치',
  [STEP.hotkey]: '단축키',
  [STEP.choices]: 'AI와 가명 처리',
  [STEP.prompt]: '프롬프트',
  [STEP.pet]: '말랑 메이트'
}

/**
 * #/onboarding 첫 실행 안내(설계 문서 §6, 2026-11-12 개편): ① 창 배치 따라 해 보기 ② 팔레트 단축키 ③ AI·가명 처리(예시와 함께)
 * ④ 프롬프트 따라 해 보기 ⑤ 말랑 메이트 소개. 따라 해 보기는 실제 기능을 그대로 쓰고(따로 만든 연습 화면이 아님), 건너뛸 수 있다.
 */
export function Onboarding({ start }: { start?: Partial<OnboardingState> } = {}): React.JSX.Element {
  const api = window.sureMate.settings
  const [snap, setSnap] = useState<SettingsSnapshot | null>(null)
  // start: 미리 보기 장면이 뒤 단계를 바로 그릴 때만 쓴다
  const [state, dispatch] = useReducer(onboardingReducer, null, () => ({ ...initialOnboarding({ aiTarget: 'claude', maskingMode: 'restore', launchAtLogin: true }), ...start }))
  const ready = useRef(false)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const off = api.onOnboardingProgress((progress) => dispatch({ type: 'progress', progress }))
    void api.get().then((s) => {
      if (!s || ready.current) return
      ready.current = true
      setSnap(s)
      dispatch({ type: 'choose', aiTarget: s.settings.ai.defaultTarget, maskingMode: s.settings.masking.mode, launchAtLogin: s.settings.launchAtLogin })
      // 시작할 때 이미 등록한 팔레트 단축키가 있으면 그대로 쓴다(따라 해 보기 안내에도 보인다)
      if (s.hotkeys.palette.registered && s.hotkeys.palette.acc) dispatch({ type: 'hotkey', acc: s.hotkeys.palette.acc })
    })
    return off
  }, [api])

  // 단계가 바뀌면 내용의 맨 위부터 보인다
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [state.step])

  const next = async (): Promise<void> => {
    if (state.step === STEP.choices) {
      // AI·가명 처리·자동 실행을 저장한다(실패하면 다음으로 가지 않음)
      const r = await api.update({ ai: { defaultTarget: state.aiTarget }, masking: { mode: state.maskingMode }, launchAtLogin: state.launchAtLogin })
      if (!r.ok) return
    }
    dispatch({ type: 'next' })
  }
  const aiName = snap?.aiTargets.find((t) => t.id === state.aiTarget)?.name ?? null

  return (
    <div className="flex h-full flex-col bg-surface-solid font-ui text-fg select-none">
      <header className="flex h-10 shrink-0 items-center gap-2 pr-[140px] pl-5 [-webkit-app-region:drag]">
        <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
        <span className="text-small font-semibold text-fg-2">Sure-Mate 시작하기</span>
        <span className="ml-auto text-small text-fg-3 tabular-nums" aria-label={`${ONBOARDING_STEPS}단계 중 ${state.step}단계, ${STEP_NAMES[state.step]}`}>
          {STEP_NAMES[state.step]} · {state.step} / {ONBOARDING_STEPS}
        </span>
      </header>
      <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto px-8 pt-3 pb-6">
        {!snap ? <p className="text-small text-fg-2">준비하는 중이에요…</p> : null}
        {snap && state.step === STEP.workspace ? <StepWorkspace state={state} onSaved={(workspace) => dispatch({ type: 'workspace-saved', workspace })} onRestored={(id) => dispatch({ type: 'progress', progress: { kind: 'workspace', id } })} /> : null}
        {snap && state.step === STEP.hotkey ? <StepHotkey state={state} onPick={(acc) => dispatch({ type: 'hotkey', acc })} /> : null}
        {snap && state.step === STEP.choices ? <StepChoices snap={snap} state={state} onChoose={(c) => dispatch({ type: 'choose', ...c })} /> : null}
        {snap && state.step === STEP.prompt ? <StepTry state={state} aiName={aiName} /> : null}
        {snap && state.step === STEP.pet ? <StepPet snap={snap} /> : null}
      </main>
      <footer className="flex shrink-0 items-center gap-2 border-t border-line px-6 py-3">
        {state.step > 1 ? (
          <Button onClick={() => dispatch({ type: 'back' })}>뒤로</Button>
        ) : (
          <Button onClick={() => void api.finishOnboarding()}>안내 없이 시작하기</Button>
        )}
        <span className="ml-auto" />
        {canSkip(state) ? <Button onClick={() => dispatch({ type: 'skip' })}>이 단계 건너뛰기</Button> : null}
        {state.step === ONBOARDING_STEPS ? (
          <Button kind="primary" onClick={() => void api.finishOnboarding()}>
            시작하기
          </Button>
        ) : (
          <Button kind="primary" disabled={!canContinue(state)} onClick={() => void next()}>
            다음
          </Button>
        )}
      </footer>
    </div>
  )
}

function StepTitle({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="mb-5">
      <h1 className="text-title leading-8 font-semibold text-balance break-keep text-fg">{title}</h1>
      <p className="mt-1 text-body leading-6 text-balance break-keep text-fg-2">{children}</p>
    </div>
  )
}

/** 누를 키 하나(단축키·입력할 글) */
function Key({ children }: { children: ReactNode }): React.JSX.Element {
  return <kbd className="mx-0.5 inline-block rounded-control border border-line bg-surface-inset px-1.5 font-ui text-small leading-5 whitespace-nowrap text-fg">{children}</kbd>
}

/** 따라 하는 순서 한 줄: 번호(끝나면 체크), 할 일, 그 아래 조작·설명 */
function Item({ n, done = false, title, children }: { n: number; done?: boolean; title: ReactNode; children?: ReactNode }): React.JSX.Element {
  return (
    <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3">
      <span
        aria-hidden="true"
        className={`grid size-6 place-items-center rounded-full text-caption font-semibold tabular-nums transition-colors duration-(--dur-hover) ${done ? 'bg-brand text-ink' : 'border border-line text-fg-2'}`}
      >
        {done ? <CheckIcon size={14} /> : n}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-body leading-5 break-keep text-fg">
          {title}
          {done ? <span className="sr-only"> (했어요)</span> : null}
        </p>
        {children ? <div className="mt-2 text-small leading-5 break-keep text-fg-2">{children}</div> : null}
      </div>
    </li>
  )
}

/** ① 창 배치 따라 해 보기: 지금 배치 저장 → 흐트러뜨리기 → 팔레트(또는 안내 창 단추)로 불러오기. 불러오기는 어디서 하든 main이 알린다 */
function StepWorkspace({ state, onSaved, onRestored }: { state: OnboardingState; onSaved(w: TryWorkspace): void; onRestored(id: string): void }): React.JSX.Element {
  const api = window.sureMate
  const [name, setName] = useState(state.workspace?.name ?? TRY_WORKSPACE_NAME)
  const [busy, setBusy] = useState<'save' | 'restore' | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [canControl, setCanControl] = useState(true)
  useEffect(() => {
    void api
      .listWorkspaces()
      .then((v) => setCanControl(v.canControl))
      .catch(() => {})
  }, [api])

  const save = async (): Promise<void> => {
    if (busy) return
    const n = name.trim()
    if (!n) {
      setNotice({ text: '이름을 적어 주세요. 팔레트에서 이 이름으로 불러와요', tone: 'error' })
      return
    }
    setBusy('save')
    setNotice(null)
    try {
      const r = await api.settings.onboardingSaveWorkspace(n)
      if (r.ok) {
        onSaved({ id: r.id, name: r.name, windows: r.windows })
        setName(r.name)
        setNotice({ text: [`창 ${r.windows}개를 ‘${r.name}’로 저장했어요`, ...skippedParts(r.skipped)].join(' · '), tone: 'ok' })
      } else setNotice({ text: r.message, tone: 'error' })
    } catch {
      setNotice({ text: '저장하지 못했어요. 다시 해 주세요', tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const restore = async (): Promise<void> => {
    if (busy || !state.workspace) return
    setBusy('restore')
    try {
      const r = await api.runWorkspace(state.workspace.id)
      if (r.ok) onRestored(state.workspace.id)
      else if (r.reason !== 'cancelled') setNotice({ text: '불러오지 못했어요. 다시 해 주세요', tone: 'error' })
    } catch {
      setNotice({ text: '불러오지 못했어요. 다시 해 주세요', tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  if (!canControl) {
    return (
      <>
        <StepTitle title="창 배치를 저장하고 한 번에 되돌려요">일마다 다른 창 배치를 저장해 두었다가 단축키 한 번으로 그대로 불러오는 기능이에요.</StepTitle>
        <p role="alert" className="flex items-start gap-2 rounded-window border border-warn/35 bg-warn/10 px-4 py-3 text-small leading-5 break-keep text-fg">
          <TriangleAlertIcon size={16} className="mt-0.5 shrink-0 text-warn" />
          보안 프로그램이 창 제어를 막아 이 PC에서는 창 배치를 저장할 수 없어요. 이 단계를 건너뛰고 다음으로 가세요.
        </p>
      </>
    )
  }

  const saved = state.workspace
  const key = state.hotkey
  return (
    <>
      <StepTitle title={state.restored ? '해냈어요! 창이 제자리로 돌아왔어요' : '창 배치를 저장하고 한 번에 되돌려 보세요'}>
        {state.restored
          ? '저장한 배치는 팔레트, 바의 워크스페이스 단추, 워크스페이스 단축키로 언제든 불러와요.'
          : '회의·보고서·시험처럼 일마다 창 배치가 다르죠. 지금 배치를 저장해 두면 다음부터 한 번에 그대로 돌아와요.'}
      </StepTitle>
      <ol className="flex flex-col gap-4">
        <Item n={1} done={saved !== null} title="평소 일할 때처럼 창을 놓아 두세요">
          예: 주 모니터에 문서, 보조 모니터에 브라우저. 이 안내 창은 저장하지 않아요.
        </Item>
        <Item n={2} done={saved !== null} title="지금 배치를 저장하세요">
          <div className="flex flex-wrap items-center gap-2">
            <NameField value={name} onChange={setName} onEnter={() => void save()} />
            <Button kind={saved ? 'secondary' : 'primary'} busy={busy === 'save'} onClick={() => void save()}>
              {busy === 'save' ? '저장하는 중…' : saved ? '지금 배치로 다시 저장' : '지금 배치 저장'}
            </Button>
          </div>
          {notice ? <NoticeLine notice={notice} className="mt-2" /> : null}
        </Item>
        <Item n={3} done={state.restored} title="창 몇 개를 옮기거나 최소화해 보세요" />
        <Item n={4} done={state.restored} title="팔레트로 불러오세요">
          {saved ? (
            <>
              <span className="block">
                {key ? <Key>{key}</Key> : '팔레트 단축키'} → <Key>@{saved.name}</Key> 입력 → <Key>Enter</Key>
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-2">
                <span>또는</span>
                <Button busy={busy === 'restore'} onClick={() => void restore()}>
                  {busy === 'restore' ? '불러오는 중…' : '여기서 불러오기'}
                </Button>
              </span>
            </>
          ) : (
            '먼저 지금 배치를 저장하세요.'
          )}
        </Item>
      </ol>
      {state.restored ? (
        <p className="mt-5 rounded-window border border-line bg-surface-inset px-4 py-3 text-small leading-5 break-keep text-fg-2">
          자주 쓰는 배치는 설정 → 워크스페이스에서 단축키(예: Ctrl+Alt+1)를 정하면 팔레트 없이 바로 불러와요.
        </p>
      ) : null}
    </>
  )
}

/** 워크스페이스 이름 칸: 한글 조합 중이 아닌 Enter로 저장한다(칸을 떠날 때는 저장하지 않음) */
function NameField({ value, onChange, onEnter }: { value: string; onChange(v: string): void; onEnter(): void }): React.JSX.Element {
  return (
    <input
      type="text"
      value={value}
      maxLength={WORKSPACE_LIMITS.name}
      aria-label="워크스페이스 이름"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (isImeComposing(e.nativeEvent)) return
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault()
          onEnter()
        }
      }}
      className="h-8 w-48 rounded-control border border-line bg-surface-inset px-2.5 text-body text-fg select-text placeholder:text-fg-3"
    />
  )
}

/** ② 팔레트 단축키 */
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
    if (r.ok) onPick(r.acc ?? acc)
    else setProblem(`${acc}: ${r.reason}`)
  }

  return (
    <>
      <StepTitle title="팔레트를 여는 단축키를 고르세요">어느 창에서든 이 단축키를 누르면 팔레트가 떠요. 프롬프트·용어·창 배치를 모두 여기서 찾아요. 다른 앱이 쓰는 조합은 고를 수 없어요.</StepTitle>
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

/** ③ 주로 쓰는 AI와 가명 처리(쉬운 말 설명 + 고른 모드의 예시), 로그인할 때 자동 실행 */
function StepChoices({
  snap,
  state,
  onChoose
}: {
  snap: SettingsSnapshot
  state: OnboardingState
  onChoose(c: { aiTarget?: string; maskingMode?: MaskingMode; launchAtLogin?: boolean }): void
}): React.JSX.Element {
  const targets = snap.aiTargets.map((t) => ({ value: t.id, label: t.name }))
  return (
    <>
      <StepTitle title="AI와 가명 처리를 고르세요">
        프롬프트를 만들면 고른 AI를 열어 줘요. 가명 처리는 고객사·IP·경로 같은 정보를 AI에 보내기 전에 다른 이름으로 바꾸는 기능이에요.
      </StepTitle>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h2 id="ob-ai" className="text-caption font-semibold text-fg-2">
            주로 쓰는 AI
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {targets.length <= 5 ? (
              <Segmented labelId="ob-ai" descId="ob-ai-desc" value={state.aiTarget} options={targets} onChange={(aiTarget) => onChoose({ aiTarget })} />
            ) : (
              <RadioList labelId="ob-ai" value={state.aiTarget} options={targets} onChange={(aiTarget) => onChoose({ aiTarget })} />
            )}
            <span id="ob-ai-desc" className="text-small text-fg-3">
              ‘복사만’은 AI를 열지 않고 클립보드에만 넣어요
            </span>
          </div>
        </section>
        <section className="flex flex-col gap-2">
          <h2 id="ob-mask" className="text-caption font-semibold text-fg-2">
            가명 처리
          </h2>
          <RadioList<MaskingMode>
            labelId="ob-mask"
            value={state.maskingMode}
            options={SETTING_MASKING_MODES.map((m) => ({ value: m, label: maskingModeLabel(m), description: MASKING_EXPLAIN[m] }))}
            onChange={(maskingMode) => onChoose({ maskingMode })}
          />
          <MaskingExample mode={state.maskingMode} />
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

/**
 * ④ 프롬프트 따라 해 보기: 이 창에서 고른 메모를 팔레트가 가져간다(복사할 필요 없음). 선택이 풀리면 알리고 다시 고를 수 있게 한다.
 * 기본 가명 사전은 비어 있어 메모의 IP·경로만 바뀐다(이름은 가명 사전에 넣으면 바뀐다고 알린다)
 */
function StepTry({ state, aiName }: { state: OnboardingState; aiName: string | null }): React.JSX.Element {
  const memo = useRef<HTMLPreElement>(null)
  const [selected, setSelected] = useState(true)
  const selectMemo = useCallback((): void => {
    const el = memo.current
    const sel = window.getSelection()
    if (!el || !sel) return
    sel.removeAllRanges()
    const range = document.createRange()
    range.selectNodeContents(el)
    sel.addRange(range)
    setSelected(true)
  }, [])
  useEffect(() => {
    selectMemo()
    const onChange = (): void => {
      const sel = window.getSelection()
      const el = memo.current
      setSelected(Boolean(sel && el && !sel.isCollapsed && sel.anchorNode && el.contains(sel.anchorNode)))
    }
    document.addEventListener('selectionchange', onChange)
    return () => document.removeEventListener('selectionchange', onChange)
  }, [selectMemo])

  const key = state.hotkey
  const masking = state.maskingMode !== 'off'
  const opensAi = state.aiTarget !== 'copy' && aiName !== null
  return (
    <>
      <StepTitle title={state.tried ? '해냈어요! 프롬프트가 복사됐어요' : '메모로 AI 프롬프트를 만들어 보세요'}>
        {state.tried
          ? opensAi
            ? `열린 ${aiName} 사이트의 입력칸에 Ctrl+V로 붙여 넣으면 돼요.`
            : '쓰는 AI의 입력칸에 Ctrl+V로 붙여 넣으면 돼요.'
          : '아래 메모가 이미 선택돼 있어요. 복사(Ctrl+C)하지 않아도 돼요. 팔레트가 선택한 글을 알아서 가져가요.'}
      </StepTitle>
      {state.tried ? (
        masking ? (
          <p className="mb-5 rounded-window border border-line bg-surface-inset px-4 py-3 text-small leading-5 break-keep text-fg-2">
            AI가 쓴 글을 복사한 뒤 팔레트에서 ‘가명 되돌리기’를 하면 IP_1·PATH_1이 원래 주소로 돌아와요. 고객사·사람 이름은 설정 → 가명 처리의 가명
            사전에 넣으면 함께 바뀌어요.
          </p>
        ) : null
      ) : (
        <ol className="mb-4 flex flex-col gap-3">
          <Item
            n={1}
            title={
              key ? (
                <>
                  <Key>{key}</Key> 눌러 팔레트 열기
                </>
              ) : (
                '팔레트 단축키를 눌러 팔레트 열기'
              )
            }
          />
          <Item
            n={2}
            title={
              <>
                회의록 입력 → <Key>Enter</Key>
              </>
            }
          >
            확인 화면이 떠요. ‘선택한 글’이 이 메모예요.
          </Item>
          <Item
            n={3}
            title={
              <>
                확인 화면에서 <Key>Enter</Key>
              </>
            }
          >
            {masking ? '메모의 IP와 경로가 IP_1·PATH_1처럼 바뀐 것을 확인해요. ' : '가명 처리를 꺼서 원문 그대로 복사돼요. '}
            {opensAi ? `프롬프트가 클립보드에 복사되고 ${aiName} 사이트가 열려요.` : '프롬프트가 클립보드에 복사돼요.'}
          </Item>
        </ol>
      )}
      <pre
        ref={memo}
        aria-label="따라 해 보기 메모"
        className={`rounded-window border bg-surface-inset px-4 py-3 font-ui text-body leading-6 whitespace-pre-wrap text-fg select-text ${selected ? 'border-brand/60' : 'border-line'}`}
      >
        {SAMPLE_MEMO}
      </pre>
      {!state.tried ? (
        <div className="mt-2 flex min-h-8 items-center gap-2 text-small" role="status">
          {selected ? (
            <span className="flex items-center gap-1.5 text-fg-2">
              <CheckIcon size={14} className="text-brand" />
              메모가 선택돼 있어요
            </span>
          ) : (
            <>
              <span className="text-warn">선택이 풀렸어요. 팔레트는 선택한 글을 가져가요</span>
              <Button onClick={selectMemo}>메모 다시 선택</Button>
            </>
          )}
        </div>
      ) : null}
    </>
  )
}

/** 말랑 메이트 소개 그림: 가만히 서서 웃는 얼굴. 움직임 줄이기를 켠 PC에서는 숨쉬기도 멈춘다 */
const PET_HELLO: PetLook = { pose: 'stand', face: 'happy', props: [], facing: 'left', cue: null, cueSeq: 0 }

const PET_FACTS: { icon: ReactNode; text: string }[] = [
  { icon: <CopyIcon size={16} className="text-brand" />, text: '프롬프트를 복사하면 편지를 들고 축하해요' },
  { icon: <TriangleAlertIcon size={16} className="text-warn" />, text: '가명 처리가 꺼진 채 복사하면 걱정하며 알려 줘요' },
  { icon: <GamepadIcon size={16} className="text-fg-2" />, text: '누르면 폴짝, 두 번 누르면 팔레트가 열려요. 오른쪽 클릭 메뉴로 조종하기·재우기·숨기기를 골라요' },
  { icon: <EyeOffIcon size={16} className="text-fg-2" />, text: '발표·영상 같은 전체 화면에서는 숨고, 아래에 있는 창을 누르는 것을 막지 않아요' }
]

/** ⑤ 말랑 메이트 소개와 보이기 */
function StepPet({ snap }: { snap: SettingsSnapshot }): React.JSX.Element {
  const api = window.sureMate.settings
  const [visible, setVisible] = useState(snap.settings.pet.visible)
  const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const toggle = async (v: boolean): Promise<void> => {
    setVisible(v)
    const r = await api.update({ pet: { visible: v } }).catch(() => ({ ok: false }) as const)
    if (!r.ok) setVisible(!v)
  }
  return (
    <>
      <StepTitle title="말랑 메이트를 소개할게요">화면 오른쪽 Sure-Mate 바와 작업 표시줄 위를 돌아다니는 작은 친구예요. 일을 가리지 않고, 지금 상태를 몸짓으로 알려 줘요.</StepTitle>
      <div className="flex items-start gap-6">
        <div aria-hidden="true" className={`flex w-24 shrink-0 justify-center border-b border-line pt-2 transition-opacity duration-(--dur-hover) ${visible ? '' : 'opacity-40'}`}>
          <PetSprite look={PET_HELLO} size={72} reduceMotion={reduceMotion} />
        </div>
        <ul className="flex min-w-0 flex-1 flex-col gap-3">
          {PET_FACTS.map((f) => (
            <li key={f.text} className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-3 text-small leading-5 break-keep text-fg">
              <span className="mt-0.5">{f.icon}</span>
              {f.text}
            </li>
          ))}
        </ul>
      </div>
      <section className="mt-6 flex items-center gap-4 rounded-window bg-surface-inset px-4 py-3">
        <div className="min-w-0 flex-1">
          <div id="ob-pet" className="text-body text-fg">
            말랑 메이트 보이기
          </div>
          <div id="ob-pet-desc" className="text-small break-keep text-fg-2">
            숨기면 {PET_RECALL_HINT}
          </div>
        </div>
        <Toggle labelId="ob-pet" descId="ob-pet-desc" checked={visible} onChange={(v) => void toggle(v)} />
      </section>
    </>
  )
}
