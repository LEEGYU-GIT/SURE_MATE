import type { SettingsSnapshot } from '../../../shared/settings/settings-snapshot'

export interface SettingsViewState {
  /** main이 마지막으로 알려 준 설정(화면은 늘 이것을 그린다) */
  snapshot: SettingsSnapshot | null
  /** 아직 답을 받지 못한 저장 수 */
  saving: number
  status: { kind: 'idle' } | { kind: 'saved' } | { kind: 'error'; errors: string[] }
  /** 스냅숏이 바뀔 때마다 늘린다(입력칸이 바뀐 값으로 다시 그리는 열쇠) */
  revision: number
}

export type SettingsViewAction =
  | { type: 'loaded'; snapshot: SettingsSnapshot }
  | { type: 'saving' }
  | { type: 'saved'; snapshot: SettingsSnapshot }
  | { type: 'failed'; errors: string[] }
  /** 다른 곳(트레이·바 메뉴·팔레트)에서 설정이 바뀜 */
  | { type: 'changed'; snapshot: SettingsSnapshot }

export const initialSettingsState: SettingsViewState = { snapshot: null, saving: 0, status: { kind: 'idle' }, revision: 0 }

/**
 * 설정 화면 상태. 바꾼 값은 바로 저장하고, 저장에 실패하면 마지막 스냅숏을 다시 그려(revision) 실패한 값이 화면에 남지 않게 한다.
 */
export function settingsReducer(s: SettingsViewState, a: SettingsViewAction): SettingsViewState {
  switch (a.type) {
    case 'loaded':
      return { ...s, snapshot: a.snapshot, revision: s.revision + 1 }
    case 'saving':
      return { ...s, saving: s.saving + 1 }
    case 'saved':
      return { ...s, snapshot: a.snapshot, saving: Math.max(0, s.saving - 1), status: { kind: 'saved' }, revision: s.revision + 1 }
    case 'failed':
      return { ...s, saving: Math.max(0, s.saving - 1), status: { kind: 'error', errors: a.errors }, revision: s.revision + 1 }
    case 'changed':
      return { ...s, snapshot: a.snapshot, revision: s.revision + 1 }
  }
}
