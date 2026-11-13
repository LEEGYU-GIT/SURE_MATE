import type { CaptureSkipped } from './capture'
import type { WorkspaceEdit } from './edit'
import type { HideOutcome } from './hide'
import type { RestoreReport } from './restore-result'
import { type Workspace, WORKSPACE_LIMITS } from './types'

/** 설정 창 워크스페이스 탭이 그리는 워크스페이스 하나: 지금 모니터 구성에서 저장한 배치가 있는지, 단축키가 지금 등록돼 있는지 */
export interface WorkspaceView {
  workspace: Workspace
  sameConfig: boolean
  /** 저장한 단축키를 지금 Sure-Mate가 잡고 있는지(조합이 없으면 false. 다른 앱이 쓰면 false) */
  hotkeyRegistered: boolean
  /** 기본 워크스페이스(화면 감추기)만: 지금 누르면 되돌릴 내렸던 창 수(없으면 빠진다) */
  restorable?: number
}

/** 설정 창 워크스페이스 탭: 모든 워크스페이스(최근에 바꾼 순서)와, 창을 저장·불러올 수 있는지(Win32를 막았으면 false) */
export interface WorkspaceListView {
  items: WorkspaceView[]
  canControl: boolean
}

/** 팔레트 항목 id: 워크스페이스 불러오기는 `workspace:<id>`, 설정 창에서 편집(행의 Ctrl+Enter·→)은 `workspace-edit:<id>` */
export const WORKSPACE_ITEM_PREFIX = 'workspace:'
export const WORKSPACE_EDIT_PREFIX = 'workspace-edit:'

/** 저장·불러오기를 하지 않은 까닭. invalid는 IPC 값 검사에 걸린 요청(보낸 창이 다르거나 값이 틀림) */
export type WorkspaceFailReason = 'native-unavailable' | 'busy' | 'no-windows' | 'limit' | 'missing' | 'save-failed' | 'invalid'

/** 저장 결과. 실패하면 화면·알림에 쓸 문구(message)를 함께 준다 */
export type WorkspaceSaveResult =
  | { ok: true; id: string; name: string; windows: number; skipped: CaptureSkipped }
  | { ok: false; reason: WorkspaceFailReason; message: string }

export type WorkspaceEditResult = { ok: true; workspace: Workspace } | { ok: false; errors: string[] }

/**
 * 불러오기 결과. cancelled는 다른 모니터 구성 질문에서 취소, empty는 불러올(켜진) 창 규칙이 없음. hide는 기본 워크스페이스(화면 감추기)의
 * 결과(내린 창·되돌린 창 수)이고, 그때 report는 저장한 창의 배치 결과다(저장한 창이 없거나 되돌리기면 창 0개)
 */
export type WorkspaceRunResult = { ok: true; report: RestoreReport; hide?: HideOutcome } | { ok: false; reason: WorkspaceFailReason | 'cancelled' | 'empty' }

/** 저장·불러오기를 부른 곳(로그용). editor는 설정 창의 워크스페이스 탭, onboarding은 첫 실행 안내 */
export type WorkspaceSource = 'palette' | 'bar' | 'hotkey' | 'editor' | 'onboarding'

// renderer가 보낸 값 검사(renderer는 믿지 않는다). 내용 검사는 applyWorkspaceEdit가 하고, 여기서는 모양만 본다.

const ID_RE = /^[A-Za-z0-9-]{1,64}$/
/** 모양 검사의 길이 상한. 내용 제한(이름 40자·별칭 10개·제목 조건 100자)보다 넉넉해서, 넘는 값은 편집 오류 문구로 알린다 */
const SHAPE = { name: 200, aliases: 20, alias: 200, rules: 40, titleIncludes: 200, monitor: 64 } as const

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 워크스페이스·규칙 id: 영문·숫자·하이픈 1~64자(workspaces.json과 같은 규칙) */
export const parseWorkspaceId = (v: unknown): string | null => (typeof v === 'string' && ID_RE.test(v) ? v : null)

/** 저장할 이름: 앞뒤 공백을 빼고 1~40자 */
export function parseWorkspaceName(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length >= 1 && t.length <= WORKSPACE_LIMITS.name ? t : null
}

function parseRule(v: unknown): WorkspaceEdit['rules'][number] | null {
  if (!isObj(v)) return null
  const id = parseWorkspaceId(v.id)
  if (id === null || typeof v.enabled !== 'boolean') return null
  const t = v.titleIncludes
  if (t !== null && (typeof t !== 'string' || t.length > SHAPE.titleIncludes)) return null
  if (typeof v.monitor !== 'string' || v.monitor.length < 1 || v.monitor.length > SHAPE.monitor) return null
  return { id, enabled: v.enabled, titleIncludes: t, monitor: v.monitor }
}

/** 편집 값의 모양(이름 200자, 별칭 20개, 규칙 40개, 칸마다 타입·길이). 쓰는 칸만 골라 돌려준다 */
export function parseWorkspaceEdit(v: unknown): WorkspaceEdit | null {
  if (!isObj(v) || typeof v.name !== 'string' || v.name.length > SHAPE.name) return null
  const aliases = v.aliases
  if (!Array.isArray(aliases) || aliases.length > SHAPE.aliases) return null
  if (!aliases.every((a): a is string => typeof a === 'string' && a.length <= SHAPE.alias)) return null
  if (!Array.isArray(v.rules) || v.rules.length > SHAPE.rules) return null
  const rules: WorkspaceEdit['rules'] = []
  for (const raw of v.rules) {
    const r = parseRule(raw)
    if (!r) return null
    rules.push(r)
  }
  return { name: v.name, aliases: [...aliases], rules }
}
