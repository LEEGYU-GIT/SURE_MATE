import { createContext, useCallback, useContext, useEffect, useReducer } from 'react'
import type { SettingsPatch } from '../../../shared/settings/settings-patch'
import type { SettingsSnapshot } from '../../../shared/settings/settings-snapshot'
import { initialSettingsState, settingsReducer, type SettingsViewState } from './settings-state'

export interface SettingsCtx {
  snapshot: SettingsSnapshot
  /** 바꾼 필드만 보낸다. 실패하면 화면은 마지막 스냅숏으로 돌아가고 상태 줄에 까닭이 뜬다 */
  save(patch: SettingsPatch): Promise<boolean>
  revision: number
}

export const SettingsContext = createContext<SettingsCtx | null>(null)

export function useSettingsCtx(): SettingsCtx {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('SettingsContext 밖에서 썼어요')
  return ctx
}

/** 설정 창 상태: 처음 읽기, 다른 곳에서 바뀐 값 받기, 저장 */
export function useSettingsState(): { state: SettingsViewState; save(patch: SettingsPatch): Promise<boolean> } {
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
  return { state, save }
}
