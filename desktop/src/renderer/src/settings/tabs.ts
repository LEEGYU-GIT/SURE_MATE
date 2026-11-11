import { tabFromHash, workspaceFromHash, type SettingsTabId } from '../../../shared/settings/settings-route'

export type { SettingsTabId }

/**
 * 설정 창 탭(설계 문서 §14 순서, 지금 있는 기능). 말하듯 입력은 M7이 한 줄 더한다.
 * id는 shared/settings/settings-route.ts의 SETTINGS_TAB_IDS에도 같은 순서로 더한다(main이 그 탭으로 설정 창을 연다).
 */
export const SETTINGS_TABS = [
  { id: 'general', label: '일반' },
  { id: 'hotkeys', label: '단축키' },
  { id: 'ai', label: 'AI 대상' },
  { id: 'prompts', label: '프롬프트·상용구' },
  { id: 'masking', label: '가명 처리' },
  { id: 'glossary', label: '용어 사전' },
  { id: 'workspace', label: '워크스페이스' },
  { id: 'bar', label: '바' },
  { id: 'pet', label: '말랑 메이트' }
] as const satisfies readonly { id: SettingsTabId; label: string }[]

/** 처음 열 탭: 주소에 붙은 탭('#/settings?tab=pet'), 없거나 모르면 일반 */
export const initialTabOf = (hash: string): SettingsTabId => tabFromHash(hash) ?? 'general'

/** 처음 열 워크스페이스('#/settings?tab=workspace&ws=<id>'): 팔레트 행의 Ctrl+Enter, 지금 배치 저장 뒤. 없으면 null(목록) */
export const initialWorkspaceOf = (hash: string): string | null => workspaceFromHash(hash)

/** 탭 목록 키보드(↑↓·Home·End). 끝에서 멈추고, 한글 조합 중이거나 다른 키면 null */
export function navKey(index: number, k: { code: string; isComposing: boolean }, count: number): number | null {
  if (k.isComposing) return null
  switch (k.code) {
    case 'ArrowDown':
      return Math.min(count - 1, index + 1)
    case 'ArrowUp':
      return Math.max(0, index - 1)
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}
