import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { Rect } from '../../../shared/types'
import type { SavedLayout } from '../../../shared/workspace/types'
import { previewHeight, previewLayout, taskbarRects } from './monitor-preview'

/** 그림 안 여백과 높이 범위(DIP). 가로로 놓인 모니터 두 대는 낮게, 위아래로 놓이면 상한까지 */
const PAD = 12
const MIN_H = 96
const MAX_H = 200
/** 창 위쪽 띠(제목 줄)와 최대화 표시를 그릴 만큼 큰 창 */
const TITLE_BAR = 3
const MAX_MARK = { minWidth: 24, minHeight: 16, size: 6 }
/** 모니터 이름표(글자 12, 줄 16): 보통 모니터 아래 가운데. 아래에 다른 모니터가 있으면(위아래로 놓임) 모니터 안 왼쪽 위 */
const LABEL = { height: 16, gap: 4 }

/** 부모 너비(DIP)를 따라간다. 처음 그릴 때는 fallback */
function useWidth(fallback: number): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => setWidth(Math.max(0, Math.round(el.getBoundingClientRect().width)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, width: Math.max(0, r.width - 2 * d), height: Math.max(0, r.height - 2 * d) })

/**
 * 모니터 그림 위 창 사각형(설계 §11). 모니터는 --surface-inset 바탕·--line 테두리(작업 표시줄 자리는 --line 띠),
 * 창은 --text-3, 포함하지 않은 창은 점선, 고른 줄의 창은 --brand로 맨 위에 그린다. 최대화한 창은 오른쪽 위에 네모(Windows의
 * 최대화 단추 모양). 움직임은 없다(설정형 화면). 키보드로는 창 목록을 쓰고, 그림은 마우스로 줄을 찾는 보조 수단이다.
 */
export function MonitorPreview({
  layout,
  active,
  summary,
  onHover,
  onPick
}: {
  layout: SavedLayout
  /** 강조할 창 규칙(고른 줄) */
  active: string | null
  /** 화면 읽기 프로그램용 한 줄 요약 */
  summary: string
  /** 마우스가 창 위에 오면 그 줄을 고른다 */
  onHover(ruleId: string): void
  /** 창을 누르면 그 줄로 포커스를 옮긴다 */
  onPick(ruleId: string): void
}): React.JSX.Element {
  const [ref, width] = useWidth(248)
  const id = useId()
  const height = previewHeight(layout, width, { pad: PAD, min: MIN_H, max: MAX_H })
  const p = previewLayout(layout, { width, height }, PAD)
  const monitorOf = new Map(layout.windows.map((w) => [w.id, w.target.monitor]))
  const clipOf = (key: string): string => `${id}-clip-${layout.monitors.findIndex((m) => m.key === key)}`
  // 고른 창은 겹쳐 가려져도 보이게 맨 위에 다시 그린다
  const ordered = [...p.windows.filter((w) => w.ruleId !== active), ...p.windows.filter((w) => w.ruleId === active)]
  const labels = p.monitors.map((m) => {
    const top = m.rect.y + m.rect.height + LABEL.gap
    const blocked = p.monitors.some(
      (o) => o !== m && o.rect.x < m.rect.x + m.rect.width && o.rect.x + o.rect.width > m.rect.x && o.rect.y < top + LABEL.height && o.rect.y + o.rect.height > top
    )
    return { key: m.key, label: m.label, below: !blocked, x: blocked ? m.rect.x + 4 : m.rect.x + m.rect.width / 2, y: blocked ? m.rect.y + TITLE_BAR + 4 : top }
  })
  // 아래 이름표가 그림 밖으로 나가면 그만큼 높인다
  const boxHeight = Math.ceil(Math.max(height, ...labels.filter((l) => l.below).map((l) => l.y + LABEL.height + 2)))

  return (
    <div ref={ref} className="relative w-full" style={{ height: boxHeight }}>
      <svg width={width} height={boxHeight} viewBox={`0 0 ${width} ${boxHeight}`} role="img" aria-label={summary} className="block">
        <defs>
          {p.monitors.map((m) => (
            <clipPath key={m.key} id={clipOf(m.key)}>
              <rect x={m.rect.x} y={m.rect.y} width={m.rect.width} height={m.rect.height} rx={4} />
            </clipPath>
          ))}
        </defs>
        {p.monitors.map((m) => (
          <g key={m.key} clipPath={`url(#${clipOf(m.key)})`}>
            {/* 화면은 한 단 들어간 바탕, 작업 영역 밖(작업 표시줄 자리)은 --line 띠 */}
            <rect x={m.rect.x} y={m.rect.y} width={m.rect.width} height={m.rect.height} fill="var(--surface-inset)" />
            {taskbarRects(m.rect, m.workArea).map((s, i) => (
              <rect key={i} x={s.x} y={s.y} width={s.width} height={s.height} fill="var(--line)" />
            ))}
          </g>
        ))}
        {ordered.map((w) => {
          const on = w.ruleId === active
          const color = on ? 'var(--brand)' : 'var(--text-3)'
          const r = inset(w.rect, on ? 1 : 0.5)
          const monitor = monitorOf.get(w.ruleId)
          return (
            <g
              key={w.ruleId}
              clipPath={monitor ? `url(#${clipOf(monitor)})` : undefined}
              onMouseEnter={() => onHover(w.ruleId)}
              onClick={() => onPick(w.ruleId)}
              className="cursor-pointer"
            >
              <rect
                x={r.x}
                y={r.y}
                width={r.width}
                height={r.height}
                fill={w.enabled || on ? color : 'none'}
                fillOpacity={on ? 0.26 : w.enabled ? 0.2 : 0}
                stroke={color}
                strokeOpacity={on ? 1 : w.enabled ? 0.9 : 0.7}
                strokeWidth={on ? 2 : 1}
                strokeDasharray={w.enabled || on ? undefined : '3 2'}
                // 투명한 칠도 누를 수 있게
                pointerEvents="all"
              />
              {(w.enabled || on) && r.height >= TITLE_BAR * 3 ? (
                <rect x={r.x} y={r.y} width={r.width} height={TITLE_BAR} fill={color} fillOpacity={on ? 0.9 : 0.55} />
              ) : null}
              {w.maximized && r.width >= MAX_MARK.minWidth && r.height >= MAX_MARK.minHeight ? (
                <rect
                  x={r.x + r.width - MAX_MARK.size - 5}
                  y={r.y + TITLE_BAR + 3}
                  width={MAX_MARK.size}
                  height={MAX_MARK.size}
                  fill="none"
                  stroke={color}
                  strokeWidth={1}
                  strokeOpacity={on ? 1 : 0.9}
                />
              ) : null}
            </g>
          )
        })}
        {p.monitors.map((m) => (
          <rect key={m.key} x={m.rect.x + 0.5} y={m.rect.y + 0.5} width={Math.max(0, m.rect.width - 1)} height={Math.max(0, m.rect.height - 1)} rx={4} fill="none" stroke="var(--line)" pointerEvents="none" />
        ))}
      </svg>
      {/* 모니터 이름표(창 규칙의 대상 모니터 단추와 같은 이름). 글자는 HTML로 그려 배율에서도 또렷하게 */}
      {labels.map((l) => (
        <span
          key={l.key}
          aria-hidden="true"
          className={`pointer-events-none absolute text-caption leading-4 whitespace-nowrap text-fg-2 ${l.below ? '-translate-x-1/2' : 'rounded-control bg-surface-solid/85 px-1'}`}
          style={{ left: Math.round(l.x), top: Math.round(l.y) }}
        >
          {l.label}
        </span>
      ))}
    </div>
  )
}
