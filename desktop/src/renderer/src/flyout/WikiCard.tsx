import { useEffect, useReducer, useRef, type ReactNode } from 'react'
import type { FlyoutAction, WikiCardEntry, WikiCardView } from '../../../shared/flyout/flyout-content'
import { ChevronLeftIcon, PinIcon, WikiIcon, XIcon } from '../design/icons'
import { cardReducer, flashCopied, initialCardState, type CardAction, type CardState } from './wiki-card-state'

// 선택 글 위키 카드(설계 문서 §9). 표면·모서리·그림자는 Flyout이 그리고(이름표·메뉴와 같은 가족), 여기서는 안쪽만 그린다.
// - 머리(높이 36): 용어 사전 표시 또는 ‹ 목록 | 고정, 닫기. 몸통은 카드 최대 높이 안에서 스크롤, 아래 단추 줄은 늘 보인다.
// - 글자: 용어 16/600, 별칭 12, 설명 14(줄 22), 사용 예 13(옅은 상자), 구역 머리 12/600, 행 제목 14·설명 13.
// - 흐린 글자는 --text-2(이 바탕에서 --text-3은 흰 화면 위 4.5:1 미만, Menu.tsx와 같은 규칙).
// - 펼침 창은 포커스를 받지 않으므로 단추는 tabIndex -1(마우스만). 누를 때 움직임은 없다.

type Act = (a: FlyoutAction) => Promise<boolean>

const firstLine = (s: string): string => s.split('\n', 1)[0] ?? ''

/** 긴 낱말(경로·주소)은 아무 데서나 끊고, 한글은 낱말 중간에서 끊지 않는다 */
const WRAP = 'break-keep [overflow-wrap:anywhere]'

export function WikiCard({ view, pinned, maxHeight, onAction }: { view: WikiCardView; pinned: boolean; maxHeight: number; onAction: Act }): React.JSX.Element {
  const [s, dispatch] = useReducer(cardReducer, view, initialCardState)
  const alive = useRef(true)
  const stopFlash = useRef<(() => void) | null>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      stopFlash.current?.()
    }
  }, [])

  const copy = (id: string): void => {
    void onAction({ type: 'wiki-copy', id }).then((ok) => {
      if (!ok || !alive.current) return
      stopFlash.current?.()
      stopFlash.current = flashCopied(dispatch)
    })
  }

  const current = s.current
  const inList = s.view.kind === 'found'
  return (
    <section aria-label="용어 사전" className="flex flex-col" style={{ maxHeight }}>
      <header className="flex h-9 shrink-0 items-center gap-1 pr-1 pl-3">
        {inList && current ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => dispatch({ type: 'back' })}
            className="-ml-1.5 flex h-7 items-center gap-0.5 rounded-control pr-2 pl-0.5 text-small text-fg-2 transition-colors duration-(--dur-hover) hover:bg-row-hover hover:text-fg active:bg-row-selected active:transition-none"
          >
            <ChevronLeftIcon size={16} />
            목록
          </button>
        ) : (
          <span className="flex items-center gap-2 text-caption leading-4 font-semibold text-fg-2">
            <WikiIcon size={16} className="text-brand" />
            용어 사전
          </span>
        )}
        <span className="ml-auto" />
        <IconButton label={pinned ? '고정 풀기' : '카드 고정'} pressed={pinned} onClick={() => void onAction({ type: 'wiki-pin', pinned: !pinned })}>
          <PinIcon size={16} filled={pinned} className={pinned ? 'text-brand' : undefined} />
        </IconButton>
        <IconButton label="닫기" onClick={() => void onAction({ type: 'close' })}>
          <XIcon size={16} />
        </IconButton>
      </header>

      {/* 다른 용어를 열면 몸통을 새로 그려 스크롤을 맨 위로 */}
      <div key={current?.id ?? 'list'} className="min-h-0 flex-1 overflow-y-auto px-3 pt-0.5 pb-3">
        <Body state={s} dispatch={dispatch} />
      </div>

      <Footer view={s.view} current={current} copied={s.copied} onCopy={copy} onAction={onAction} />
    </section>
  )
}

function Body({ state: s, dispatch }: { state: CardState; dispatch: (a: CardAction) => void }): React.JSX.Element {
  const v = s.view
  if (s.current) {
    return (
      <>
        <EntryDetail entry={s.current} />
        {s.others.length > 0 ? (
          <div className="mt-3 border-t border-line pt-2">
            <SectionHead>다른 뜻·비슷한 용어</SectionHead>
            <div className="-mx-2 flex flex-col">
              {s.others.map((o) => (
                <EntryRow key={o.id} entry={o} onClick={() => dispatch({ type: 'pick-other', id: o.id })} />
              ))}
            </div>
          </div>
        ) : null}
      </>
    )
  }
  if (v.kind === 'found') {
    return (
      <>
        <SectionHead>이 글에 나온 용어 {v.entries.length + v.more}개</SectionHead>
        <div className="-mx-2 flex flex-col">
          {v.entries.map((e) => (
            <EntryRow key={e.id} entry={e} onClick={() => dispatch({ type: 'open-entry', id: e.id })} />
          ))}
        </div>
        {v.more > 0 ? <p className="pt-1 text-caption leading-4 text-fg-2">처음 나온 {v.entries.length}개만 보여 줘요</p> : null}
      </>
    )
  }
  if (v.kind === 'none') {
    return (
      <Message
        title={v.query ? `‘${v.query}’에 맞는 용어가 없어요` : '이 글에 나온 용어가 없어요'}
        hint="팔레트에서 비슷한 용어를 찾거나 직접 추가할 수 있어요"
      />
    )
  }
  if (v.kind === 'note') {
    return <Message title={v.message} hint={v.canUseClipboard ? '클립보드에 복사해 둔 글로 대신 찾을 수 있어요' : '찾을 글을 선택하거나 복사한 뒤 다시 눌러 주세요'} />
  }
  // best 카드는 늘 본문이 있다(initialCardState)
  return <></>
}

function EntryDetail({ entry }: { entry: WikiCardEntry }): React.JSX.Element {
  return (
    <article className="flex flex-col gap-2">
      <div>
        <h2 className={`text-input leading-6 font-semibold text-fg ${WRAP}`}>{entry.term}</h2>
        {entry.aliases.length > 0 ? <p className={`text-caption leading-4 text-fg-2 ${WRAP}`}>{entry.aliases.join(' · ')}</p> : null}
      </div>
      <p className={`text-body leading-[22px] whitespace-pre-wrap text-fg ${WRAP}`}>{entry.definition}</p>
      {entry.example ? (
        <div className="rounded-control bg-surface-inset px-2.5 py-2">
          <p className="text-caption leading-4 font-semibold text-fg-2">사용 예</p>
          <p className={`mt-0.5 text-small leading-5 whitespace-pre-wrap text-fg-2 ${WRAP}`}>{entry.example}</p>
        </div>
      ) : null}
    </article>
  )
}

/** 용어 한 행(높이 52): 용어 이름과 설명 첫 줄. 누르면 카드 본문이 그 용어로 바뀐다 */
function EntryRow({ entry, onClick }: { entry: WikiCardEntry; onClick(): void }): React.JSX.Element {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      className="flex w-full min-w-0 flex-col items-start rounded-control px-2 py-2 text-left transition-colors duration-(--dur-hover) hover:bg-row-hover active:bg-row-selected active:transition-none"
    >
      <span className="w-full truncate text-body leading-5 text-fg">{entry.term}</span>
      <span className="w-full truncate text-small leading-4 text-fg-2">{firstLine(entry.definition)}</span>
    </button>
  )
}

function SectionHead({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="pb-1 text-caption leading-4 font-semibold text-fg-2">{children}</p>
}

function Message({ title, hint }: { title: string; hint: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1 pt-1">
      <p className={`text-body leading-[22px] text-fg ${WRAP}`}>{title}</p>
      <p className={`text-small leading-5 text-fg-2 ${WRAP}`}>{hint}</p>
    </div>
  )
}

function Footer({
  view,
  current,
  copied,
  onCopy,
  onAction
}: {
  view: WikiCardView
  current: WikiCardEntry | null
  copied: boolean
  onCopy(id: string): void
  onAction: Act
}): React.JSX.Element | null {
  let buttons: ReactNode = null
  if (current) {
    buttons = (
      <>
        <FooterButton primary onClick={() => onCopy(current.id)}>
          {/* 두 글을 한 칸에 겹쳐 두어 '복사했어요'로 바뀌어도 단추 너비가 그대로다(움직임 없이 글자만 바뀐다) */}
          <span className="grid">
            <span className={`col-start-1 row-start-1 ${copied ? 'invisible' : ''}`}>설명 복사</span>
            <span aria-hidden="true" className={`col-start-1 row-start-1 ${copied ? '' : 'invisible'}`}>
              복사했어요
            </span>
          </span>
        </FooterButton>
        <FooterButton onClick={() => void onAction({ type: 'wiki-open', id: current.id })}>팔레트에서 열기</FooterButton>
      </>
    )
  } else if (view.kind === 'none') {
    buttons = (
      <FooterButton primary onClick={() => void onAction({ type: 'wiki-search', query: view.query })}>
        팔레트에서 찾기
      </FooterButton>
    )
  } else if (view.kind === 'note') {
    buttons = (
      <>
        {view.canUseClipboard ? (
          <FooterButton primary onClick={() => void onAction({ type: 'wiki-clipboard' })}>
            클립보드 글로 찾기
          </FooterButton>
        ) : null}
        <FooterButton primary={!view.canUseClipboard} onClick={() => void onAction({ type: 'wiki-search', query: '' })}>
          팔레트에서 찾기
        </FooterButton>
      </>
    )
  }
  if (!buttons) return null
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2">
      {buttons}
      {/* 화면 읽기 프로그램에 복사 결과를 알린다 */}
      <span role="status" className="sr-only">
        {copied ? '설명을 복사했어요' : ''}
      </span>
    </div>
  )
}

function FooterButton({ primary = false, onClick, children }: { primary?: boolean; onClick(): void; children: ReactNode }): React.JSX.Element {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      className={`h-8 shrink-0 rounded-control px-3 text-small font-semibold whitespace-nowrap transition-colors duration-(--dur-hover) active:transition-none ${
        // 진한 청록 위에도 --ink 글자(5:1 이상). 밝은 글자는 3:1이라 쓰지 않는다
        primary ? 'bg-brand text-ink hover:bg-brand-strong' : 'border border-line text-fg hover:bg-row-hover active:bg-row-selected'
      }`}
    >
      {children}
    </button>
  )
}

function IconButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick(): void; children: ReactNode }): React.JSX.Element {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-control text-fg-2 transition-colors duration-(--dur-hover) hover:bg-row-hover hover:text-fg active:bg-row-selected active:transition-none"
    >
      {children}
    </button>
  )
}
