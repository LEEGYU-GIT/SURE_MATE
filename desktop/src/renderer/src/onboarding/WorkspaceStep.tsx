import { useState, type ReactNode } from 'react'
import { isImeComposing } from '../../../shared/ime'
import { skippedParts } from '../../../shared/workspace/messages'
import { WORKSPACE_LIMITS } from '../../../shared/workspace/types'
import { CheckIcon, TriangleAlertIcon } from '../design/icons'
import { Button, NoticeLine, type Notice } from '../settings/controls'
import type { OnboardingState, TryWorkspace } from './onboarding-state'
import { Keycap, StepTitle } from './parts'

/** 워크스페이스 체험의 처음 이름(팔레트에서 `@업무 배치`로 찾는다) */
const TRY_WORKSPACE_NAME = '업무 배치'

/** 따라 하는 순서 한 줄: 번호(끝나면 체크), 할 일, 그 아래 조작·설명 */
function Item({
  n,
  done = false,
  title,
  children
}: {
  n: number
  done?: boolean
  title: ReactNode
  children?: ReactNode
}): React.JSX.Element {
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
        {children ? (
          <div className="mt-2 text-small leading-5 break-keep text-fg-2">{children}</div>
        ) : null}
      </div>
    </li>
  )
}

/**
 * 첫 실행 안내 2 / 3: 워크스페이스 체험(main의 5단계 안내 ①을 그대로 옮겼다, 2026-11-12). 지금 배치 저장 → 흐트러뜨리기 →
 * 팔레트(또는 안내 창 단추)로 불러오기. 불러오기는 어디서 하든 main이 알린다(onboarding:progress). canControl: Win32를 쓸 수 있는지
 */
export function WorkspaceStep({
  state,
  canControl,
  onSaved,
  onRestored
}: {
  state: OnboardingState
  canControl: boolean
  onSaved(w: TryWorkspace): void
  onRestored(id: string): void
}): React.JSX.Element {
  const api = window.sureMate
  const [name, setName] = useState(state.workspace?.name ?? TRY_WORKSPACE_NAME)
  const [busy, setBusy] = useState<'save' | 'restore' | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

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
        setNotice({
          text: [`창 ${r.windows}개를 ‘${r.name}’로 저장했어요`, ...skippedParts(r.skipped)].join(
            ' · '
          ),
          tone: 'ok'
        })
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
      else if (r.reason !== 'cancelled')
        setNotice({ text: '불러오지 못했어요. 다시 해 주세요', tone: 'error' })
    } catch {
      setNotice({ text: '불러오지 못했어요. 다시 해 주세요', tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  if (!canControl) {
    return (
      <>
        <StepTitle title="창 배치를 저장하고 한 번에 되돌려요">
          일마다 다른 창 배치를 저장해 두었다가 단축키 한 번으로 그대로 불러오는 기능이에요.
        </StepTitle>
        <p
          role="alert"
          className="flex items-start gap-2 rounded-window border border-warn/35 bg-warn/10 px-4 py-3 text-small leading-5 break-keep text-fg"
        >
          <TriangleAlertIcon size={16} className="mt-0.5 shrink-0 text-warn" />
          보안 프로그램이 창 제어를 막아 이 PC에서는 창 배치를 저장할 수 없어요. 이 단계를 건너뛰고
          다음으로 가세요.
        </p>
      </>
    )
  }

  const saved = state.workspace
  const key = state.hotkey
  return (
    <>
      <StepTitle
        title={
          state.restored
            ? '해냈어요! 창이 제자리로 돌아왔어요'
            : '창 배치를 저장하고 한 번에 되돌려 보세요'
        }
      >
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
            <Button
              kind={saved ? 'secondary' : 'primary'}
              busy={busy === 'save'}
              onClick={() => void save()}
            >
              {busy === 'save'
                ? '저장하는 중…'
                : saved
                  ? '지금 배치로 다시 저장'
                  : '지금 배치 저장'}
            </Button>
          </div>
          {notice ? <NoticeLine notice={notice} className="mt-2" /> : null}
        </Item>
        <Item n={3} done={state.restored} title="창 몇 개를 옮기거나 최소화해 보세요" />
        <Item n={4} done={state.restored} title="팔레트로 불러오세요">
          {saved ? (
            <>
              <span className="flex flex-wrap items-center gap-1">
                {key ? <Keycap>{key}</Keycap> : '팔레트 단축키'} → <Keycap>@{saved.name}</Keycap>{' '}
                입력 → <Keycap>Enter</Keycap>
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
        <p className="guide-reveal mt-5 rounded-window border border-line bg-surface-inset px-4 py-3 text-small leading-5 break-keep text-fg-2">
          자주 쓰는 배치는 설정 → 워크스페이스에서 단축키(예: Ctrl+Alt+1)를 정하면 팔레트 없이 바로
          불러와요.
        </p>
      ) : null}
    </>
  )
}

/** 워크스페이스 이름 칸: 한글 조합 중이 아닌 Enter로 저장한다(칸을 떠날 때는 저장하지 않음) */
function NameField({
  value,
  onChange,
  onEnter
}: {
  value: string
  onChange(v: string): void
  onEnter(): void
}): React.JSX.Element {
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
