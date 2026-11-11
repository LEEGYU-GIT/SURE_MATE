// 팔레트 목록에서 cmdk 기본 동작(↑↓ 이동, Enter 실행)보다 먼저 판단할 키(설계 §6 "→ 또는 Ctrl+Enter로 상세·보조 동작", §13 8단계)
import type { PaletteItem } from '../../../shared/types'
import type { KeyInfo } from './confirm-state'

const isEnter = (k: Pick<KeyInfo, 'code' | 'key'>): boolean => k.code === 'Enter' || k.code === 'NumpadEnter' || (!k.code && k.key === 'Enter')

/** 저장한 워크스페이스 행(지금 배치 저장 명령과 '@이름' 저장 줄은 같은 구역이지만 아니다) */
const isSavedWorkspace = (item: Pick<PaletteItem, 'id' | 'group'>): boolean => item.group === 'workspace' && item.id.startsWith('workspace:')

/**
 * 고른 행에서 누른 키를 목록 동작으로 바꾼다. null이면 cmdk와 입력칸에 맡긴다(그냥 Enter와 그 밖의 Shift+Enter는 실행).
 * - 'remember': Shift+Enter이고 기억하기 안내가 보일 때(o.remember, rememberHint). 고른 항목을 실행하면서 친 문장을 기억한다.
 * - 'secondary': 저장한 워크스페이스 행에서 Ctrl+Enter, 또는 입력칸 커서가 끝에 있을 때 →(워크스페이스 편집).
 * 한글 조합 중이거나 누르고 있어 자동 반복된 키는 아무것도 하지 않는다. 키는 e.code와 보조키로 판단한다(한글 모드의 e.key는 'Process').
 */
export function listKeyAction(
  k: KeyInfo & { caretAtEnd: boolean },
  item: Pick<PaletteItem, 'id' | 'group'> | null,
  o: { remember: boolean } = { remember: false }
): 'secondary' | 'remember' | null {
  if (k.isComposing || k.repeat || !item) return null
  if (isEnter(k) && k.shiftKey && !k.ctrlKey && !k.altKey) return o.remember ? 'remember' : null
  if (!isSavedWorkspace(item)) return null
  if (isEnter(k) && k.ctrlKey && !k.shiftKey && !k.altKey) return 'secondary'
  if (k.code === 'ArrowRight' && k.caretAtEnd && !k.ctrlKey && !k.shiftKey && !k.altKey) return 'secondary'
  return null
}
