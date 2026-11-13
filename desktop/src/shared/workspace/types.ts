import type { Rect } from '../types'

export type MonitorRoleName = 'primary' | 'secondary' | 'internal'

/** 저장 당시 모니터. 모든 좌표는 DIP */
export interface SavedMonitor {
  key: string
  role: MonitorRoleName
  bounds: Rect
  workArea: Rect
  scaleFactor: number
}

/** 작업 영역 기준 0~1 비율 사각형 */
export interface RatioRect {
  x: number
  y: number
  w: number
  h: number
}

export type WindowState = 'normal' | 'maximized'

export interface WindowRule {
  id: string
  enabled: boolean
  match: { exe: string; className?: string; titleIncludes?: string; titleRegex?: string }
  /** 편집 화면 표시·같은 제목 창 순서용(로그 금지) */
  savedTitle: string
  target: { monitor: string; rect: RatioRect; state: WindowState }
  /** z-순서, 0이 맨 위 */
  order: number
}

export interface SavedLayout {
  monitors: SavedMonitor[]
  windows: WindowRule[]
}

export interface Workspace {
  id: string
  name: string
  aliases: string[]
  hotkey: string | null
  /** 모니터 구성 지문 → 배치 */
  layouts: Record<string, SavedLayout>
  updatedAt: string
  /**
   * 기본 워크스페이스(화면 감추기)만: 감춘 동안 업무 창을 항상 위에 둔다(2026-11-12 사용자 결정, 기본 꺼짐). 켰을 때만 true로 저장하고
   * 다른 값·다른 워크스페이스에서는 읽지 않는다
   */
  keepOnTop?: boolean
}

export const WORKSPACES_FORMAT = 'sure-mate-workspaces'

export const WORKSPACE_LIMITS = {
  workspaces: 30,
  windows: 40,
  monitors: 8,
  name: 40,
  aliases: 10,
  alias: 40,
  title: 200,
  titleIncludes: 100,
  titleRegex: 200,
  exe: 260,
  className: 256
} as const
