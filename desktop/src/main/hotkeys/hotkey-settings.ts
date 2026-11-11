import type { Settings } from '../../shared/settings/settings'
import type { SettingsSnapshot } from '../../shared/settings/settings-snapshot'
import { type HotkeyId, isWorkspaceHotkey } from './hotkey-manager'

/** 설정에 저장된 조합(조종 단축키는 settings.pet.controlHotkey, 없으면 null). 워크스페이스 단축키는 workspaces.json에 있어 null */
export function hotkeySetting(s: Settings, id: HotkeyId): string | null {
  if (isWorkspaceHotkey(id)) return null
  return id === 'pet-control' ? s.pet.controlHotkey : s.hotkeys[id]
}

/**
 * 단축키 바꾸기가 저장할 새 설정(설정 쓰기 changeSettings에 넘긴다). 조종 단축키는 pet.controlHotkey, 나머지는 hotkeys.
 * 팔레트·용어 찾기는 비울 수 없어 null이면 그대로 돌려준다. 워크스페이스 단축키는 workspaces.json에 저장하므로 그대로 돌려준다.
 */
export function withHotkeySetting(s: Settings, id: HotkeyId, acc: string | null): Settings {
  if (isWorkspaceHotkey(id)) return s
  if (id === 'pet-control') return { ...s, pet: { ...s.pet, controlHotkey: acc } }
  if (acc === null) return s
  return { ...s, hotkeys: { ...s.hotkeys, [id]: acc } }
}

/**
 * 설정 창의 단축키 상태: 등록됐으면 그 조합, 못 잡았으면 설정 값과 등록 못 함(조종 단축키를 비웠으면 acc null).
 * registered를 주면 조합을 기억해도 되살리지 못해 등록되지 않은 단축키는 그 조합으로 등록 못 함이다(HotkeyManager.isRegistered, A-M6)
 */
export function hotkeyStatuses(
  s: Settings,
  current: (id: HotkeyId) => string | undefined,
  registered: (id: HotkeyId) => boolean = () => true
): SettingsSnapshot['hotkeys'] {
  const status = (id: HotkeyId): { acc: string | null; registered: boolean } => {
    const bound = current(id)
    return { acc: bound ?? hotkeySetting(s, id), registered: bound !== undefined && registered(id) }
  }
  return { palette: status('palette'), lookup: status('lookup'), 'pet-control': status('pet-control') }
}
