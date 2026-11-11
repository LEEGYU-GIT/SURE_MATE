import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../shared/settings/settings'
import type { SettingsSnapshot } from '../../../shared/settings/settings-snapshot'
import { pinnedPromptsReducer, PINNED_MAX } from './pinned-prompts'
import { initialSettingsState, settingsReducer } from './settings-state'
import { navKey, SETTINGS_TABS } from './tabs'

const snap = (opacity = 1): SettingsSnapshot => ({
  settings: { ...structuredClone(DEFAULT_SETTINGS), bar: { ...DEFAULT_SETTINGS.bar, opacity } },
  aiTargets: [],
  hotkeys: { palette: { acc: 'Alt+`', registered: true }, lookup: { acc: 'Ctrl+Alt+W', registered: true } },
  displays: [],
  prompts: [],
  packaged: false
})

describe('탭 목록', () => {
  it('설계 §14 순서(지금 있는 기능), id가 겹치지 않는다', () => {
    expect(SETTINGS_TABS.map((t) => t.label)).toEqual(['일반', '단축키', 'AI 대상', '프롬프트·상용구', '가명 처리', '용어 사전', '바'])
    expect(new Set(SETTINGS_TABS.map((t) => t.id)).size).toBe(SETTINGS_TABS.length)
  })
  it('↑↓는 끝에서 멈추고 Home·End는 처음·끝, 한글 조합 중이나 다른 키는 무시', () => {
    expect(navKey(0, { code: 'ArrowDown', isComposing: false }, 7)).toBe(1)
    expect(navKey(6, { code: 'ArrowDown', isComposing: false }, 7)).toBe(6)
    expect(navKey(0, { code: 'ArrowUp', isComposing: false }, 7)).toBe(0)
    expect(navKey(3, { code: 'Home', isComposing: false }, 7)).toBe(0)
    expect(navKey(3, { code: 'End', isComposing: false }, 7)).toBe(6)
    expect(navKey(3, { code: 'ArrowDown', isComposing: true }, 7)).toBeNull()
    expect(navKey(3, { code: 'KeyA', isComposing: false }, 7)).toBeNull()
  })
})

describe('설정 화면 상태', () => {
  it('저장 중 → 저장됨이면 새 스냅숏, 실패면 마지막 스냅숏으로 되돌리고 까닭을 보인다', () => {
    let s = settingsReducer(initialSettingsState, { type: 'loaded', snapshot: snap(1) })
    s = settingsReducer(s, { type: 'saving' })
    expect(s.saving).toBe(1)
    s = settingsReducer(s, { type: 'saved', snapshot: snap(0.8) })
    expect(s).toMatchObject({ saving: 0, status: { kind: 'saved' } })
    expect(s.snapshot?.settings.bar.opacity).toBe(0.8)
    s = settingsReducer(s, { type: 'saving' })
    s = settingsReducer(s, { type: 'failed', errors: ['바 불투명도는 0.6~1이에요'] })
    expect(s).toMatchObject({ saving: 0, status: { kind: 'error', errors: ['바 불투명도는 0.6~1이에요'] } })
    // 화면은 마지막으로 받은 스냅숏(0.8)을 그대로 그린다(실패한 값이 남지 않음)
    expect(s.snapshot?.settings.bar.opacity).toBe(0.8)
    expect(s.revision).toBeGreaterThan(0)
  })

  it('다른 곳에서 바뀌면(changed) 스냅숏을 바꾸되 오류 표시는 지우지 않는다', () => {
    let s = settingsReducer(initialSettingsState, { type: 'loaded', snapshot: snap(1) })
    s = settingsReducer(s, { type: 'failed', errors: ['x'] })
    const before = s.revision
    s = settingsReducer(s, { type: 'changed', snapshot: snap(0.7) })
    expect(s.snapshot?.settings.bar.opacity).toBe(0.7)
    expect(s.status.kind).toBe('error')
    expect(s.revision).toBe(before + 1)
  })
})

describe('고정 프롬프트', () => {
  it('더하기는 5개까지·겹치지 않게, 빼기, 위아래 옮기기는 끝에서 멈춘다', () => {
    let list = ['a', 'b']
    list = pinnedPromptsReducer(list, { type: 'add', id: 'c' })
    list = pinnedPromptsReducer(list, { type: 'add', id: 'c' })
    expect(list).toEqual(['a', 'b', 'c'])
    list = pinnedPromptsReducer(list, { type: 'add', id: 'd' })
    list = pinnedPromptsReducer(list, { type: 'add', id: 'e' })
    expect(pinnedPromptsReducer(list, { type: 'add', id: 'f' })).toHaveLength(PINNED_MAX)
    expect(pinnedPromptsReducer(list, { type: 'move', id: 'a', by: -1 })).toEqual(list)
    expect(pinnedPromptsReducer(list, { type: 'move', id: 'a', by: 1 })).toEqual(['b', 'a', 'c', 'd', 'e'])
    expect(pinnedPromptsReducer(list, { type: 'move', id: 'e', by: 1 })).toEqual(list)
    expect(pinnedPromptsReducer(list, { type: 'remove', id: 'c' })).toEqual(['a', 'b', 'd', 'e'])
  })
})
