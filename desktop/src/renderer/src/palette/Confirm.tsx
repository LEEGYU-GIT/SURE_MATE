import { useDeferredValue, useEffect, useReducer, useRef, useState } from 'react'
import { createExecutionGuard } from '../../../shared/execution-guard'
import { isImeComposing } from '../../../shared/ime'
import type { PromptDraft, PromptPreview, PromptSource } from '../../../shared/ipc-channels'
import { withObjectParticle } from '../../../shared/josa'
import { PromptIcon } from '../design/icons'
import { confirmReducer, initialConfirmState, keyToAction, selectionNote, type ConfirmFocus } from './confirm-state'

/** 실행을 300ms 안에 두 번 하지 않는다(Enter 연타) */
const runGuard = createExecutionGuard(300)
const PREVIEW_DELAY_MS = 120

const count = (n: number): string => `${n.toLocaleString('ko-KR')}자`

function Chip(props: { active: boolean; disabled?: boolean; focused: boolean; title?: string; onClick: () => void; children: React.ReactNode }): React.JSX.Element {
  const base = 'h-8 shrink-0 rounded-control border px-3 text-small transition-colors duration-[120ms]'
  const look = props.active
    ? 'border-brand bg-brand/15 text-fg'
    : props.disabled
      ? 'border-line text-fg-3 opacity-40'
      : 'border-line text-fg-2 hover:bg-row-hover'
  const ring = props.active && props.focused ? 'outline-2 outline-offset-2 outline-brand' : ''
  return (
    <button type="button" tabIndex={-1} disabled={props.disabled} title={props.title} onClick={props.onClick} className={`${base} ${look} ${ring}`}>
      {props.children}
    </button>
  )
}

/** 프롬프트 확인 화면(설계 문서 §7 흐름 3~4단계). 가명 처리 칩은 M3에서 붙는다. */
export function Confirm(props: { draft: PromptDraft; onBack: () => void; onDone: () => void }): React.JSX.Element {
  const { draft } = props
  const [state, dispatch] = useReducer(confirmReducer, draft, initialConfirmState)
  const [preview, setPreview] = useState<PromptPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const deferredInput = useDeferredValue(state.input)
  const targetName = draft.targets.find((t) => t.id === state.target)?.name ?? state.target
  const note = selectionNote(draft)

  // 초점: 입력칸이면 글상자, 아니면 화면 전체(키를 받아 칩을 바꾼다)
  useEffect(() => {
    if (state.focus === 'input') inputRef.current?.focus()
    else rootRef.current?.focus()
  }, [state.focus])

  // 미리 보기는 120ms 늦춰 main에 요청하고, 늦게 온 옛 응답은 버린다
  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      void window.sureMate.previewPrompt({ source: state.source, input: deferredInput, target: state.target }).then((p) => {
        if (alive) setPreview(p)
      })
    }, PREVIEW_DELAY_MS)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [state.source, state.target, deferredInput])

  const back = (): void => {
    window.sureMate.cancelPrompt()
    props.onBack()
  }

  const run = async (): Promise<void> => {
    if (running || !runGuard('run')) return
    setRunning(true)
    setError(null)
    const result = await window.sureMate.runPrompt({ source: state.source, input: state.input, target: state.target })
    setRunning(false)
    if (result.ok) props.onDone()
    else setError(result.message)
  }

  const focusGroup = (focus: ConfirmFocus): void => dispatch({ type: 'focus', focus })
  const pickSource = (source: PromptSource): void => {
    dispatch({ type: 'set-source', source })
    if (source !== 'input') focusGroup('source')
  }

  const runLabel = draft.targets.length && state.target !== 'copy' ? `복사하고 ${withObjectParticle(targetName)} 열기` : '복사하기'

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="flex h-screen flex-col overflow-hidden bg-surface-palette font-ui text-fg outline-none"
      onKeyDown={(e) => {
        const action = keyToAction(
          { code: e.code, key: e.key, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, isComposing: isImeComposing(e.nativeEvent) },
          state
        )
        if (!action) return
        e.preventDefault()
        if (action.type === 'run') void run()
        else if (action.type === 'back') back()
        else dispatch(action)
      }}
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-5">
        <PromptIcon size={18} className="shrink-0 text-brand" />
        <span className="text-input font-semibold">{draft.name}</span>
        {draft.group && <span className="rounded-full border border-line px-2 py-0.5 text-caption text-fg-3">{draft.group}</span>}
        <span className="ml-auto text-caption text-fg-3">Esc 목록으로</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-caption text-fg-3">넣을 글</span>
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
          {note && <span className="ml-1 min-w-0 truncate text-caption text-fg-3">{note}</span>}
        </div>

        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-caption text-fg-3">AI</span>
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

        {state.source === 'input' && (
          <textarea
            ref={inputRef}
            value={state.input}
            spellCheck={false}
            onChange={(e) => dispatch({ type: 'set-input', input: e.target.value })}
            onFocus={() => focusGroup('input')}
            placeholder="여기에 글을 붙여넣거나 입력하세요. Ctrl+Enter로 실행해요."
            className="h-24 shrink-0 resize-none rounded-window border border-line bg-black/20 p-3 text-body text-fg outline-none select-text placeholder:text-fg-3 focus:border-brand/70"
          />
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center text-caption text-fg-3">
            <span>미리 보기</span>
            {preview && <span className="ml-auto">넣을 글 {count(preview.inputLength)}</span>}
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-window border border-line bg-black/20 px-3 py-2.5 text-small leading-relaxed break-all whitespace-pre-wrap text-fg-2 select-text">
            {preview?.text}
            {preview?.truncated && <div className="mt-2 text-caption text-fg-3">… 앞 4,000자만 보여요. 복사할 때는 전체가 들어가요.</div>}
          </div>
          {preview && preview.warnings.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-caption text-warn">
              {preview.warnings.map((w) => (
                <li key={w}>! {w}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex h-11 shrink-0 items-center gap-3 border-t border-line px-4 text-caption text-fg-3">
        {error ? <span className="min-w-0 truncate text-danger">{error}</span> : <span>Tab 이동 · ←→ 바꾸기 · 입력칸에서는 Ctrl+↵</span>}
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
