import type { BarPressKind } from '../../../shared/bar/bar-ipc'
import type { BarViewState } from '../../../shared/bar/bar-items'
import { BAR_METRICS } from '../../../shared/bar/bar-layout'
import { maskingModeLabel } from '../../../shared/labels'
import type { MaskingMode } from '../../../shared/types'

export interface BarFrameStyle {
  width: number
  borderRadius: string
  /** 배경에만 곱하는 불투명도(아이콘·상태 점은 그대로) */
  '--bar-opacity': string
}

/** 바 몸통의 너비·모서리. 가장자리 띠는 화면 쪽 모서리를 각지게, 캡슐은 완전히 둥글게(§14-1). */
export function barFrameStyle(s: Pick<BarViewState, 'shape' | 'edge' | 'opacity'>): BarFrameStyle {
  const opacity = String(s.opacity)
  if (s.shape === 'capsule') return { width: BAR_METRICS.capsule.width, borderRadius: '9999px', '--bar-opacity': opacity }
  const r = `${BAR_METRICS.edge.radius}px`
  return { width: BAR_METRICS.edge.width, borderRadius: s.edge === 'right' ? `${r} 0 0 ${r}` : `0 ${r} ${r} 0`, '--bar-opacity': opacity }
}

export interface MaskingLook {
  icon: 'shield' | 'shield-off'
  dot: 'brand' | 'warn'
  /** 끔은 색만으로 알리지 않고 아이콘 아래 글자를 함께 쓴다(§14-4) */
  caption: string | null
}

export function maskingLook(mode: MaskingMode): MaskingLook {
  if (mode === 'off') return { icon: 'shield-off', dot: 'warn', caption: maskingModeLabel('off') }
  return { icon: 'shield', dot: 'brand', caption: null }
}

export type PromptIconName = 'notebook-pen' | 'list-checks' | 'scan-search'

const PROMPT_ICONS = new Map<string, PromptIconName>([
  ['meeting-notes', 'notebook-pen'],
  ['req-to-testcase', 'list-checks'],
  ['static-analysis', 'scan-search']
])

/** 기본 고정 프롬프트는 템플릿 id로 아이콘을 고른다. 그 밖에는 null(이름 첫 글자 칸) */
export const promptIcon = (templateId: string): PromptIconName | null => PROMPT_ICONS.get(templateId) ?? null

/**
 * 바 단추 클릭을 main에 보낼지(click의 detail = 운영 체제가 센 연속 클릭 수).
 * 두 번 클릭의 두 번째 클릭(2 이상)은 보내지 않는다: 아이콘을 습관적으로 두 번 누르면 0.3~0.5초 간격의 두 번째 클릭이
 * main의 같은 단추 300ms 막기를 지나 팔레트·메뉴를 열었다 바로 닫거나 프롬프트를 두 번 실행했다.
 * 0(보조 기술·프로그램이 누른 클릭)과 1은 보낸다. main의 300ms 막기는 그대로 둔다.
 */
export const shouldSendBarClick = (detail: number): boolean => detail <= 1

/**
 * 같은 단추를 이 시간 안에 다시 실행하면 두 번 클릭의 두 번째로 보고 보내지 않는다(Windows 기본 두 번 클릭 시간).
 * 뗌으로 실행한 뒤 이 시간 안에 오는 click도 같은 누름의 click이라 건너뛴다(펼침 창 press.ts와 같은 값)
 */
export const BAR_REPEAT_MS = 500
/** 누름을 기억하는 시간. 이보다 오래된 누름(뗌을 놓친 누름)은 없던 것으로 본다 */
export const BAR_DOWN_STALE_MS = 3000

export interface BarPress {
  /** 단추 위에서 눌렀다(pointerdown). Windows가 누름을 보내지 않으면 불리지 않는다 */
  down(id: string, button: number): void
  /** 단추 위에서 뗐다(pointerup). inside: 뗀 자리가 그 단추 안인지. 실행할 방식을 돌려주고, 실행하지 않으면 null */
  up(id: string, button: number, inside: boolean): BarPressKind | null
  /** click이 왔다. detail은 운영 체제가 센 연속 클릭 수. 실행할 방식(click) 또는 null */
  click(id: string, detail: number): BarPressKind | null
  /** 포인터가 바를 떠났거나 취소됐다: 기억한 누름을 버린다 */
  reset(): void
}

/**
 * 바 단추는 click이 아니라 뗌(pointerup)으로 실행한다(펼침 창 press.ts와 같은 까닭).
 * 2026-11-16 로그인 자동 실행 뒤 바 단추가 하나도 눌리지 않았다: 마우스를 올리면 이름표는 떴지만(bar:hover) bar.action이 없었다.
 * Windows가 포커스를 받지 않는 창에 누름(WM_LBUTTONDOWN)을 보내지 않고 뗌만 보내는 상태로, click은 누름이 있어야 생긴다.
 * - 누름이 왔으면 같은 단추에서 뗐을 때만 실행한다(다른 단추에서 눌러 여기서 떼면 실행하지 않는다)
 * - 누름 없이 뗌만 오면 그 단추를 실행한다(up-only, 로그로 이 상태를 알 수 있다)
 * - 뗌 없이 온 click(화면 읽기 프로그램·자동화)은 실행하고, 뗌 뒤에 따라오는 click은 건너뛴다
 * - 두 번 클릭의 두 번째는 실행하지 않는다(shouldSendBarClick와 같은 뜻을 시간으로 센다). main의 300ms 막기는 그대로 둔다
 */
export function createBarPress(now: () => number = () => performance.now()): BarPress {
  let down: { id: string; at: number } | null = null
  let last: { id: string; at: number } | null = null
  let lastUpAt = Number.NEGATIVE_INFINITY

  /** 같은 단추를 BAR_REPEAT_MS 안에 다시 실행하려 하면 null. 건너뛴 시각도 기억해 세 번 클릭도 막는다 */
  const run = (id: string, t: number, kind: BarPressKind): BarPressKind | null => {
    const repeat = last !== null && last.id === id && t - last.at <= BAR_REPEAT_MS
    last = { id, at: t }
    return repeat ? null : kind
  }

  return {
    down(id, button) {
      if (button === 0) down = { id, at: now() }
    },
    up(id, button, inside) {
      if (button !== 0) return null
      const t = now()
      lastUpAt = t
      const from = down !== null && t - down.at <= BAR_DOWN_STALE_MS ? down.id : null
      down = null
      if (!inside || (from !== null && from !== id)) return null
      return run(id, t, from === null ? 'up-only' : 'up')
    },
    click(id, detail) {
      const t = now()
      if (t - lastUpAt <= BAR_REPEAT_MS || !shouldSendBarClick(detail)) return null
      return run(id, t, 'click')
    },
    reset() {
      down = null
    }
  }
}

export type DragPhase = 'start' | 'move' | 'end'

export interface FrameScheduler {
  request(cb: () => void): number
  cancel(id: number): void
}

export interface DragReporter {
  start(screenY: number): void
  move(screenY: number): void
  end(screenY: number): void
  active(): boolean
  dispose(): void
}

/**
 * 바 끌기를 main에 알린다. 이동은 애니메이션 프레임마다 마지막 위치 한 번만 보내고,
 * 끝낼 때는 아직 보내지 않은 위치를 먼저 보낸 뒤 끝을 보낸다(놓은 자리가 커서와 맞게).
 * 끄는 중에 다른 포인터로 다시 누르면 무시한다.
 */
export function createDragReporter(send: (phase: DragPhase, screenY: number) => void, frames: FrameScheduler): DragReporter {
  let dragging = false
  let frame: number | null = null
  let latest = 0
  let sent = 0

  const cancelFrame = (): void => {
    if (frame !== null) frames.cancel(frame)
    frame = null
  }
  const sendMove = (y: number): void => {
    sent = y
    send('move', y)
  }

  return {
    start(y) {
      if (dragging) return
      dragging = true
      latest = sent = y
      send('start', y)
    },
    move(y) {
      if (!dragging) return
      latest = y
      if (frame !== null) return
      frame = frames.request(() => {
        frame = null
        if (dragging) sendMove(latest)
      })
    },
    end(y) {
      if (!dragging) return
      dragging = false
      cancelFrame()
      if (y !== sent) sendMove(y)
      send('end', y)
    },
    active: () => dragging,
    dispose() {
      cancelFrame()
      dragging = false
    }
  }
}
