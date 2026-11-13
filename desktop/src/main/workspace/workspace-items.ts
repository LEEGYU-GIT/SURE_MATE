import { FLYOUT_MAX_HEIGHT, type FlyoutContent } from '../../shared/flyout/flyout-content'
import { workspaceMenuRowsThatFit } from '../../shared/flyout/workspace-menu-fit'
import type { PaletteItem } from '../../shared/types'
import { hideFirst, isHideWorkspace } from '../../shared/workspace/builtin'
import type { Workspace } from '../../shared/workspace/types'
import { parseWorkspaceId, WORKSPACE_EDIT_PREFIX, WORKSPACE_ITEM_PREFIX as ITEM_PREFIX, type WorkspaceSaveResult } from '../../shared/workspace/workspace-ipc'
import type { WorkspaceService } from './workspace-service'

/** 팔레트 명령 "지금 배치 저장" */
export const WORKSPACE_SAVE_ID = 'cmd.workspace-save'

const time = (iso: string): number => {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

/** 바 메뉴에 보이는 워크스페이스 수(나머지는 more로 센다) */
export const WORKSPACE_MENU_MAX = 8

/**
 * 켜진 창 수와 다른 구성 여부. 다른 구성이면 불러올 때 모을 배치(첫 배치)의 창 수. 저장한 배치가 하나도 없으면(저장 전의 화면 감추기)
 * 다른 구성이 아니다
 */
function layoutInfo(ws: Workspace, fingerprint: string): { windows: number; otherConfig: boolean } {
  const own = Object.hasOwn(ws.layouts, fingerprint) ? ws.layouts[fingerprint] : undefined
  const layout = own ?? Object.values(ws.layouts)[0]
  return { windows: layout ? layout.windows.filter((r) => r.enabled).length : 0, otherConfig: !own && layout !== undefined }
}

/** 최근에 바꾼 순서, 기본 워크스페이스(화면 감추기)는 맨 앞(설정 창 목록과 같은 차례) */
const menuOrder = (list: readonly Workspace[]): Workspace[] =>
  hideFirst(
    [...list].sort((a, b) => time(b.updatedAt) - time(a.updatedAt)),
    (w) => w.id
  )

/**
 * 팔레트의 화면 감추기 부제(design:ux-copy): 다시 누르면 되돌릴 창이 있으면 그것을, 아니면 남길 창 수(저장 전이면 모든 창을 내린다)
 */
function hideSubtitle(windows: number, restorable: number): string {
  if (restorable > 0) return `다시 누르면 내렸던 창 ${restorable}개를 되돌려요`
  return windows > 0 ? `창 ${windows}개만 남기고 나머지 창은 내려요` : '열린 창을 모두 내려요'
}

/**
 * 바 워크스페이스 메뉴의 내용: 최근에 바꾼 순서의 앞 WORKSPACE_MENU_MAX개와 나머지 수. maxHeight는 바가 있는 모니터에서 카드가
 * 쓸 수 있는 높이(cardMaxHeight)로, 메뉴가 스크롤하지 않으므로 그 높이에 들어가는 행만 보이고 나머지도 more로 센다(13b)
 */
export function workspaceMenuContent(
  list: readonly Workspace[],
  fingerprint: string,
  canSave: boolean,
  maxHeight: number = FLYOUT_MAX_HEIGHT,
  /** 화면 감추기를 지금 누르면 되돌릴 창 수 */
  restorable = 0
): Extract<FlyoutContent, { kind: 'workspace-menu' }> {
  const sorted = menuOrder(list)
  const shown = workspaceMenuRowsThatFit({ maxHeight, canSave, max: WORKSPACE_MENU_MAX })
  return {
    kind: 'workspace-menu',
    workspaces: sorted.slice(0, shown).map((ws) => ({
      id: ws.id,
      name: ws.name,
      ...layoutInfo(ws, fingerprint),
      ...(isHideWorkspace(ws.id) ? { hide: true as const, ...(restorable > 0 ? { restorable } : {}) } : {})
    })),
    canSave,
    more: Math.max(0, sorted.length - shown)
  }
}

/**
 * 팔레트 워크스페이스 구역(설계 §6 `@`, §11): 맨 앞에 "지금 배치 저장"(워크스페이스 구역이라 `@`에서도 보인다),
 * 이어서 워크스페이스를 최근에 바꾼 순서로. 부제는 포함한 창 수와 단축키, 지금 모니터 구성에서 저장한 배치가 없으면
 * '다른 모니터 구성'(불러오면 먼저 묻는다). 별칭은 키워드. 문구는 Task 8의 ux-copy에서 다듬는다.
 */
export function workspacePaletteItems(list: readonly Workspace[], fingerprint: string, o: { restorable?: number } = {}): PaletteItem[] {
  const save: PaletteItem = {
    id: WORKSPACE_SAVE_ID,
    group: 'workspace',
    title: '지금 배치 저장',
    subtitle: '지금 열린 창 위치를 새 워크스페이스로 저장해요',
    keywords: ['save', 'workspace', 'layout', '워크스페이스', '레이아웃', '창 배치', '배치 저장']
  }
  // 화면 감추기(기본)는 지금 배치 저장 바로 다음에 고정한다: `@` 다음 Enter는 그대로 저장이고(모든 창을 내리지 않게) 그다음 줄이 감추기
  const sorted = menuOrder(list)
  return [
    save,
    ...sorted.map((ws): PaletteItem => {
      const { windows, otherConfig } = layoutInfo(ws, fingerprint)
      const parts = [isHideWorkspace(ws.id) ? hideSubtitle(windows, o.restorable ?? 0) : `창 ${windows}개`]
      if (ws.hotkey) parts.push(ws.hotkey)
      if (otherConfig) parts.push('다른 모니터 구성')
      return { id: `${ITEM_PREFIX}${ws.id}`, group: 'workspace', title: ws.name, subtitle: parts.join(' · '), keywords: [...ws.aliases] }
    })
  ]
}

export interface WorkspaceCommandDeps {
  service: Pick<WorkspaceService, 'saveNew' | 'saveAs' | 'run'>
  /** 항목을 고른 Enter·보조키를 뗄 때까지 기다린다. 시간 안에 안 떼면 false(그때는 팔레트를 숨기지 않는다) */
  waitKeysReleased(): Promise<boolean>
  hidePalette(restoreFocus: boolean): void
  /** 설정 창의 워크스페이스 탭에서 그 워크스페이스를 연다(이름 칸을 골라 둔다). 설정 창이 포커스를 가져간다 */
  openEditor(workspaceId: string): void
  notify(message: string): void
}

/**
 * 팔레트의 워크스페이스 명령. 누른 채로 숨기면 자동 반복 Enter가 원래 앱으로 가므로, 키를 뗀 것을 확인했을 때만 숨긴다.
 * - "지금 배치 저장": 키 확인 → 알림 없이 저장 → 성공하면 설정 창 워크스페이스 탭에서 새 워크스페이스를 연다(이름 '배치 N'을
 *   바로 바꾸게. 설정 창이 포커스를 가져가므로 원래 창으로 돌아가지 않고, 키를 떼지 않았어도 팔레트는 포커스를 잃어 숨는다).
 *   실패하면 까닭을 알리고 팔레트에서 다시 할 수 있게 둔다. 팔레트(Sure-Mate 자신의 창)는 저장 대상이 아니다.
 * - 다른 이름으로 저장(`@이름` 줄): 키 확인 → 저장(알림) → 성공이고 뗐으면 팔레트를 숨기고 원래 창으로.
 * - `workspace:<id>`: 키를 뗐으면 팔레트를 숨기고(원래 창으로) 불러온다. 떼지 않았으면 팔레트를 둔 채 불러온다(M5 바 명령과 같은 규칙).
 * - `workspace-edit:<id>`(워크스페이스 행의 Ctrl+Enter·→): 키를 뗐으면 숨기고 설정 창 워크스페이스 탭에서 그 워크스페이스를 연다.
 */
export function createWorkspaceCommands(d: WorkspaceCommandDeps): {
  run(id: string): Promise<boolean>
  saveAs(name: string): Promise<WorkspaceSaveResult>
} {
  return {
    async run(id) {
      if (id === WORKSPACE_SAVE_ID) {
        const released = await d.waitKeysReleased()
        const r = await d.service.saveNew({ source: 'palette', quiet: true })
        if (!r.ok) {
          d.notify(r.message)
          return true
        }
        if (released) d.hidePalette(false)
        d.openEditor(r.id)
        return true
      }
      if (id.startsWith(WORKSPACE_EDIT_PREFIX)) {
        const wsId = parseWorkspaceId(id.slice(WORKSPACE_EDIT_PREFIX.length))
        if (!wsId) return true
        if (await d.waitKeysReleased()) d.hidePalette(false)
        d.openEditor(wsId)
        return true
      }
      if (!id.startsWith(ITEM_PREFIX)) return false
      const wsId = parseWorkspaceId(id.slice(ITEM_PREFIX.length))
      // 팔레트가 만든 id가 아니면 아무것도 하지 않는다
      if (!wsId) return true
      if (await d.waitKeysReleased()) d.hidePalette(true)
      await d.service.run(wsId, 'palette')
      return true
    },
    async saveAs(name) {
      const released = await d.waitKeysReleased()
      const r = await d.service.saveAs(name, 'palette')
      if (r.ok && released) d.hidePalette(true)
      return r
    }
  }
}
