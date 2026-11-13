import { useDeferredValue, useEffect, useReducer, useRef, useState } from 'react'
import { createExecutionGuard } from '../../../shared/execution-guard'
import { isImeComposing } from '../../../shared/ime'
import type { PromptDraft, PromptPreview, PromptSource } from '../../../shared/ipc-channels'
import { withObjectParticle } from '../../../shared/josa'
import { maskingModeLabel } from '../../../shared/labels'
import { MASKING_MODES } from '../../../shared/masking/modes'
import type { MaskItem } from '../../../shared/masking/types'
import type { MaskingMode } from '../../../shared/types'
import { PromptIcon, ShieldIcon, ShieldOffIcon } from '../design/icons'
import { MaskingExample } from '../settings/MaskingExample'
import {
  confirmReducer,
  initialConfirmState,
  keyToAction,
  maskingSummary,
  maskingTipVisible,
  selectionNote,
  splitPreview,
  type ConfirmFocus
} from './confirm-state'

/** 실행을 300ms 안에 두 번 하지 않는다(Enter 연타) */
const runGuard = createExecutionGuard(300)
const PREVIEW_DELAY_MS = 120

const count = (n: number): string => `${n.toLocaleString('ko-KR')}자`

const MODE_TITLES: Record<MaskingMode, string> = {
  off: '원문 그대로 복사해요',
  restore: "이름·IP·경로를 CLIENT_A처럼 다른 이름으로 바꿔 보내요. AI가 쓴 글을 복사해 '가명 되돌리기'를 하면 원래 이름으로 돌아와요",
  remove: "'고객사A', '[IP 주소]'처럼 바꾼 채로 보내고 되돌리지 않아요"
}

function Chip(props: {
  active: boolean
  disabled?: boolean
  focused: boolean
  tone?: 'brand' | 'warn'
  title?: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const warn = props.tone === 'warn'
  const base = 'h-8 shrink-0 rounded-control border px-3 text-small transition-colors duration-[120ms]'
  const look = props.active
    ? warn
      ? 'border-warn bg-warn/15 text-fg'
      : 'border-brand bg-brand/15 text-fg'
    : props.disabled
      ? 'border-line text-fg-3 opacity-40'
      : 'border-line text-fg-2 hover:bg-row-hover'
  const ring = props.active && props.focused ? `outline-2 outline-offset-2 ${warn ? 'outline-warn' : 'outline-brand'}` : ''
  return (
    <button type="button" tabIndex={-1} disabled={props.disabled} title={props.title} onClick={props.onClick} className={`${base} ${look} ${ring}`}>
      {props.children}
    </button>
  )
}

/** 찾은 대상 하나. 끈 항목은 이번 실행에서 가리지 않는다(취소선) */
function ItemChip(props: { item: MaskItem; focused: boolean; onClick: () => void }): React.JSX.Element {
  const { item } = props
  const off = !item.enabled
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={props.onClick}
      title={off ? '이번에는 가리지 않아요. 누르면 다시 가려요' : '누르면 이번에는 가리지 않아요'}
      className={`flex h-7 max-w-full shrink-0 items-center gap-1 rounded-control border px-2 text-caption transition-colors duration-[120ms] hover:bg-row-hover ${
        off ? 'border-line text-fg-3' : 'border-brand/40 text-fg-2'
      } ${props.focused ? 'outline-2 outline-offset-0 outline-brand' : ''}`}
    >
      <span className={`min-w-0 truncate ${off ? 'line-through' : ''}`}>{item.original}</span>
      <span className="text-fg-3">→</span>
      <span className={off ? 'line-through' : 'text-brand'}>{item.replacement ?? '가림'}</span>
      {item.count > 1 && <span className="text-fg-3">×{item.count}</span>}
    </button>
  )
}

/**
 * 가명 처리 첫 안내(2026-11-12): 처음으로 가명 처리한 프롬프트의 확인 화면에서 한 번만, 가명 처리 칩 아래(찾은 항목·대상·미리 보기 자리)를
 * 잠시 덮는다. 넓은 창(2026-11-13 두 칸 배치)에서는 오른쪽 칸(미리 보기 자리)을 덮고 왼쪽의 바뀌는 이름·AI는 흐리게 둔다. 설정 창 가명 처리 탭과 같은 실제 예시(MaskingExample)와, 처음 설치하면 비어 있는 가명 사전 이야기(고객사 이름은 적은 것만
 * 바뀐다: 실제로 일어날 일만 약속한다). [알겠어요]로 닫거나 안내가 보이는 채로 복사하면 다시 보이지 않는다(main이 설정에 남긴다)
 */
function MaskingTip({
  mode,
  focused,
  buttonRef,
  onDismiss
}: {
  mode: MaskingMode
  focused: boolean
  buttonRef: React.Ref<HTMLButtonElement>
  onDismiss: () => void
}): React.JSX.Element {
  return (
    <div
      role="note"
      aria-labelledby="masking-tip-title"
      className="absolute inset-0 z-10 rounded-window border border-brand/40 bg-surface-solid min-[880px]:bottom-auto min-[880px]:shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
    >
      {/* 가명 처리 칩을 가리키는 꼬리(바깥 두 변만 외곽선): 좁은 창은 위쪽, 넓은 창은 왼쪽 칸의 가명 처리 줄 높이에서 왼쪽을 가리킨다 */}
      <span
        aria-hidden="true"
        className="absolute -top-1.5 left-24 size-2.5 rotate-45 border-t border-l border-brand/40 bg-surface-solid min-[880px]:top-[111px] min-[880px]:-left-1.5 min-[880px]:border-t-0 min-[880px]:border-b"
      />
      <div className="flex h-full flex-col gap-2 overflow-y-auto px-4 py-3 min-[880px]:h-auto">
        <div className="flex items-center gap-2">
          <ShieldIcon size={14} className="shrink-0 text-brand" />
          <p id="masking-tip-title" className="text-small leading-5 font-semibold text-fg">
            AI에 보내기 전에 이름을 이렇게 바꿔요
          </p>
          <span className="ml-auto shrink-0 text-caption text-fg-3">처음 한 번만 보여요</span>
        </div>
        <MaskingExample mode={mode} compact />
        <div className="flex items-center gap-3">
          <p
            id="masking-tip-note"
            className="min-w-0 flex-1 text-caption leading-4 break-keep text-fg-2"
          >
            고객사·사람 이름은 가명 사전에 적은 것만 바뀌어요. IP·경로·이메일·전화번호는 저절로
            찾아요.
          </p>
          <button
            ref={buttonRef}
            type="button"
            tabIndex={-1}
            aria-describedby="masking-tip-title masking-tip-note"
            onClick={onDismiss}
            className={`h-7 shrink-0 rounded-control border border-brand/60 px-3 text-small text-fg transition-colors duration-[120ms] hover:bg-brand/15 ${
              focused ? 'outline-2 outline-offset-2 outline-brand' : ''
            }`}
          >
            알겠어요
          </button>
        </div>
      </div>
    </div>
  )
}

/** 프롬프트 확인 화면(설계 문서 §7 흐름 3~4단계, §8 가명 처리) */
export function Confirm(props: { draft: PromptDraft; onBack: () => void; onDone: () => void }): React.JSX.Element {
  const { draft } = props
  const [state, dispatch] = useReducer(confirmReducer, draft, initialConfirmState)
  const [preview, setPreview] = useState<PromptPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const tipButtonRef = useRef<HTMLButtonElement>(null)
  const tipVisible = maskingTipVisible(state)
  const deferredInput = useDeferredValue(state.input)
  const targetName = draft.targets.find((t) => t.id === state.target)?.name ?? state.target
  const note = selectionNote(draft)
  const items = preview?.masking.items ?? []
  const summary = maskingSummary(items)

  // 초점: 입력칸이면 글상자, 첫 안내면 [알겠어요](화면 읽기 프로그램이 안내를 읽는다), 아니면 화면 전체(키를 받아 칩을 바꾼다).
  // 키는 어디서든 화면 전체의 onKeyDown이 받는다
  useEffect(() => {
    if (state.focus === 'input') inputRef.current?.focus()
    else if (state.focus === 'tip') tipButtonRef.current?.focus()
    else rootRef.current?.focus()
  }, [state.focus])

  /** 첫 안내를 닫는다([알겠어요]·Enter·Space). 보이고 있을 때만 main에 알린다 */
  const dismissTip = (): void => {
    if (!maskingTipVisible(state)) return
    window.sureMate.maskingTipSeen('dismissed')
    dispatch({ type: 'dismiss-tip' })
  }

  // 미리 보기는 120ms 늦춰 main에 요청하고, 늦게 온 옛 응답은 버린다. 가명 처리는 확정하지 않는다(dryRun)
  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      void window.sureMate
        .previewPrompt({ source: state.source, input: deferredInput, target: state.target, masking: state.masking, disabledKeys: state.disabledKeys })
        .then((p) => {
          if (!alive) return
          setPreview(p)
          dispatch({ type: 'set-items', keys: p.masking.items.map((i) => i.key) })
        })
    }, PREVIEW_DELAY_MS)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [state.source, state.target, state.masking, state.disabledKeys, deferredInput])

  // 확인할 것은 넣은 글이므로, 미리 보기가 바뀌면 첫 형광펜 구간이 보이게 스크롤한다
  useEffect(() => {
    const box = previewRef.current
    const mark = box?.querySelector('mark')
    if (box && mark) box.scrollTop = Math.max(0, mark.offsetTop - 12)
  }, [preview])

  const back = (): void => {
    window.sureMate.cancelPrompt()
    props.onBack()
  }

  const run = async (): Promise<void> => {
    if (running || !runGuard('run')) return
    setRunning(true)
    setError(null)
    // 첫 안내가 보이는 채로 복사하면 안내를 본 것으로 친다
    const tipShown = maskingTipVisible(state)
    const result = await window.sureMate.runPrompt({
      source: state.source,
      input: state.input,
      target: state.target,
      masking: state.masking,
      disabledKeys: state.disabledKeys
    })
    setRunning(false)
    if (result.ok && tipShown) window.sureMate.maskingTipSeen('copied')
    if (result.ok) props.onDone()
    else setError(result.message)
  }

  const focusGroup = (focus: ConfirmFocus): void => dispatch({ type: 'focus', focus })
  const pickSource = (source: PromptSource): void => {
    dispatch({ type: 'set-source', source })
    if (source !== 'input') focusGroup('source')
  }

  const runLabel = draft.targets.length && state.target !== 'copy' ? `복사하고 ${withObjectParticle(targetName)} 열기` : '복사하기'
  const hint =
    state.focus === 'items'
      ? 'Space 이 항목 끄고 켜기 · ←→ 항목 고르기 · Tab 이동'
      : state.focus === 'tip'
        ? 'Enter·Space 안내 닫기 · Tab 이동'
        : 'Tab 이동 · ←→ 바꾸기 · Alt+M 가명 처리 · 입력칸에서는 Ctrl+↵'

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="flex h-screen flex-col overflow-hidden bg-surface-palette font-ui text-fg outline-none"
      onKeyDown={(e) => {
        const action = keyToAction(
          { code: e.code, key: e.key, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, isComposing: isImeComposing(e.nativeEvent), repeat: e.repeat },
          state
        )
        if (!action) return
        e.preventDefault()
        if (action.type === 'run') void run()
        else if (action.type === 'back') back()
        else if (action.type === 'dismiss-tip') dismissTip()
        else dispatch(action)
      }}
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-5">
        <PromptIcon size={18} className="shrink-0 text-brand" />
        <span className="text-input font-semibold">{draft.name}</span>
        {draft.group && <span className="rounded-full border border-line px-2 py-0.5 text-caption text-fg-3">{draft.group}</span>}
        <span className="ml-auto text-caption text-fg-3">Esc 목록으로</span>
      </div>

      {/*
        몸통(2026-11-13): 창 너비 880 이상이면 왼쪽 320 칸(넣을 글·가명 처리 / 바뀌는 이름·AI)과 오른쪽 칸(직접 입력·미리 보기),
        좁으면 한 줄로 쌓되 미리 보기에 최소 높이를 두고 넘치면 스크롤한다. 칸 자리는 격자 칸으로 정해 첫 안내가 덮을 자리를 같은 요소로 지정한다
      */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_1fr] gap-3 overflow-y-auto px-5 py-4 min-[880px]:grid-cols-[320px_minmax(0,1fr)] min-[880px]:grid-rows-[auto_minmax(0,1fr)] min-[880px]:gap-x-0 min-[880px]:gap-y-5 min-[880px]:overflow-hidden">
        <div className="col-start-1 row-start-1 flex flex-col gap-3 min-[880px]:gap-5 min-[880px]:pr-5">
          <div className="flex items-center gap-2 min-[880px]:flex-col min-[880px]:items-stretch">
            <span className="w-14 shrink-0 text-caption text-fg-3 min-[880px]:w-auto">넣을 글</span>
            <div className="flex min-w-0 flex-1 items-center gap-2 min-[880px]:flex-wrap">
              <Chip
                active={state.source === 'selection'}
                disabled={!state.sources.includes('selection')}
                focused={state.focus === 'source'}
                title={note ?? undefined}
                onClick={() => pickSource('selection')}
              >
                선택한 글{draft.selection.length > 0 ? ` ${count(draft.selection.length)}` : ''}
              </Chip>
              <Chip active={state.source === 'clipboard'} disabled={!state.sources.includes('clipboard')} focused={state.focus === 'source'} onClick={() => pickSource('clipboard')}>
                클립보드{draft.clipboardLength > 0 ? ` ${count(draft.clipboardLength)}` : ''}
              </Chip>
              <Chip active={state.source === 'input'} focused={state.focus === 'source'} onClick={() => pickSource('input')}>
                직접 입력
              </Chip>
              {note && <span className="ml-1 min-w-0 truncate text-caption text-fg-3 min-[880px]:ml-0 min-[880px]:basis-full min-[880px]:whitespace-normal">{note}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2 min-[880px]:flex-col min-[880px]:items-stretch">
            <span className="flex w-14 shrink-0 items-center gap-1 text-caption text-fg-3 min-[880px]:w-auto">
              <ShieldIcon size={13} className={state.masking === 'off' ? 'text-warn' : 'text-brand'} />
              가명<span className="hidden min-[880px]:inline"> 처리</span>
              <span className="ml-auto hidden shrink-0 min-[880px]:inline">Alt+M</span>
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-2 min-[880px]:flex-wrap">
              {MASKING_MODES.map((mode) => (
                <Chip
                  key={mode}
                  active={state.masking === mode}
                  focused={state.focus === 'masking'}
                  tone={mode === 'off' ? 'warn' : 'brand'}
                  title={MODE_TITLES[mode]}
                  onClick={() => {
                    dispatch({ type: 'set-masking', mode })
                    focusGroup('masking')
                  }}
                >
                  {maskingModeLabel(mode)}
                </Chip>
              ))}
              <span className="ml-1 min-w-0 truncate text-caption text-fg-3 min-[880px]:ml-0 min-[880px]:basis-full">
                {summary ? (state.masking === 'off' ? `찾음 ${summary}` : summary) : state.masking === 'off' ? '' : '가릴 것을 찾지 못했어요'}
              </span>
              <span className="ml-auto shrink-0 text-caption text-fg-3 min-[880px]:hidden">Alt+M</span>
            </div>
          </div>
        </div>

        {/* 첫 안내가 보이는 동안 안내가 덮는 자리(좁은 창: 아래 전부, 넓은 창: 오른쪽 칸)와 왼쪽의 바뀌는 이름·AI는 화면 읽기 프로그램·마우스에서도 뺀다(inert) */}
        <div
          inert={tipVisible}
          className={`col-start-1 row-start-2 flex flex-col gap-3 min-[880px]:min-h-0 min-[880px]:gap-5 min-[880px]:overflow-y-auto min-[880px]:-mx-1.5 min-[880px]:-my-1.5 min-[880px]:py-1.5 min-[880px]:pr-6.5 min-[880px]:pl-1.5 ${tipVisible ? 'opacity-40' : ''}`}
        >
          {state.masking === 'off' ? (
            <div className="flex shrink-0 items-center gap-2 rounded-control border border-warn/40 bg-warn/10 px-3 py-1.5 text-small text-warn">
              <ShieldOffIcon size={14} className="shrink-0" />
              가명 처리 꺼짐 — 원문 그대로 복사됩니다
            </div>
          ) : (
            items.length > 0 && (
              <div className="flex min-h-0 items-start gap-2 min-[880px]:flex-col min-[880px]:items-stretch min-[880px]:gap-2">
                <span className="w-14 shrink-0 min-[880px]:hidden" />
                <span className="hidden text-caption text-fg-3 min-[880px]:block">바뀌는 이름 · 누르면 이번만 그대로 보내요</span>
                {/* 초점 테두리(2px)가 스크롤 상자에 잘리지 않게 안쪽 여백을 두고 바깥으로 되돌린다 */}
                <div className="-m-0.5 flex max-h-16 min-w-0 flex-1 flex-wrap gap-1 overflow-y-auto p-0.5 min-[880px]:max-h-none min-[880px]:flex-none min-[880px]:flex-col min-[880px]:flex-nowrap min-[880px]:items-start">
                  {items.map((item, i) => (
                    <ItemChip
                      key={item.key}
                      item={item}
                      focused={state.focus === 'items' && state.itemIndex === i}
                      onClick={() => {
                        dispatch({ type: 'toggle-item', key: item.key })
                        focusGroup('items')
                      }}
                    />
                  ))}
                </div>
              </div>
            )
          )}

          <div className="flex items-center gap-2 min-[880px]:flex-col min-[880px]:items-stretch">
            <span className="w-14 shrink-0 text-caption text-fg-3 min-[880px]:w-auto">AI</span>
            <div className="flex min-w-0 flex-1 items-center gap-2 min-[880px]:flex-wrap">
              {draft.targets.map((t) => (
                <Chip
                  key={t.id}
                  active={state.target === t.id}
                  focused={state.focus === 'target'}
                  onClick={() => {
                    dispatch({ type: 'set-target', target: t.id })
                    focusGroup('target')
                  }}
                >
                  {t.name}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <div
          inert={tipVisible}
          className={`col-start-1 row-start-3 flex flex-col gap-3 min-[880px]:min-h-0 min-[880px]:col-start-2 min-[880px]:row-span-2 min-[880px]:row-start-1 min-[880px]:border-l min-[880px]:border-line min-[880px]:pl-5 ${tipVisible ? 'opacity-40' : ''}`}
        >
          {state.source === 'input' && (
            <div className="flex shrink-0 flex-col gap-1.5 min-[880px]:min-h-36 min-[880px]:basis-[36%]">
              <span className="hidden text-caption text-fg-3 min-[880px]:block">직접 입력</span>
              <textarea
                ref={inputRef}
                value={state.input}
                spellCheck={false}
                onChange={(e) => dispatch({ type: 'set-input', input: e.target.value })}
                onFocus={() => focusGroup('input')}
                placeholder="여기에 글을 붙여넣거나 입력하세요. Ctrl+Enter로 실행해요."
                className="h-24 shrink-0 resize-none rounded-window border border-line bg-surface-inset p-3 text-body leading-relaxed text-fg outline-none select-text placeholder:text-fg-3 focus:border-brand/70 min-[880px]:h-auto min-[880px]:min-h-0 min-[880px]:flex-1"
              />
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center text-caption text-fg-3">
              <span>미리 보기</span>
              {preview && <span className="ml-auto">넣을 글 {count(preview.inputLength)}</span>}
            </div>
            <div
              ref={previewRef}
              className="relative min-h-24 flex-1 overflow-auto rounded-window border border-line bg-surface-inset px-3.5 py-3 min-[880px]:min-h-0 text-body leading-relaxed break-all whitespace-pre-wrap text-fg-2 select-text"
            >
              {preview &&
                splitPreview(preview.text, preview.highlights, preview.maskRanges).map(
                  (part, i) => {
                    // 글자색 클래스는 하나만 둔다(둘이면 CSS 순서로 정해져 청록이 안 보일 수 있다)
                    const masked = 'font-semibold text-brand'
                    return part.mark ? (
                      <mark
                        key={i}
                        className={`rounded-[2px] bg-highlight/20 [box-decoration-break:clone] ${part.masked ? masked : 'text-fg'}`}
                      >
                        {part.text}
                      </mark>
                    ) : (
                      <span key={i} className={part.masked ? masked : undefined}>
                        {part.text}
                      </span>
                    )
                  }
                )}
              {preview?.truncated && (
                <div className="mt-2 text-caption text-fg-3">
                  … 앞 4,000자만 보여요. 복사할 때는 전체가 들어가요.
                </div>
              )}
            </div>
            {preview && (preview.warnings.length > 0 || preview.notes.length > 0) && (
              <ul className="flex flex-col gap-0.5 text-caption">
                {preview.warnings.map((w) => (
                  <li key={w} className="text-warn">
                    ! {w}
                  </li>
                ))}
                {preview.notes.map((n) => (
                  <li key={n} className="text-fg-3">
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {tipVisible ? (
          <div className="relative z-10 col-start-1 row-span-2 row-start-2 min-h-40 min-[880px]:col-start-2 min-[880px]:row-span-2 min-[880px]:row-start-1 min-[880px]:ml-5">
            <MaskingTip
              mode={state.masking}
              focused={state.focus === 'tip'}
              buttonRef={tipButtonRef}
              onDismiss={dismissTip}
            />
          </div>
        ) : null}
      </div>

      <div className="flex h-11 shrink-0 items-center gap-3 border-t border-line px-4 text-caption text-fg-3">
        {error ? <span className="min-w-0 truncate text-danger">{error}</span> : <span className="min-w-0 truncate">{hint}</span>}
        <button
          type="button"
          tabIndex={-1}
          disabled={running}
          onClick={() => void run()}
          className="ml-auto h-7 shrink-0 rounded-control bg-brand px-3 text-small font-semibold text-ink transition-opacity duration-[120ms] hover:opacity-90 disabled:opacity-50"
        >
          ↵ {runLabel}
        </button>
      </div>
    </div>
  )
}
