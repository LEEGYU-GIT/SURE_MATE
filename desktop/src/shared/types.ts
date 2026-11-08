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
  /** 검색 마지막 단계에서만 보는 본문(위키 설명 등) */
  body?: string
}

export type MaskingMode = 'off' | 'restore' | 'remove'

/**
 * 가져오기를 시도하지 않은(또는 멈춘) 이유.
 * modifiers-held: 단축키를 계속 누르고 있어 키를 보내지 않음, busy: 이미 가져오거나 붙여넣는 중,
 * native-unavailable: 보안 프로그램 등으로 Win32 기능(koffi)을 불러오지 못함,
 * keys-held: 프롬프트를 고른 Enter를 계속 눌러 팔레트를 숨기지 않음(눌린 키가 원래 앱에 들어가지 않게),
 * focus-changed: 가져오는 동안 다른 창이 앞에 와서 키를 더 보내지 않음
 */
export type CaptureSkipReason =
  | 'terminal'
  | 'elevated'
  | 'no-foreground'
  | 'modifiers-held'
  | 'busy'
  | 'native-unavailable'
  | 'keys-held'
  | 'focus-changed'

export interface CaptureResult {
  text: string | null
  method: 'ctrl-insert' | 'ctrl-c' | 'none'
  elapsedMs: number
  restored: boolean
  skipped?: CaptureSkipReason
}

export type PasteFailReason = 'target-gone' | 'elevated' | 'not-foreground' | 'modifiers-held' | 'busy' | 'native-unavailable'
