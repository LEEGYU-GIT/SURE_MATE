import type { AiTarget } from '../ai-targets'
import type { Settings } from './settings'

/** 앱 단축키(settings.json): 팔레트, 용어 찾기, 말랑 메이트 조종(기본 없음, null이면 단축키 없음) */
export type AppHotkeyId = 'palette' | 'lookup' | 'pet-control'
/** 설정 창에서 바꾸는 단축키: 앱 단축키와 워크스페이스 단축키(workspace:<워크스페이스 id>, workspaces.json에 저장, null이면 없음) */
export type SettingsHotkeyId = AppHotkeyId | `workspace:${string}`

/** 설정 창이 그리는 것: 설정과 함께 화면에 필요한 지금 상태(설계 문서 §14) */
export interface SettingsSnapshot {
  settings: Settings
  /** 기본 대상 + 사용자 대상 */
  aiTargets: AiTarget[]
  /** 실제로 등록된 조합(못 잡았으면 acc는 설정 값, registered false. 조종 단축키를 비웠으면 acc null). 워크스페이스 단축키는 들어 있지 않다 */
  hotkeys: Record<AppHotkeyId, { acc: string | null; registered: boolean }>
  /** 바를 둘 모니터 고르기 */
  displays: { id: string; label: string; primary: boolean }[]
  /** 바에 고정할 수 있는 프롬프트 */
  prompts: { id: string; name: string }[]
  /** 설치본인지(로그인 시 자동 실행은 설치본에서만 적용) */
  packaged: boolean
}

export type SettingsUpdateResult = { ok: true; snapshot: SettingsSnapshot } | { ok: false; errors: string[] }

/** 단축키 조합 검사 결과(설계 문서 §6): 막힘·경고·다른 앱이 씀·다른 단축키와 같음 */
export type HotkeyCheck = { level: 'ok' | 'warn' | 'block' | 'in-use' | 'same-as-other'; reason?: string }
/** 바꾼 결과. acc null은 단축키를 비웠다(조종·워크스페이스 단축키만). reason은 화면에 그대로 보일 문구 */
export type HotkeySetResult = { ok: true; acc: string | null; warning?: string } | { ok: false; reason: string }
/** 첫 실행 단축키 후보 */
export type HotkeyCandidate = { acc: string; available: boolean; suggested: boolean }
