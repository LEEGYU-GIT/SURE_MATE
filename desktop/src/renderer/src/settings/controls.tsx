import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { isImeComposing } from '../../../shared/ime'

// 설정 창 공통 조작(설계 문서 §14·§14-4). 팔레트와 같은 토큰: 행 글자 14(--text-1), 설명 13(--text-2), 구역 머리 12/600.
// 모든 조작은 키보드로 쓸 수 있고(§16), 포커스 링은 전역 :focus-visible(청록 2px)을 쓴다.

/** 구역: 머리 글 + 옅은 바탕 상자 안의 행들 */
export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-end gap-2 px-1">
        <h3 className="text-caption leading-4 font-semibold text-fg-2">{title}</h3>
        {aside ? <div className="ml-auto">{aside}</div> : null}
      </div>
      <div className="flex flex-col rounded-window bg-surface-inset">{children}</div>
    </section>
  )
}

/** 한 행: 왼쪽 이름·설명, 오른쪽 조작. 조작은 labelId·descId로 이름과 설명을 잇는다 */
export function Row({
  label,
  description,
  children,
  stack = false
}: {
  label: ReactNode
  description?: ReactNode
  children: (ids: { labelId: string; descId: string | undefined }) => ReactNode
  /** 조작이 넓으면(목록·입력칸) 이름 아래에 둔다 */
  stack?: boolean
}): React.JSX.Element {
  const id = useId()
  const ids = { labelId: `${id}-label`, descId: description ? `${id}-desc` : undefined }
  return (
    <div className={`flex gap-x-6 gap-y-3 border-b border-line px-4 py-3 last:border-b-0 ${stack ? 'flex-col' : 'min-h-14 items-center'}`}>
      <div className="min-w-0 flex-1">
        <div id={ids.labelId} className="text-body leading-5 text-fg">
          {label}
        </div>
        {description ? (
          <div id={ids.descId} className="mt-0.5 text-small leading-5 text-balance break-keep text-fg-2">
            {description}
          </div>
        ) : null}
      </div>
      <div className={stack ? 'min-w-0' : 'shrink-0'}>{children(ids)}</div>
    </div>
  )
}

type Labelled = { labelId: string; descId?: string }

/** 켬·끔 스위치(role switch). 켜면 청록 바탕에 진한 손잡이 */
export function Toggle({ checked, onChange, labelId, descId }: Labelled & { checked: boolean; onChange(v: boolean): void }): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={descId}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-(--dur-hover) ${checked ? 'bg-brand' : 'bg-fg-3/45 hover:bg-fg-3/60'}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-1 left-0 size-4 rounded-full transition-transform duration-(--dur-hover) ease-(--ease-out) ${checked ? 'translate-x-6 bg-ink' : 'translate-x-1 bg-fg'}`}
      />
    </button>
  )
}

/**
 * 몇 안 되는 선택지(2~4개)를 한 줄 단추로(role radiogroup). Windows 기본 고르기 창은 밝게 떠서 쓰지 않는다.
 * ←→(또는 ↑↓)로 옮기면 바로 고른다(라디오 규칙). 한글 조합 중에는 움직이지 않는다.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  labelId,
  descId
}: Labelled & { value: T; options: { value: T; label: string }[]; onChange(v: T): void }): React.JSX.Element {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const onKeyDown = (e: KeyboardEvent): void => {
    if (isImeComposing(e.nativeEvent)) return
    const step = e.code === 'ArrowRight' || e.code === 'ArrowDown' ? 1 : e.code === 'ArrowLeft' || e.code === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = Math.min(options.length - 1, Math.max(0, index + step))
    if (next === index) return
    onChange(options[next].value)
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-labelledby={labelId} aria-describedby={descId} className="flex rounded-control bg-surface-inset p-0.5" onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`h-8 rounded-control px-3 text-small whitespace-nowrap transition-colors duration-(--dur-hover) ${
              on ? 'bg-row-selected font-semibold text-fg shadow-[inset_0_-2px_0_var(--brand)]' : 'text-fg-2 hover:bg-row-hover hover:text-fg'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** 세로 선택 목록(선택지가 많거나 설명이 붙을 때). ↑↓로 옮기면 바로 고른다 */
export function RadioList<T extends string>({
  value,
  options,
  onChange,
  labelId
}: Labelled & { value: T; options: { value: T; label: string; description?: string }[]; onChange(v: T): void }): React.JSX.Element {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const onKeyDown = (e: KeyboardEvent): void => {
    if (isImeComposing(e.nativeEvent)) return
    const step = e.code === 'ArrowDown' ? 1 : e.code === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = Math.min(options.length - 1, Math.max(0, index + step))
    if (next === index) return
    onChange(options[next].value)
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex flex-col" onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className="grid grid-cols-[20px_minmax(0,1fr)] items-start gap-x-3 rounded-control px-2 py-2 text-left hover:bg-row-hover"
          >
            <span aria-hidden="true" className={`mt-0.5 grid size-4 place-items-center rounded-full border-2 ${on ? 'border-brand' : 'border-fg-3'}`}>
              {on ? <span className="size-2 rounded-full bg-brand" /> : null}
            </span>
            <span className="min-w-0">
              <span className={`block text-body leading-5 ${on ? 'font-semibold text-fg' : 'text-fg'}`}>{o.label}</span>
              {o.description ? <span className="block text-small leading-5 break-keep text-fg-2">{o.description}</span> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * 밀어서 고르는 값. 끄는 동안은 화면 값만 바꾸고 0.4초 쉬면 저장한다(끌 때마다 파일에 쓰지 않게).
 * 바깥에서 값이 바뀌면(저장 실패로 되돌림·다른 곳에서 바꿈) 그 값으로 다시 그린다.
 */
export function Slider({
  value,
  min,
  max,
  step,
  format,
  onCommit,
  resetKey,
  labelId,
  descId
}: Labelled & {
  value: number
  min: number
  max: number
  step: number
  format(v: number): string
  onCommit(v: number): void
  /** 바뀌면 화면 값을 value로 되돌린다(저장 실패 뒤 실패한 값이 남지 않게, 설정 화면의 revision) */
  resetKey?: number
}): React.JSX.Element {
  const [local, setLocal] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => setLocal(value), [value, resetKey])
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const change = (v: number): void => {
    setLocal(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      if (v !== value) onCommit(v)
    }, 400)
  }
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        aria-labelledby={labelId}
        aria-describedby={descId}
        aria-valuetext={format(local)}
        onChange={(e) => change(Number(e.target.value))}
        className="h-1 w-44 cursor-pointer accent-(--brand)"
      />
      <span className="w-16 text-right text-small text-fg-2 tabular-nums">{format(local)}</span>
    </div>
  )
}

/** 단추: primary(청록), secondary(테두리), danger(지우기 — 빨간 글자) */
export function Button({
  kind = 'secondary',
  onClick,
  disabled,
  children,
  label,
  ref
}: {
  kind?: 'primary' | 'secondary' | 'danger'
  onClick(): void
  disabled?: boolean
  children: ReactNode
  /** 글자만으로 무엇을 하는지 모를 때(아이콘 단추 등) */
  label?: string
  /** 옆 조작이 사라질 때 포커스를 이 단추로 돌려줄 때(키보드만으로 사용, §16) */
  ref?: Ref<HTMLButtonElement>
}): React.JSX.Element {
  const look =
    kind === 'primary'
      ? 'bg-brand text-ink font-semibold hover:bg-brand-strong'
      : kind === 'danger'
        ? 'border border-line text-danger hover:bg-danger/10'
        : 'border border-line text-fg hover:bg-row-hover'
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`h-8 shrink-0 rounded-control px-3 text-small whitespace-nowrap transition-colors duration-(--dur-hover) disabled:cursor-not-allowed disabled:opacity-45 ${look}`}
    >
      {children}
    </button>
  )
}

/** 한 줄 입력칸. 한글 조합 중 Enter는 무시하고, 조합이 아닌 Enter 또는 칸을 떠날 때 onCommit */
export function TextField({
  value,
  onChange,
  onCommit,
  placeholder,
  invalid,
  labelId,
  describedBy,
  width = 'w-64',
  maxLength
}: {
  value: string
  onChange(v: string): void
  onCommit?(): void
  placeholder?: string
  invalid?: boolean
  labelId?: string
  describedBy?: string
  width?: string
  maxLength?: number
}): React.JSX.Element {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onCommit?.()}
      onKeyDown={(e) => {
        if (isImeComposing(e.nativeEvent)) return
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault()
          onCommit?.()
        }
      }}
      className={`h-8 ${width} rounded-control border bg-surface-inset px-2.5 text-body text-fg placeholder:text-fg-3 ${invalid ? 'border-danger' : 'border-line'}`}
    />
  )
}
