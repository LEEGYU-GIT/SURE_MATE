/** 화면 사각형. 어떤 좌표계인지는 쓰는 쪽이 밝힌다(DIP 또는 물리 픽셀). */
export type Rect = { x: number; y: number; width: number; height: number }

/** Electron screen 기준 모니터 정보(DIP). */
export interface MonitorInfo {
  id: string
  bounds: Rect
  workArea: Rect
  scaleFactor: number
  isPrimary: boolean
  isInternal: boolean
}

/** Win32에서 읽은 최상위 창 정보. rect·frame은 물리 픽셀. */
export interface WindowInfo {
  hwnd: string
  title: string
  className: string
  exe: string
  pid: number
  /** GetWindowRect (보이지 않는 테두리 포함) */
  rect: Rect
  /** DWMWA_EXTENDED_FRAME_BOUNDS (눈에 보이는 테두리) */
  frame: Rect
  minimized: boolean
  maximized: boolean
  cloaked: boolean
  /** 관리자 권한 여부. 프로세스를 열 수 없으면 null */
  elevated: boolean | null
  dpi: number
}

export type PaletteGroup = 'prompt' | 'command' | 'workspace' | 'snippet' | 'wiki'

export interface PaletteItem {
  id: string
  group: PaletteGroup
  title: string
  subtitle?: string
  keywords?: string[]
}

export type MaskingMode = 'off' | 'restore' | 'remove'

export interface CaptureResult {
  text: string | null
  method: 'ctrl-insert' | 'ctrl-c' | 'none'
  elapsedMs: number
  restored: boolean
  skipped?: 'terminal' | 'elevated' | 'no-foreground'
}
