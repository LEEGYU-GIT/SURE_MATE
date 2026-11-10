import type { AiTarget } from '../ai-targets'
import type { Settings } from './settings'

export type SettingsHotkeyId = 'palette' | 'lookup'

/** 설정 창이 그리는 것: 설정과 함께 화면에 필요한 지금 상태(설계 문서 §14) */
export interface SettingsSnapshot {
  settings: Settings
  /** 기본 대상 + 사용자 대상 */
  aiTargets: AiTarget[]
  /** 실제로 등록된 조합(못 잡았으면 acc는 설정 값, registered false) */
  hotkeys: Record<SettingsHotkeyId, { acc: string | null; registered: boolean }>
  /** 바를 둘 모니터 고르기 */
  displays: { id: string; label: string; primary: boolean }[]
  /** 바에 고정할 수 있는 프롬프트 */
  prompts: { id: string; name: string }[]
  /** 설치본인지(로그인 시 자동 실행은 설치본에서만 적용) */
  packaged: boolean
}

export type SettingsUpdateResult = { ok: true; snapshot: SettingsSnapshot } | { ok: false; errors: string[] }
