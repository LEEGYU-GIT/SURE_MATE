import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject
} from 'react'
import type { SettingsHotkeyId } from '../../../shared/settings/settings-snapshot'
import { CheckIcon } from '../design/icons'
import { Button, NoticeLine } from '../settings/controls'
import { HotkeyRecorder } from '../settings/HotkeyRecorder'
import './guide.css'

// 첫 실행 안내·따라 해 보기가 같이 쓰는 조각(설계 문서 §14-4 토큰만, 굵기 400·600, 움직임은 --dur-hover·--dur-open).

/** 화면이 바뀌면 포커스를 받을 제목(키보드만으로 사용, §16). 틀(GuideFrame)이 만들고 StepTitle이 붙인다 */
const TitleRef = createContext<RefObject<HTMLHeadingElement | null> | null>(null)

/**
 * 안내 창의 틀: 위 제목 줄(끌어서 창을 옮기는 자리, 오른쪽 140은 Windows 창 단추 자리), 스크롤되는 내용, 늘 보이는 아래 단추 줄.
 * screenKey가 바뀌면(다음·뒤로·해냄) 내용을 맨 위로 올리고 제목으로 포커스를 옮긴다. onShown은 그 뒤에 부른다
 * (따라 해 보기: 포커스를 옮긴 다음 메모를 선택해야 선택이 남는다)
 */
export function GuideFrame({
  name,
  progress,
  screenKey,
  onShown,
  children,
  footer
}: {
  name: string
  progress?: { n: number; total: number }
  screenKey: string
  onShown?(): void
  children: ReactNode
  footer: ReactNode
}): React.JSX.Element {
  const title = useRef<HTMLHeadingElement>(null)
  const main = useRef<HTMLElement>(null)
  const shown = useRef(onShown)
  useEffect(() => {
    shown.current = onShown
  })
  useEffect(() => {
    main.current?.scrollTo({ top: 0 })
    title.current?.focus({ preventScroll: true })
    shown.current?.()
  }, [screenKey])
  return (
    <div className="flex h-full flex-col bg-surface-solid font-ui text-fg select-none">
      <header className="flex h-10 shrink-0 items-center gap-2 pr-[140px] pl-5 [-webkit-app-region:drag]">
        <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
        <span className="text-small font-semibold text-fg-2">{name}</span>
        {progress ? <Progress {...progress} /> : null}
      </header>
      <main ref={main} className="@container min-h-0 flex-1 overflow-y-auto px-8 pt-2 pb-4">
        <TitleRef.Provider value={title}>
          <div key={screenKey} className="guide-screen-in">
            {children}
          </div>
        </TitleRef.Provider>
      </main>
      <footer className="flex min-h-14 shrink-0 items-center gap-2 border-t border-line px-6 py-3">
        {footer}
      </footer>
    </div>
  )
}

/** "n / 전체"와 단계 칸(지난 칸·지금 칸은 청록). 화면 읽기 프로그램에는 "3단계 중 1단계" */
function Progress({ n, total }: { n: number; total: number }): React.JSX.Element {
  return (
    <div
      className="ml-auto flex items-center gap-2"
      role="img"
      aria-label={`${total}단계 중 ${n}단계`}
    >
      <span className="flex gap-1" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-1 w-4 rounded-full transition-colors duration-(--dur-open) ${i < n ? 'bg-brand' : 'bg-fg-3/35'}`}
          />
        ))}
      </span>
      <span className="text-small text-fg-3 tabular-nums" aria-hidden="true">
        {n} / {total}
      </span>
    </div>
  )
}

/** 화면 제목(20/600)과 한두 문장 설명. 제목은 화면이 바뀔 때 포커스를 받는다(포커스 링은 그리지 않는다: 누를 수 있는 것이 아니다) */
export function StepTitle({
  title,
  children
}: {
  title: string
  children?: ReactNode
}): React.JSX.Element {
  const ref = useContext(TitleRef)
  return (
    <div className="mb-4">
      <h1
        ref={ref}
        tabIndex={-1}
        className="text-title leading-7 font-semibold text-balance break-keep text-fg outline-none"
      >
        {title}
      </h1>
      {children ? (
        <p className="mt-1 text-body leading-6 text-pretty break-keep text-fg-2">{children}</p>
      ) : null}
    </div>
  )
}

/** 누를 키·조합(키보드에 적힌 그대로) */
export function Keycap({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <kbd className="inline-flex h-6 items-center rounded-control border border-line bg-surface-inset px-1.5 align-middle font-ui text-small leading-5 whitespace-nowrap text-fg">
      {children}
    </kbd>
  )
}

export type MarkerState = 'todo' | 'current' | 'done' | 'plain'

/**
 * 순서 표시(정말 차례가 있는 단계에만 쓴다): 할 차례는 청록 바탕, 끝난 단계는 체크, 아직은 흐린 테두리.
 * plain은 차례를 따지지 않는 안내 목록(따라 해 보기의 키 순서)
 */
export function StepMarker({ n, state }: { n: number; state: MarkerState }): React.JSX.Element {
  const look =
    state === 'current'
      ? 'bg-brand text-ink'
      : state === 'done'
        ? 'bg-brand/15 text-brand'
        : state === 'plain'
          ? 'bg-row-selected text-fg'
          : 'border border-fg-3/60 text-fg-3'
  return (
    <span
      aria-hidden="true"
      className={`grid size-6 shrink-0 place-items-center rounded-full text-caption font-semibold transition-colors duration-(--dur-open) ${look}`}
    >
      {state === 'done' ? <CheckIcon size={14} /> : n}
    </span>
  )
}

/**
 * 화면의 주 동작 단추(높이 40, 글자 14/600). busy는 하던 일이 끝날 때까지 누를 수 없음: disabled와 같은 모양이지만 aria-disabled라
 * 포커스를 잃지 않는다(controls.tsx Button과 같은 규칙)
 */
export function BigButton({
  kind = 'primary',
  onClick,
  disabled,
  busy,
  children,
  ref,
  describedBy
}: {
  kind?: 'primary' | 'secondary'
  onClick(): void
  disabled?: boolean
  busy?: boolean
  children: ReactNode
  ref?: Ref<HTMLButtonElement>
  describedBy?: string
}): React.JSX.Element {
  const look =
    kind === 'primary'
      ? 'bg-brand text-ink hover:bg-brand-strong'
      : 'border border-line text-fg hover:bg-row-hover'
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      aria-disabled={busy || undefined}
      aria-describedby={describedBy}
      onClick={busy ? undefined : onClick}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-control px-5 text-body font-semibold whitespace-nowrap transition-colors duration-(--dur-hover) disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 ${look}`}
    >
      {children}
    </button>
  )
}

/**
 * 단축키를 정하는 단추와 녹화 칸(설정 창의 HotkeyRecorder를 그대로 쓴다). 녹화 칸은 실패 까닭을 열려 있는 동안만 빨간 줄로 보이므로,
 * 칸이 닫힐 때(Esc·다른 곳 누름·30초) 그 줄을 읽어 칸 아래에 빨간 줄로 남긴다: 다음에 바꾸기에 성공하거나 다시 녹화를 시작할 때까지
 * 보인다. Esc로 닫으면 포커스를 단추로 돌려준다
 */
export function RecorderField({
  id,
  label,
  labelledBy,
  onRecorded
}: {
  id: SettingsHotkeyId
  /** 녹화를 시작하는 단추 글 */
  label: string
  labelledBy?: string
  onRecorded(r: { acc: string; warning?: string }): void
}): React.JSX.Element {
  const [recording, setRecording] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  useEffect(() => {
    if (recording || !refocus.current) return
    refocus.current = false
    button.current?.focus()
  }, [recording])
  return (
    <div className="flex flex-col gap-2">
      {recording ? (
        <div ref={wrap}>
          <HotkeyRecorder
            id={id}
            labelledBy={labelledBy}
            onDone={(r) => {
              const shown =
                wrap.current?.querySelector('[role="alert"]')?.textContent?.trim() || null
              refocus.current = Boolean(wrap.current?.contains(document.activeElement))
              setRecording(false)
              if (r) {
                setProblem(null)
                onRecorded(r)
              } else setProblem(shown)
            }}
          />
        </div>
      ) : (
        <div>
          <Button
            ref={button}
            onClick={() => {
              setProblem(null)
              setRecording(true)
            }}
          >
            {label}
          </Button>
        </div>
      )}
      {!recording && problem ? <NoticeLine notice={{ tone: 'error', text: problem }} /> : null}
    </div>
  )
}

/** 꼬리: 펫이 아래에 있으면 아래 가운데, 오른쪽에 있으면 오른쪽 가운데(바깥 두 변만 외곽선, PetBubble과 같은 모양) */
const TAIL: Record<'bottom' | 'right', string> = {
  bottom: '-bottom-1.5 left-1/2 -translate-x-1/2 border-r-2 border-b-2',
  right: 'top-1/2 -right-1.5 -translate-y-1/2 border-t-2 border-r-2'
}

/** 말랑 메이트 말풍선 모양(설계 §14-2: 흰 바탕·--ink 글자·모서리 8, 펫 쪽 꼬리). 그림 안에 놓는 작은 것 */
export function MiniBubble({
  children,
  tail = 'bottom'
}: {
  children: ReactNode
  tail?: 'bottom' | 'right'
}): React.JSX.Element {
  return (
    <span className="relative inline-block rounded-window border-2 border-ink bg-bubble px-2 py-0.5 text-caption leading-5 font-semibold whitespace-nowrap text-ink">
      {children}
      <span
        aria-hidden="true"
        className={`absolute size-2.5 rotate-45 border-ink bg-bubble ${TAIL[tail]}`}
      />
    </span>
  )
}
