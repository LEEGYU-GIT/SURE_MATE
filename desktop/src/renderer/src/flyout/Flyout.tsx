import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import type { FlyoutAction, FlyoutContent, FlyoutMessage, FlyoutPad } from '../../../shared/flyout/flyout-content'
import { BarMenu } from './BarMenu'
import { flyoutReducer, initialFlyoutState } from './flyout-state'
import { Label } from './Label'
import { MaskingMenu } from './MaskingMenu'
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

/** 너비: 이름표는 내용 너비(최대 240), 메뉴는 정해진 너비. 창 크기와 상관없이 잰다 */
const WIDTH: Record<Exclude<FlyoutContent['kind'], 'wiki-card'>, string> = {
  label: 'w-max max-w-60',
  'masking-menu': 'w-68',
  'workspace-menu': 'w-68',
  'bar-menu': 'w-68'
}

/** 펼침 창이 그리는 내용(위키 카드는 Task 12에서 더한다) */
type ShownContent = Exclude<FlyoutContent, { kind: 'wiki-card' }>

/**
 * 들어오는 움직임(§14-4): 이름표는 120ms 투명도만, 메뉴는 200ms --ease-out 투명도 + 바 쪽에서 4 DIP.
 * 닫힘·바뀜에는 움직임이 없다(data-open을 떼면 transition도 함께 빠져 바로 사라진다). 움직임 줄이기면 전역 규칙으로 바로 보인다.
 */
function motionClass(kind: ShownContent['kind'], open: boolean, instant: boolean, from: 'left' | 'right'): string {
  if (kind === 'label') {
    if (!open) return 'opacity-0'
    return instant ? 'opacity-100' : 'opacity-100 transition-opacity duration-(--dur-hover) ease-(--ease-out)'
  }
  if (!open) return `opacity-0 ${from === 'right' ? 'translate-x-1' : '-translate-x-1'}`
  return instant ? 'opacity-100 translate-x-0' : 'opacity-100 translate-x-0 transition-[opacity,translate] duration-(--dur-open) ease-(--ease-out)'
}

/** 바가 있는 쪽: 그림자 여백이 없는 면(오른쪽 바면 오른쪽) */
const barSide = (pad: FlyoutPad): 'left' | 'right' => (pad.left === 0 && pad.right > 0 ? 'left' : 'right')

/** #/flyout 창. main이 보낸 이름표·메뉴를 그리고, 그린 크기를 알린 뒤 shown을 받으면 들어온다. */
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

  // 메뉴 행을 빠르게 두 번 눌러도 한 번만 보낸다(main이 처리하고 메뉴를 닫는다)
  const busy = useRef(false)
  const act = useCallback((a: FlyoutAction): void => {
    if (busy.current) return
    busy.current = true
    window.sureMate
      .flyoutAction(a)
      .catch(() => false)
      .finally(() => {
        busy.current = false
      })
  }, [])

  const message = state.message
  if (!message || message.content.kind === 'wiki-card') return null
  return <FlyoutBox message={message as FlyoutMessage & { content: ShownContent }} open={state.open} instant={state.instant} onAction={act} />
}

function FlyoutBox({
  message,
  open,
  instant,
  onAction
}: {
  message: FlyoutMessage & { content: ShownContent }
  open: boolean
  instant: boolean
  onAction(a: FlyoutAction): void
}): React.JSX.Element {
  const api = window.sureMate
  const box = useRef<HTMLDivElement>(null)
  const { seq, content, pad } = message

  // 새 내용을 그린 직후 크기를 재 알린다. 여백(pad)만 바뀐 같은 seq는 다시 알리지 않는다.
  useLayoutEffect(() => {
    let cancelled = false
    const report = (): void => {
      const el = box.current
      if (cancelled || !el) return
      const r = el.getBoundingClientRect()
      // 창 크기는 정수 DIP로 맞추므로 올림(잘리지 않게)
      api.flyoutReady(seq, Math.ceil(r.width), Math.ceil(r.height))
    }
    if (document.fonts.status === 'loaded') report()
    else void document.fonts.ready.then(report)
    return () => {
      cancelled = true
    }
  }, [api, seq])

  const side = barSide(pad)
  return (
    <div
      ref={box}
      data-open={open ? '' : undefined}
      className={`absolute isolate ${WIDTH[content.kind]} ${motionClass(content.kind, open, instant, side)}`}
      style={{ left: pad.left, top: pad.top }}
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
      <Content content={content} onAction={onAction} />
    </div>
  )
}

function Content({ content, onAction }: { content: ShownContent; onAction(a: FlyoutAction): void }): React.JSX.Element {
  switch (content.kind) {
    case 'label':
      return <Label text={content.text} />
    case 'masking-menu':
      return <MaskingMenu mode={content.mode} onAction={onAction} />
    case 'workspace-menu':
      return <WorkspaceMenu workspaces={content.workspaces} canSave={content.canSave} />
    case 'bar-menu':
      return <BarMenu shape={content.shape} onAction={onAction} />
  }
}
