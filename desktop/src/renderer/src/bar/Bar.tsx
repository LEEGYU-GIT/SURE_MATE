import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { BarItem, BarViewState } from '../../../shared/bar/bar-items'
import { BAR_METRICS } from '../../../shared/bar/bar-layout'
import type { MaskingMode } from '../../../shared/types'
import { LetterIcon, ListChecksIcon, NotebookPenIcon, PetIcon, ScanSearchIcon, SettingsIcon, ShieldIcon, ShieldOffIcon, WikiIcon, WorkspaceIcon } from '../design/icons'
import { barFrameStyle, createDragReporter, maskingLook, promptIcon, shouldSendBarClick, type PromptIconName } from './bar-view'

type Shape = BarViewState['shape']

/**
 * 모양별 그림 크기(DIP). 칸·간격·여백은 BAR_METRICS에서만 온다.
 * 아이콘은 24 격자를 띠 24·캡슐 20으로 그린다. 가명 처리 끔은 아래에 "끔"을 넣으려고 4 작게 그린다.
 * 로고는 띠에서는 띠 모서리와 같은 8, 캡슐에서는 캡슐처럼 완전히 둥글게.
 */
const LOOK = {
  edge: { icon: 24, iconWithCaption: 20, logo: 32, logoShape: 'rounded-window', logoText: 'text-title', letterText: 'text-small', rule: 24 },
  capsule: { icon: 20, iconWithCaption: 16, logo: 28, logoShape: 'rounded-full', logoText: 'text-input', letterText: 'text-caption', rule: 20 }
} as const satisfies Record<Shape, unknown>

type Look = (typeof LOOK)[Shape]

/** 투명도 설정은 배경에만 곱한다(아이콘·상태 점은 그대로) */
const BAR_BACKGROUND = 'color-mix(in srgb, var(--surface-bar) calc(var(--bar-opacity) * 100%), transparent)'

const PROMPT_ICONS: Record<PromptIconName, typeof NotebookPenIcon> = {
  'notebook-pen': NotebookPenIcon,
  'list-checks': ListChecksIcon,
  'scan-search': ScanSearchIcon
}

/** #/bar 창. main이 보낸 바 상태를 그린다. */
export function Bar(): React.JSX.Element | null {
  const [state, setState] = useState<BarViewState | null>(null)

  useEffect(() => {
    let alive = true
    // 구독을 먼저 걸고 지금 상태를 묻는다. 그 사이 도착한 새 상태를 옛 응답으로 덮지 않는다.
    const off = window.sureMate.onBarState((s) => setState(s))
    window.sureMate
      .getBarState()
      .then((s) => {
        if (alive && s) setState((cur) => cur ?? s)
      })
      .catch(() => {
        // 바 상태는 main이 다시 보낸다(onBarState). 여기서 할 일은 없다.
      })
    return () => {
      alive = false
      off()
    }
  }, [])

  return state ? <BarView state={state} /> : null
}

/**
 * 바 한 개. 항목은 포커스를 받지 않는 단추이고(바 창도 포커스를 받지 않는다), 누르기에는 움직임을 두지 않는다.
 * 빈 곳을 끌면 바를 위아래로 옮기고, 오른쪽 클릭은 바 메뉴다.
 * 창이 손잡이 너비로 줄면(자동 숨김) 손잡이만 그린다.
 */
export function BarView({ state }: { state: BarViewState }): React.JSX.Element {
  const api = window.sureMate
  const look = LOOK[state.shape]
  const [dragging, setDragging] = useState(false)
  const drag = useMemo(
    () =>
      createDragReporter((phase, y) => window.sureMate.barDrag(phase, y), {
        request: (cb) => requestAnimationFrame(cb),
        cancel: (id) => cancelAnimationFrame(id)
      }),
    []
  )
  useEffect(() => () => drag.dispose(), [drag])

  const endDrag = (e: ReactPointerEvent): void => {
    if (!drag.active()) return
    drag.end(e.screenY)
    setDragging(false)
  }

  const frameStyle = {
    ...barFrameStyle(state),
    gap: BAR_METRICS.gap,
    paddingBlock: BAR_METRICS[state.shape].padY,
    background: BAR_BACKGROUND,
    '--bar-hover-scale': String(BAR_METRICS.hoverScale)
  } as CSSProperties
  const right = state.edge === 'right'
  // 화면 쪽 면에는 테두리를 두지 않는다(띠). 캡슐은 네 면 모두.
  const borderSides = state.shape === 'capsule' ? 'border' : right ? 'border-y border-l' : 'border-y border-r'

  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label="Sure-Mate 바"
      className={`@container relative flex h-full w-full overflow-hidden ${right ? 'justify-end' : 'justify-start'} ${dragging ? 'cursor-grabbing' : ''}`}
      onMouseEnter={() => api.barPointer(true)}
      onMouseLeave={() => api.barPointer(false)}
      onContextMenu={(e) => {
        e.preventDefault()
        api.barContextMenu(e.clientY)
      }}
      onPointerDown={(e) => {
        // 항목 위가 아닌 빈 곳만 끈다. 들어가 있는 동안(손잡이)은 끌지 않는다(main도 무시한다).
        if (e.button !== 0 || state.collapsed || (e.target as Element).closest('button')) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
        drag.start(e.screenY)
      }}
      onPointerMove={(e) => {
        if (drag.active()) drag.move(e.screenY)
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
    >
      <div
        className={`relative flex h-full shrink-0 flex-col items-center transition-transform duration-(--dur-slide) ease-(--ease-out) @max-[12px]:invisible ${
          state.collapsed ? (right ? 'translate-x-full' : '-translate-x-full') : 'translate-x-0'
        }`}
        style={frameStyle}
      >
        <span aria-hidden="true" className={`pointer-events-none absolute inset-0 border-line [border-radius:inherit] ${borderSides}`} />
        {state.items.map((item) =>
          item.kind === 'separator' ? (
            <div key={item.id} role="separator" className="grid shrink-0 place-items-center" style={{ height: BAR_METRICS.separator }}>
              <span className="block h-px bg-line" style={{ width: look.rule }} />
            </div>
          ) : (
            <ItemButton key={item.id} item={item} shape={state.shape} busy={state.busyItem === item.id} />
          )
        )}
      </div>
      <Handle right={right} opacity={state.opacity} />
    </div>
  )
}

function ItemButton({ item, shape, busy }: { item: Exclude<BarItem, { kind: 'separator' }>; shape: Shape; busy: boolean }): React.JSX.Element {
  const api = window.sureMate
  const cell = BAR_METRICS[shape].cell
  // 캡슐만 마우스를 올린 아이콘을 1.15배로 키운다(움직임 줄이기면 키우지 않음). 바탕은 두 모양 모두 같다.
  const grow = shape === 'capsule' ? 'transition-transform duration-(--dur-hover) ease-(--ease-out) motion-safe:group-hover:scale-(--bar-hover-scale)' : ''
  // 실행 중: 흐린 맥박(움직임 줄이기면 흐리게만). 펫 숨김의 흐림은 PetIcon이 몸에만 건다.
  const pulse = busy ? 'animate-pulse motion-reduce:animate-none' : ''
  const dim = busy ? 'opacity-70' : ''
  // 마우스 올림 바탕은 바 아이콘 모서리 4. 로고만 로고 모양을 따른다(띠 8, 캡슐 원)
  const tile = item.kind === 'logo' ? LOOK[shape].logoShape : 'rounded-control'
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={item.label}
      aria-busy={busy || undefined}
      className={`group grid shrink-0 place-items-center ${tile} transition-colors duration-(--dur-hover) hover:bg-row-hover active:bg-row-selected active:transition-none ${busy ? 'cursor-progress' : ''}`}
      style={{ width: cell, height: cell }}
      onMouseEnter={() => api.barHover(item.id)}
      onMouseLeave={() => api.barHover(null)}
      onClick={(e) => {
        // 두 번 클릭의 두 번째 클릭은 보내지 않는다(shouldSendBarClick)
        if (shouldSendBarClick(e.detail)) api.barAction(item.id)
      }}
    >
      <span className={`grid place-items-center ${grow} ${pulse}`}>
        <span className={`grid place-items-center text-fg ${dim}`}>
          <ItemIcon item={item} look={LOOK[shape]} />
        </span>
      </span>
    </button>
  )
}

function ItemIcon({ item, look }: { item: Exclude<BarItem, { kind: 'separator' }>; look: Look }): React.JSX.Element {
  switch (item.kind) {
    case 'logo':
      return (
        <span
          aria-hidden="true"
          className={`grid place-items-center bg-brand leading-none font-semibold text-ink ${look.logoShape} ${look.logoText}`}
          style={{ width: look.logo, height: look.logo }}
        >
          S
        </span>
      )
    case 'masking':
      return <MaskingGlyph mode={item.mode} look={look} />
    case 'prompt': {
      const name = promptIcon(item.templateId)
      if (!name) return <LetterIcon letter={item.glyph} size={look.icon} letterClassName={look.letterText} />
      const Icon = PROMPT_ICONS[name]
      return <Icon size={look.icon} />
    }
    case 'workspace':
      return <WorkspaceIcon size={look.icon} />
    case 'glossary':
      return <WikiIcon size={look.icon} />
    case 'pet':
      return <PetIcon size={look.icon} off={!item.visible} />
    case 'settings':
      return <SettingsIcon size={look.icon} />
  }
}

/**
 * 가명 처리: 켬은 방패 + 청록 점, 끔은 끊긴 방패 + 주황 점 + 아래 "끔"(색만으로 알리지 않는다, §14-4).
 * "끔"은 --warn 바탕에 --ink 글자(대비 약 7.8:1)라 바 투명도를 낮춰 밝은 화면 위에 있어도 읽힌다.
 */
function MaskingGlyph({ mode, look }: { mode: MaskingMode; look: Look }): React.JSX.Element {
  const m = maskingLook(mode)
  const badge = m.dot === 'warn' ? 'var(--warn)' : 'var(--brand)'
  if (m.caption === null) return <ShieldIcon size={look.icon} badge={badge} />
  return (
    <span className="flex flex-col items-center gap-0.5">
      <ShieldOffIcon size={look.iconWithCaption} badge={badge} />
      <span aria-hidden="true" className="rounded-full bg-warn px-1 text-caption leading-3.5 font-semibold text-ink">
        {m.caption}
      </span>
    </span>
  )
}

/** 자동 숨김 손잡이(6 DIP 창). 바깥쪽 면은 화면 끝에 붙고 안쪽 끝만 둥글다. 가운데 짧은 손잡이 표시 */
function Handle({ right, opacity }: { right: boolean; opacity: number }): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-y-0 hidden w-full border-y border-line @max-[12px]:block ${right ? 'right-0 rounded-l-full border-l' : 'left-0 rounded-r-full border-r'}`}
      style={{ background: BAR_BACKGROUND, '--bar-opacity': String(opacity) } as CSSProperties}
    >
      <span className="absolute top-1/2 left-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg-3" />
    </div>
  )
}
