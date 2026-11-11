// 팔레트 목록에서 cmdk 기본 동작(↑↓ 이동, Enter 실행)보다 먼저 판단할 키(설계 §6 "→ 또는 Ctrl+Enter로 상세·보조 동작", §13 8단계)
import type { PaletteItem } from '../../../shared/types'
import { WORKSPACE_ITEM_PREFIX } from '../../../shared/workspace/workspace-ipc'
import type { KeyInfo } from './confirm-state'

const isEnter = (k: Pick<KeyInfo, 'code' | 'key'>): boolean => k.code === 'Enter' || k.code === 'NumpadEnter' || (!k.code && k.key === 'Enter')

/** 저장한 워크스페이스 행(지금 배치 저장 명령과 '@이름' 저장 줄은 같은 구역이지만 아니다) */
const isSavedWorkspace = (item: Pick<PaletteItem, 'id' | 'group'>): boolean => item.group === 'workspace' && item.id.startsWith(WORKSPACE_ITEM_PREFIX)

/**
 * 고른 행에서 누른 키를 목록 동작으로 바꾼다. null이면 cmdk와 입력칸에 맡긴다(그냥 Enter와 그 밖의 Shift+Enter는 실행).
 * - 'remember': Shift+Enter이고 기억하기 안내가 보일 때(o.remember, rememberHint). 고른 항목을 실행하면서 친 문장을 기억한다.
 * - 'secondary': 저장한 워크스페이스 행에서 Ctrl+Enter(어디서나), 또는 `@` 범위(o.workspaceScope)에서 입력칸 커서가 끝에 있을 때 →
 *   (설정 창에서 그 워크스페이스 편집). 말하듯 입력의 맨 위가 워크스페이스일 때 문장 끝에서 누른 →로 팔레트가 닫히지 않게 →는 `@`에서만.
 * 한글 조합 중이거나 누르고 있어 자동 반복된 키는 아무것도 하지 않는다. 키는 e.code와 보조키로 판단한다(한글 모드의 e.key는 'Process').
 */
export function listKeyAction(
  k: KeyInfo & { caretAtEnd: boolean },
  item: Pick<PaletteItem, 'id' | 'group'> | null,
  o: { remember: boolean; workspaceScope?: boolean } = { remember: false }
): 'secondary' | 'remember' | null {
  if (k.isComposing || k.repeat || !item) return null
  if (isEnter(k) && k.shiftKey && !k.ctrlKey && !k.altKey) return o.remember ? 'remember' : null
  if (!isSavedWorkspace(item)) return null
  if (isEnter(k) && k.ctrlKey && !k.shiftKey && !k.altKey) return 'secondary'
  if (o.workspaceScope && k.code === 'ArrowRight' && k.caretAtEnd && !k.ctrlKey && !k.shiftKey && !k.altKey) return 'secondary'
  return null
}

/** 목록이 검색어를 못 따라온 동안 누른 Enter의 처리: 줄 실행, 줄의 보조 동작, 아무것도 하지 않음(삼킴) */
export type LaggingEnter = { type: 'run'; id: string } | { type: 'secondary'; id: string } | { type: 'none' }

/**
 * 목록(지연 값으로 그린 것)이 검색어를 아직 못 따라온 동안 누른 Enter. 고른 행은 지난 검색어의 것이므로 지금 검색어로 다시 만든
 * 맨 위 줄(topRow, Enter일 때만 부른다)에 같은 키로 listKeyAction을 다시 적용한다.
 * - 'secondary'(맨 위가 저장한 워크스페이스이고 Ctrl+Enter)면 그 줄의 보조 동작(설정 창에서 편집). 불러와 창을 옮기지 않는다.
 * - 보조키 없는 Enter면 그 줄을 실행한다(직접 추가하기·이름으로 저장 줄 포함).
 * - 보조키를 누른 Enter인데 맞는 동작이 없으면 삼킨다. 기억하기 안내도 지난 검색어의 것이라 Shift+Enter로 기억하지 않는다.
 * Enter가 아니거나 한글 조합 중이면 null(cmdk와 입력칸에 맡긴다).
 */
export function laggingEnterAction(
  k: KeyInfo & { caretAtEnd: boolean },
  topRow: () => Pick<PaletteItem, 'id' | 'group'> | null,
  o: { workspaceScope?: boolean } = {}
): LaggingEnter | null {
  if (!isEnter(k) || k.isComposing) return null
  const top = k.repeat ? null : topRow()
  if (!top) return { type: 'none' }
  const action = listKeyAction(k, top, { remember: false, workspaceScope: o.workspaceScope })
  if (action === 'secondary') return { type: 'secondary', id: top.id }
  if (!k.ctrlKey && !k.shiftKey && !k.altKey) return { type: 'run', id: top.id }
  return { type: 'none' }
}
