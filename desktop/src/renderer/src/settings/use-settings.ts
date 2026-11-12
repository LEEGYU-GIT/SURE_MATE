import { createContext, useCallback, useContext, useEffect, useReducer } from 'react'
import type { SettingsPatch } from '../../../shared/settings/settings-patch'
import type { SettingsSnapshot } from '../../../shared/settings/settings-snapshot'
import { initialSettingsState, settingsReducer, type SettingsViewState } from './settings-state'
import type { SettingsTabId } from './tabs'

export interface SettingsCtx {
  snapshot: SettingsSnapshot
  /** 바꾼 필드만 보낸다. 실패하면 화면은 마지막 스냅숏으로 돌아가고 상태 줄에 까닭이 뜬다 */
  save(patch: SettingsPatch): Promise<boolean>
  revision: number
  /**
   * 설정 파일이 아닌 저장(워크스페이스 탭의 칸)을 상태 줄에 '저장하는 중…'·'저장했어요'로 보인다. run이 돌려준 값의
   * ok로 성공을 가리고, 실패한 까닭은 부른 쪽이 그 칸 옆에 보인다
   */
  track<T extends { ok: boolean }>(run: () => Promise<T>): Promise<T>
  /** main이 열라고 한 워크스페이스(설정 창 주소·탭 고르기 알림). seq는 같은 id를 다시 열라고 할 때도 바뀐다 */
  workspaceTarget: { id: string; seq: number } | null
  /** 다른 탭으로 간다(단축키 탭 → 워크스페이스 탭). 누른 단추가 사라지므로 포커스는 탭 목록의 그 탭으로 옮긴다 */
  showTab(id: SettingsTabId): void
}

export const SettingsContext = createContext<SettingsCtx | null>(null)

export function useSettingsCtx(): SettingsCtx {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('SettingsContext 밖에서 썼어요')
  return ctx
}

/** 설정 창 상태: 처음 읽기, 다른 곳에서 바뀐 값 받기, 저장 */
export function useSettingsState(): {
  state: SettingsViewState
  save(patch: SettingsPatch): Promise<boolean>
  track: SettingsCtx['track']
} {
  const [state, dispatch] = useReducer(settingsReducer, initialSettingsState)
  useEffect(() => {
    let alive = true
    const api = window.sureMate.settings
    // 구독을 먼저 걸고 읽는다(그 사이 바뀐 값을 놓치지 않게)
    const off = api.onChanged((snapshot) => dispatch({ type: 'changed', snapshot }))
    void api.get().then((snapshot) => {
      if (alive && snapshot) dispatch({ type: 'loaded', snapshot })
    })
    return () => {
      alive = false
      off()
    }
  }, [])
  const save = useCallback(async (patch: SettingsPatch): Promise<boolean> => {
    dispatch({ type: 'saving' })
    const r = await window.sureMate.settings.update(patch).catch(() => ({ ok: false as const, errors: ['설정을 저장하지 못했어요'] }))
    if (r.ok) dispatch({ type: 'saved', snapshot: r.snapshot })
    else dispatch({ type: 'failed', errors: r.errors })
    return r.ok
  }, [])
  const track = useCallback(async <T extends { ok: boolean }>(run: () => Promise<T>): Promise<T> => {
    dispatch({ type: 'saving' })
    let ok = false
    try {
      const r = await run()
      ok = r.ok
      return r
    } finally {
      dispatch({ type: 'done', ok })
    }
  }, [])
  return { state, save, track }
}
