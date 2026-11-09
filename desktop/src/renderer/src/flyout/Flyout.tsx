import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import type { BarEdge } from '../../../shared/bar/bar-settings'
import { FLYOUT_MAX_HEIGHT, type FlyoutAction, type FlyoutContent, type FlyoutMessage, type FlyoutPad } from '../../../shared/flyout/flyout-content'
import { BarMenu } from './BarMenu'
import { flyoutReducer, initialFlyoutState } from './flyout-state'
import { Label } from './Label'
import { MaskingMenu } from './MaskingMenu'
import { WikiCard, type CardSend } from './WikiCard'
import { cardHeight } from './wiki-card-state'
import { WorkspaceMenu } from './WorkspaceMenu'

/** 펼침 창 표면(이름표·메뉴·카드 한 가족): --surface-flyout, 모서리 8, 1px --line 테두리(바와 같음) */
const SURFACE = 'rounded-window border border-line bg-surface-flyout'

/**
 * 그림자(--shadow-flyout, 펼침 창에만)는 바 쪽 면에서 흐림 반경(24)만큼 들인 판이 드리운다.
 * 창은 바 쪽 면에 그림자 여백이 없어(flyoutWindowRect) 표면이 그대로 드리우면 그림자가 창 끝에서 세로로 잘려 보인다.
 * 들인 판의 그림자는 표면의 바 쪽 끝에서 거의 0이 되므로 잘린 줄이 생기지 않는다. 좁은 이름표는 너비의 절반까지만 들인다.
 */
const SHADOW = 'rounded-window shadow-[var(--shadow-flyout)]'
const SHADOW_INSET = 'min(24px, 50%)'

/**
 * 너비: 이름표는 내용 너비(최대 240), 메뉴는 정해진 너비, 위키 카드는 설정의 카드 너비(content.width, 기본 360).
 * 창 크기와 상관없이 잰다. 위키 카드는 칸을 세로로 쌓아 창이 작으면 스크롤 본문이 줄어든다
 */
const WIDTH: Record<FlyoutContent['kind'], string> = {
  label: 'w-max max-w-60',
  'masking-menu': 'w-68',
  'workspace-menu': 'w-68',
  'bar-menu': 'w-68',
  'wiki-card': 'flex flex-col'
}

/**
 * 들어오는 움직임(§14-4): 이름표는 120ms 투명도만, 메뉴·카드는 200ms --ease-out 투명도 + 바 쪽에서 4 DIP.
 * 닫힘·바뀜에는 움직임이 없다(data-open을 떼면 transition도 함께 빠져 바로 사라진다). 움직임 줄이기면 전역 규칙으로 바로 보인다.
 * 카드 안의 바뀜(다른 후보·목록↔상세·복사 표시)에도 움직임이 없다.
 */
function motionClass(kind: FlyoutContent['kind'], open: boolean, instant: boolean, from: BarEdge): string {
  if (kind === 'label') {
    if (!open) return 'opacity-0'
    return instant ? 'opacity-100' : 'opacity-100 transition-opacity duration-(--dur-hover) ease-(--ease-out)'
  }
  if (!open) return `opacity-0 ${from === 'right' ? 'translate-x-1' : '-translate-x-1'}`
  return instant ? 'opacity-100 translate-x-0' : 'opacity-100 translate-x-0 transition-[opacity,translate] duration-(--dur-open) ease-(--ease-out)'
}

/**
 * 그린 크기(DIP). 창 크기는 정수 DIP로 맞추므로 올림(잘리지 않게).
 * 위키 카드는 칸(머리·스크롤 본문·아래 단추 줄) 높이를 더하되 본문은 다 보일 높이로 재고 최대 높이에서 자른다:
 * 창이 작아 카드가 눌려 있어도 바라는 높이를 알리므로, 알린 크기가 지금 창 크기에 끌려 작아지지 않는다.
 */
function measure(box: HTMLElement): { width: number; height: number } {
  const r = box.getBoundingClientRect()
  const root = box.querySelector<HTMLElement>('[data-card-root]')
  if (!root) return { width: Math.ceil(r.width), height: Math.ceil(r.height) }
  const blocks = Array.from(root.children, (el) => ({
    height: el.getBoundingClientRect().height,
    scrollHeight: el instanceof HTMLElement && el.dataset.cardScroll !== undefined ? el.scrollHeight : undefined
  }))
  return { width: Math.ceil(r.width), height: cardHeight(blocks) }
}

/**
 * 위키 카드의 최대 높이: 최대 높이(560)와 창 안에서 그림자 여백을 뺀 높이 중 작은 것.
 * 카드 상자는 절대 위치라 %는 창(미리 보기에서는 창 대신 그린 상자) 높이를 기준으로 한다.
 * 작업 영역이 낮아 main이 창을 줄이면 스크롤 본문이 줄고, 머리와 아래 단추는 그대로 보인다.
 */
const cardMaxHeight = (pad: FlyoutPad): string => `min(${FLYOUT_MAX_HEIGHT}px, calc(100% - ${pad.top + pad.bottom}px))`

/** #/flyout 창. main이 보낸 이름표·메뉴·위키 카드를 그리고, 그린 크기를 알린 뒤 shown을 받으면 들어온다. */
export function Flyout(): React.JSX.Element | null {
  const [state, dispatch] = useReducer(flyoutReducer, initialFlyoutState)

  useEffect(() => {
    let alive = true
    const api = window.sureMate
    // 구독을 먼저 걸고 지금 내용을 묻는다. 그 사이 도착한 새 내용을 옛 응답으로 덮지 않는다(flyoutReducer 'initial').
    const offContent = api.onFlyoutContent((message) => dispatch({ type: 'content', message, at: performance.now() }))
    const offShown = api.onFlyoutShown((seq) => dispatch({ type: 'shown', seq, at: performance.now() }))
    api
      .getFlyoutContent()
      .then((message) => {
        if (alive && message) dispatch({ type: 'initial', message })
      })
      .catch(() => {
        // 내용은 main이 다시 보낸다(onFlyoutContent). 여기서 할 일은 없다.
      })
    // 한글 글꼴을 미리 불러 둔다. 첫 이름표를 잰 뒤 글꼴이 바뀌어 크기가 어긋나지 않게.
    document.fonts.load('12px "Pretendard Variable"', '가').catch(() => {})
    return () => {
      alive = false
      offContent()
      offShown()
    }
  }, [])

  // 메뉴 행·카드 단추를 빠르게 두 번 눌러도 한 번만 보낸다(main이 처리하고 메뉴를 닫는다).
  // 결과는 main의 답(true/false), 요청 자체가 거부되면 'failed', 앞 동작을 처리하는 중이라 보내지 않았으면 null
  const busy = useRef(false)
  const act = useCallback<CardSend>((a: FlyoutAction) => {
    if (busy.current) return Promise.resolve(null)
    busy.current = true
    return window.sureMate
      .flyoutAction(a)
      .catch((): 'failed' => 'failed')
      .finally(() => {
        busy.current = false
      })
  }, [])

  const message = state.message
  if (!message) return null
  return <FlyoutBox message={message} open={state.open} instant={state.instant} onAction={act} />
}

function FlyoutBox({
  message,
  open,
  instant,
  onAction
}: {
  message: FlyoutMessage
  open: boolean
  instant: boolean
  onAction: CardSend
}): React.JSX.Element {
  const api = window.sureMate
  const box = useRef<HTMLDivElement>(null)
  const { seq, content, pad } = message

  // 지금 seq로 그린 크기를 알린다. 위키 카드는 카드 안에서 본문이 바뀔 때도 부른다(같은 seq로 다시 알림)
  const report = useCallback((): void => {
    const el = box.current
    if (!el) return
    const size = measure(el)
    api.flyoutReady(seq, size.width, size.height)
  }, [api, seq])

  // 새 내용을 그린 직후 크기를 재 알린다. 여백(pad)만 바뀐 같은 seq는 다시 알리지 않는다.
  useLayoutEffect(() => {
    let cancelled = false
    const run = (): void => {
      if (!cancelled) report()
    }
    if (document.fonts.status === 'loaded') run()
    else void document.fonts.ready.then(run)
    return () => {
      cancelled = true
    }
  }, [report])

  // 바가 있는 쪽은 main이 알려 준다(여백에서 짐작하면 여백이 모두 0일 때 반대로 짐작한다)
  const side = message.edge
  const card = content.kind === 'wiki-card'
  return (
    <div
      ref={box}
      data-open={open ? '' : undefined}
      className={`absolute isolate ${WIDTH[content.kind]} ${motionClass(content.kind, open, instant, side)}`}
      style={card ? { left: pad.left, top: pad.top, width: content.width, maxHeight: cardMaxHeight(pad) } : { left: pad.left, top: pad.top }}
      onMouseEnter={() => api.flyoutPointer(true)}
      onMouseLeave={() => api.flyoutPointer(false)}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 -z-10 ${SHADOW}`}
        style={side === 'right' ? { left: 0, right: SHADOW_INSET } : { left: SHADOW_INSET, right: 0 }}
      />
      {/* 표면과 테두리는 덧그린 판이라 크기(4의 배수)에 더하지 않는다(바와 같은 방법) */}
      <span aria-hidden="true" className={`pointer-events-none absolute inset-0 -z-10 ${SURFACE}`} />
      <Content content={content} onAction={onAction} onResize={report} />
    </div>
  )
}

function Content({ content, onAction, onResize }: { content: FlyoutContent; onAction: CardSend; onResize(): void }): React.JSX.Element {
  switch (content.kind) {
    case 'label':
      return <Label text={content.text} />
    case 'masking-menu':
      return <MaskingMenu mode={content.mode} onAction={onAction} />
    case 'workspace-menu':
      return <WorkspaceMenu workspaces={content.workspaces} canSave={content.canSave} />
    case 'bar-menu':
      return <BarMenu shape={content.shape} onAction={onAction} />
    case 'wiki-card':
      // 조회마다 새 카드 번호라 새 화면으로 만든다(앞 카드의 스크롤·타이머가 남지 않게). 고정만 바뀌면 같은 번호라 그대로
      return <WikiCard key={content.cardId} content={content} onAction={onAction} onResize={onResize} />
  }
}
