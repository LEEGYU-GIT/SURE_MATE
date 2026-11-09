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
