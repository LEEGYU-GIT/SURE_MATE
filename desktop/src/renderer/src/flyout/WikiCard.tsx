import { useEffect, useId, useLayoutEffect, useReducer, useRef, type ReactNode, type Ref } from 'react'
import type { FlyoutAction, FlyoutContent, WikiCardEntry, WikiCardView } from '../../../shared/flyout/flyout-content'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, ClipboardPasteIcon, CopyIcon, OpenOutIcon, PinIcon, SearchIcon, XIcon } from '../design/icons'
import { sourceLabel } from '../palette/wiki-state'
import { MenuSeparator } from './Menu'
import { press } from './press'
import {
  CARD_TEXT,
  cardReducer,
  copyResultOf,
  currentEntry,
  distinguishingAlias,
  flashCopy,
  initialCardState,
  noteHint,
  sameNameIds,
  type CardAction,
  type CardState
} from './wiki-card-state'

// 선택 글 위키 카드(설계 §9). 표면·모서리·그림자·들어오는 움직임은 Flyout이 그리고, 여기서는 안쪽만 그린다.
// - 메뉴와 같은 가족: 글자 시작 12(안쪽 여백 4 + 행 8), 행·단추는 모서리 4의 마우스 올림·누름 바탕, 누를 때 움직임 없음.
// - 글자: 용어 16/600, 별칭 12(--text-2: 이 바탕에서 --text-3은 4.5:1 미만), 설명 14/22, 사용 예 13(안쪽 바탕), 머리 글 12/600.
// - 간격은 4의 배수(§14-4). 머리 줄 글은 줄 높이 28로 단추(28)와 가운데를 맞춘다.
// - 칸(data-card-root의 자식)은 머리 · 스크롤 본문 · 아래 단추 줄이고 칸 사이에 바깥 여백을 두지 않는다.
//   Flyout이 칸 높이를 더해 카드 높이를 알리기 때문이다(본문은 다 보일 높이로, wiki-card-state.ts cardHeight).

type CardContent = Extract<FlyoutContent, { kind: 'wiki-card' }>

/**
 * 카드 단추가 main에 보내는 동작. 결과는 main의 답(true/false), 요청 자체가 거부·실패했으면 'failed',
 * 앞 동작을 처리하는 중이라 보내지 않았으면 null
 */
export type CardSend = (a: FlyoutAction) => Promise<boolean | 'failed' | null>

/**
 * 카드 크기가 바뀔 수 있는 화면 변화(다른 후보·목록↔상세, 그리고 좁은 카드에서 아래 단추 줄을 두 줄로 만들 수 있는
 * "지워진 용어예요"·"복사하지 못했어요" 표시). 크기가 그대로면 main이 아무것도 하지 않는다
 */
const layoutKey = (s: CardState): string => `${s.best?.id ?? ''}|${s.openId ?? ''}|${s.flash && s.flash.result !== 'copied' ? s.flash.result : ''}`

/**
 * 위키 카드. 화면 상태(고른 후보·연 상세·스크롤·복사 표시)는 카드 안에만 있고, 같은 카드 번호로 온 새 내용(고정만 바뀜)은
 * 그 상태를 그대로 둔다(Flyout은 카드 번호로 이 화면을 새로 만든다).
 * 카드 안에서 본문이 바뀌면 onResize로 크기를 다시 알린다(main이 창을 다시 띄우지 않고 크기·자리만 맞춘다).
 */
export function WikiCard({ content, onAction, onResize }: { content: CardContent; onAction: CardSend; onResize(): void }): React.JSX.Element {
  const [state, dispatch] = useReducer(cardReducer, content, (c: CardContent) => initialCardState(c.view, c.cardId))
  // 새 내용은 그리기 전에 반영한다(같은 카드 번호면 상태를 둔다). React는 이 그리기를 버리고 바로 다시 그린다
  if (state.cardId !== content.cardId || state.view !== content.view) dispatch({ type: 'view', view: content.view, cardId: content.cardId })

  // 다른 후보·상세는 본문을 맨 위에서, ‹ 목록은 보던 목록 자리에서 보여 준다(그리기 전에 맞춘다)
  const body = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (state.scroll && body.current) body.current.scrollTop = state.scroll.top
  }, [state.scroll])

  const key = layoutKey(state)
  const last = useRef<{ view: WikiCardView; key: string } | null>(null)
  useLayoutEffect(() => {
    const prev = last.current
    last.current = { view: state.view, key }
    // 같은 내용 안에서 본문만 바뀌었을 때만(새 내용의 크기는 Flyout이 seq마다 알린다)
    if (prev && prev.view === state.view && prev.key !== key) onResize()
  }, [state.view, key, onResize])

  // 복사 표시 타이머는 카드가 닫히면 치운다
  const alive = useRef(true)
  const cancelFlash = useRef<(() => void) | null>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      cancelFlash.current?.()
    }
  }, [])
  const copy = async (id: string): Promise<void> => {
    const answer = await onAction({ type: 'wiki-copy', id })
    if (answer === null || !alive.current) return
    cancelFlash.current?.()
    cancelFlash.current = flashCopy(dispatch, copyResultOf(answer))
  }

  const view = state.view
  const entry = currentEntry(state)
  const pinned = content.pinned
  if (view.kind === 'best' && entry) {
    return (
      <CardRoot>
        <CardHeader title={<EntryTitle entry={entry} />} pin={{ pinned }} onAction={onAction} />
        <CardBody ref={body}>
          <EntryText entry={entry} />
          <Candidates others={state.others} same={sameNameIds([entry, ...state.others])} dispatch={dispatch} />
        </CardBody>
        <EntryFooter entry={entry} flash={state.flash} onCopy={copy} onAction={onAction} />
      </CardRoot>
    )
  }
  if (view.kind === 'found' && entry) {
    return (
      <CardRoot>
        <CardHeader title={<BackButton onClick={() => dispatch({ type: 'back' })} />} pin={{ pinned }} onAction={onAction} />
        <CardBody ref={body}>
          <EntryText entry={entry} heading={<EntryTitle entry={entry} />} />
        </CardBody>
        <EntryFooter entry={entry} flash={state.flash} onCopy={copy} onAction={onAction} />
      </CardRoot>
    )
  }
  if (view.kind === 'found') {
    const same = sameNameIds(view.entries)
    return (
      <CardRoot>
        <CardHeader title={<HeaderCaption>{CARD_TEXT.found(view.entries.length + view.more)}</HeaderCaption>} pin={{ pinned }} onAction={onAction} />
        <CardBody ref={body}>
          <ul className="flex flex-col">
            {view.entries.map((e) => (
              <li key={e.id}>
                <EntryRow
                  entry={e}
                  hint={same.has(e.id) ? distinguishingAlias(e) : null}
                  chevron
                  onClick={() => dispatch({ type: 'open', id: e.id, listScroll: body.current?.scrollTop ?? 0 })}
                />
              </li>
            ))}
          </ul>
          {view.more > 0 ? <p className="px-2 pt-1 pb-1 text-small leading-5 text-balance break-keep text-fg-2">{CARD_TEXT.more(view.more)}</p> : null}
        </CardBody>
      </CardRoot>
    )
  }
  if (view.kind === 'none') {
    return (
      <CardRoot>
        <CardHeader title={<HeaderMessage>{view.query ? CARD_TEXT.noneQuery(view.query) : CARD_TEXT.noneText}</HeaderMessage>} onAction={onAction} />
        <CardHint>{CARD_TEXT.noneHint}</CardHint>
        <CardFooter>
          <FooterButton icon={<SearchIcon size={16} />} onClick={() => void onAction({ type: 'wiki-search', query: view.query })}>
            {CARD_TEXT.searchInPalette}
          </FooterButton>
        </CardFooter>
      </CardRoot>
    )
  }
  // 안내(note): 가져오지 못한 까닭과 다음 할 일(늘 한 줄). 클립보드에 글이 있으면 그 아래 [클립보드 글로 찾기]
  if (view.kind === 'note') {
    return (
      <CardRoot>
        <CardHeader title={<HeaderMessage>{view.message}</HeaderMessage>} onAction={onAction} />
        <CardHint>{noteHint(view.reason, view.canUseClipboard)}</CardHint>
        {view.canUseClipboard ? (
          <CardFooter>
            <FooterButton icon={<ClipboardPasteIcon size={16} />} onClick={() => void onAction({ type: 'wiki-clipboard' })}>
              {CARD_TEXT.useClipboard}
            </FooterButton>
          </CardFooter>
        ) : null}
      </CardRoot>
    )
  }
  // best인데 본문 항목이 없는 경우는 없다(초기 상태가 view.best로 채운다)
  return <CardRoot>{null}</CardRoot>
}

/** 카드 틀: 칸을 세로로 쌓고, 창이 작으면 스크롤 본문이 줄어든다(Flyout이 최대 높이를 정한다) */
function CardRoot({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <section data-card-root="" aria-label={CARD_TEXT.region} className="flex min-h-0 flex-auto flex-col">
      {children}
    </section>
  )
}

/** 머리 줄: 왼쪽 제목(또는 ‹ 목록), 오른쪽 [고정][닫기]. 단추 칸 28, 글자 시작 12 */
function CardHeader({ title, pin, onAction }: { title: ReactNode; pin?: { pinned: boolean }; onAction: CardSend }): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-start gap-1 p-1">
      <div className="min-w-0 flex-1">{title}</div>
      <div className="flex shrink-0">
        {pin ? (
          <IconButton
            label={CARD_TEXT.pin}
            title={pin.pinned ? CARD_TEXT.unpinHint : CARD_TEXT.pinHint}
            pressed={pin.pinned}
            onClick={() => void onAction({ type: 'wiki-pin', pinned: !pin.pinned })}
          >
            <PinIcon size={16} />
          </IconButton>
        ) : null}
        <IconButton label={CARD_TEXT.close} title={CARD_TEXT.close} onClick={() => void onAction({ type: 'close' })}>
          <XIcon size={16} />
        </IconButton>
      </div>
    </div>
  )
}

/** 머리 줄의 정사각 단추(28). 고정은 켜져 있으면 브랜드 색과 누른 바탕(색만이 아니라 aria-pressed·툴팁으로도 알린다) */
function IconButton({
  label,
  title,
  pressed,
  onClick,
  children
}: {
  label: string
  title: string
  pressed?: boolean
  onClick(): void
  children: ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      tabIndex={-1}
      // 툴팁과 이름이 같으면(닫기) 툴팁이 이름이 된다(화면 읽기 프로그램이 "닫기, 닫기"로 두 번 읽지 않게)
      aria-label={label === title ? undefined : label}
      aria-pressed={pressed}
      title={title}
      className={`grid size-7 place-items-center rounded-control transition-colors duration-(--dur-hover) active:transition-none ${
        pressed ? 'bg-row-selected text-brand' : 'text-fg-2 hover:bg-row-hover hover:text-fg active:bg-row-selected'
      }`}
      {...press(onClick)}
    >
      {children}
    </button>
  )
}

/** 용어 이름(16/600). 줄 높이 28로 머리 줄 단추(28)와 가운데를 맞춘다 */
function EntryTitle({ entry }: { entry: WikiCardEntry }): React.JSX.Element {
  return <h2 className="px-2 text-input leading-7 font-semibold text-balance break-keep wrap-break-word text-fg">{entry.term}</h2>
}

/** 목록 머리 글(메뉴 머리와 같은 12/600 --text-2, 줄 높이 28) */
function HeaderCaption({ children }: { children: ReactNode }): React.JSX.Element {
  return <h2 className="px-2 text-caption leading-7 font-semibold text-fg-2">{children}</h2>
}

/** 안내 카드의 제목(14/600): 무엇이 어떻게 됐는지 */
function HeaderMessage({ children }: { children: ReactNode }): React.JSX.Element {
  return <h2 className="px-2 py-1 text-body leading-5 font-semibold text-balance break-keep wrap-break-word text-fg">{children}</h2>
}

/** 안내 카드의 다음 할 일(13, --text-2) */
function CardHint({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="shrink-0 px-3 pb-3 text-small leading-5 text-balance break-keep text-fg-2">{children}</p>
}

/** ‹ 목록: 상세에서 목록으로 */
function BackButton({ onClick }: { onClick(): void }): React.JSX.Element {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={CARD_TEXT.backLabel}
      className="flex h-7 items-center gap-1 rounded-control pr-2 pl-1 text-caption leading-4 font-semibold text-fg-2 transition-colors duration-(--dur-hover) hover:bg-row-hover hover:text-fg active:bg-row-selected active:transition-none"
      {...press(onClick)}
    >
      <ChevronLeftIcon size={16} />
      {CARD_TEXT.back}
    </button>
  )
}

/** 스크롤 본문(긴 설명은 여기서 스크롤). data-card-scroll: 다 보일 높이를 잴 칸 */
function CardBody({ ref, children }: { ref?: Ref<HTMLDivElement>; children: ReactNode }): React.JSX.Element {
  return (
    <div ref={ref} data-card-scroll="" className="min-h-0 flex-auto overflow-y-auto px-1 pb-2">
      {children}
    </div>
  )
}

/** 별칭·출처(내 용어·가져온 용어만), 설명, 사용 예 */
function EntryText({ entry, heading }: { entry: WikiCardEntry; heading?: ReactNode }): React.JSX.Element {
  const source = entry.source === 'builtin' ? null : sourceLabel(entry.source)
  return (
    <div>
      {heading}
      {entry.aliases.length > 0 || source ? (
        // 별칭 하나는 한 덩어리(inline-block)로 두어 줄은 별칭 사이에서만 바뀐다. 구분점(·)은 앞 별칭 끝에 붙여 줄 첫머리에 오지 않게
        <p className="px-2 text-caption leading-4 break-keep wrap-break-word text-fg-2">
          {entry.aliases.map((alias, i) => (
            <span key={`${i}:${alias}`}>
              <span className="inline-block">{i < entry.aliases.length - 1 ? `${alias} ·` : alias}</span>{' '}
            </span>
          ))}
          {source ? <span className="inline-block rounded-full border border-line px-2 leading-3.5 text-fg-2">{source}</span> : null}
        </p>
      ) : null}
      <p className="px-2 pt-2 text-body leading-5.5 whitespace-pre-wrap text-pretty break-keep wrap-break-word text-fg">{entry.definition}</p>
      {entry.example ? (
        <div className="mx-2 mt-3 rounded-control bg-surface-inset px-3 py-2">
          <p className="text-caption leading-4 font-semibold text-fg-2">{CARD_TEXT.example}</p>
          <p className="pt-1 text-small leading-5 whitespace-pre-wrap break-keep wrap-break-word text-fg-2">{entry.example}</p>
        </div>
      ) : null}
    </div>
  )
}

/**
 * 다른 뜻·비슷한 용어: 누르면 본문이 그 항목으로 바뀌고 이전 본문이 그 자리로 온다.
 * same: 본문·후보 가운데 이름이 같은 항목(행에 구분 별칭을 붙인다)
 */
function Candidates({ others, same, dispatch }: { others: WikiCardEntry[]; same: Set<string>; dispatch(a: CardAction): void }): React.JSX.Element | null {
  const id = useId()
  if (others.length === 0) return null
  return (
    <div className="pt-3">
      <MenuSeparator />
      <h3 id={id} className="px-2 pt-2 pb-1 text-caption leading-4 font-semibold text-fg-2">
        {CARD_TEXT.others}
      </h3>
      <ul aria-labelledby={id} className="flex flex-col">
        {others.map((e) => (
          <li key={e.id}>
            <EntryRow entry={e} hint={same.has(e.id) ? distinguishingAlias(e) : null} onClick={() => dispatch({ type: 'choose', id: e.id })} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * 용어 행: 이름(14)과 설명 첫 줄(13, 한 줄). 목록 행은 오른쪽 › 로 상세가 열린다는 것을 알린다.
 * hint: 이름이 같은 다른 항목이 함께 보일 때 이름 뒤에 붙이는 구분 별칭("SIL  Safety Integrity Level")
 */
function EntryRow({ entry, hint = null, chevron = false, onClick }: { entry: WikiCardEntry; hint?: string | null; chevron?: boolean; onClick(): void }): React.JSX.Element {
  const id = useId()
  const firstLine = entry.definition.split('\n', 1)[0]
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-labelledby={`${id}-term`}
      aria-describedby={`${id}-line`}
      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-control px-2 py-2 text-left transition-colors duration-(--dur-hover) hover:bg-row-hover active:bg-row-selected active:transition-none"
      {...press(onClick)}
    >
      <span className="min-w-0">
        <span id={`${id}-term`} className="block text-body leading-5 break-keep wrap-break-word text-fg">
          {entry.term}
          {/* 위 맞춤: 13px 글자가 14px 줄의 기준선을 밀어 행이 1px 커지지 않게(행 높이 52 유지) */}
          {hint ? <span className="ml-2 inline-block align-top text-small leading-5 text-fg-2">{hint}</span> : null}
        </span>
        <span id={`${id}-line`} className="block truncate text-small leading-4 text-fg-2">
          {firstLine}
        </span>
      </span>
      {chevron ? <ChevronRightIcon size={16} className="text-fg-3" /> : null}
    </button>
  )
}

/** 아래 단추 줄(위에 1px --line). 좁으면 다음 줄로 넘어가 단추 글자가 잘리지 않는다 */
function CardFooter({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="flex shrink-0 flex-wrap items-center gap-1 border-t border-line p-1">{children}</div>
}

function FooterButton({ icon, title, className = '', onClick, children }: { icon: ReactNode; title?: string; className?: string; onClick(): void; children: ReactNode }): React.JSX.Element {
  return (
    <button
      type="button"
      tabIndex={-1}
      title={title}
      className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-control px-2 text-body leading-5 whitespace-nowrap text-fg transition-colors duration-(--dur-hover) hover:bg-row-hover active:bg-row-selected active:transition-none ${className}`}
      {...press(onClick)}
    >
      <span aria-hidden="true" className="grid place-items-center text-fg-2">
        {icon}
      </span>
      {children}
    </button>
  )
}

/** 복사하지 못한 결과의 글(용어가 없어짐 · 요청 실패) */
const COPY_PROBLEM: Record<'missing' | 'failed', string> = { missing: CARD_TEXT.missing, failed: CARD_TEXT.copyFailed }

/**
 * [설명 복사] [팔레트에서 열기]. 복사 결과는 1.5초 동안 글자와 아이콘만 바꿔 알린다(움직임 없음).
 * "설명 복사"와 "복사했어요"는 같은 칸에 겹쳐 두어 단추 너비가 바뀌지 않는다(옆 단추가 밀리지 않게).
 * 드물게 나오는 "지워진 용어예요"(그사이 용어가 지워짐)·"복사하지 못했어요"(요청 실패)는 그만큼 넓어진다.
 */
function EntryFooter({
  entry,
  flash,
  onCopy,
  onAction
}: {
  entry: WikiCardEntry
  flash: CardState['flash']
  onCopy(id: string): Promise<void>
  onAction: CardSend
}): React.JSX.Element {
  const copied = flash?.result === 'copied'
  const problem = flash && flash.result !== 'copied' ? COPY_PROBLEM[flash.result] : null
  return (
    <CardFooter>
      <FooterButton
        icon={copied ? <CheckIcon size={16} className="text-brand" /> : <CopyIcon size={16} />}
        onClick={() => void onCopy(entry.id)}
      >
        {problem ? (
          <span className="text-fg-2">{problem}</span>
        ) : (
          <span className="grid">
            <span className={`col-start-1 row-start-1 ${copied ? 'invisible' : ''}`}>{CARD_TEXT.copy}</span>
            <span className={`col-start-1 row-start-1 ${copied ? '' : 'invisible'}`}>{CARD_TEXT.copied}</span>
          </span>
        )}
      </FooterButton>
      <FooterButton
        icon={<OpenOutIcon size={16} />}
        title={CARD_TEXT.openInPaletteHint}
        className="ml-auto"
        onClick={() => void onAction({ type: 'wiki-open', id: entry.id })}
      >
        {CARD_TEXT.openInPalette}
      </FooterButton>
      {/* 화면 읽기 프로그램용 복사 결과(글자가 바뀐 것을 알린다) */}
      <span role="status" className="sr-only">
        {copied ? CARD_TEXT.copied : (problem ?? '')}
      </span>
    </CardFooter>
  )
}
