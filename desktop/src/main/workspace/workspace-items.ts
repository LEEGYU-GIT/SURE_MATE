import type { PaletteItem } from '../../shared/types'
import type { Workspace } from '../../shared/workspace/types'
import { parseWorkspaceId, type WorkspaceSaveResult } from '../../shared/workspace/workspace-ipc'
import type { WorkspaceService } from './workspace-service'

/** 팔레트 명령 "지금 배치 저장" */
export const WORKSPACE_SAVE_ID = 'cmd.workspace-save'
/** 워크스페이스 항목 id는 `workspace:<워크스페이스 id>` */
const ITEM_PREFIX = 'workspace:'

const time = (iso: string): number => {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

/**
 * 팔레트 워크스페이스 구역(설계 §6 `@`, §11): 맨 앞에 "지금 배치 저장"(워크스페이스 구역이라 `@`에서도 보인다),
 * 이어서 워크스페이스를 최근에 바꾼 순서로. 부제는 포함한 창 수와 단축키, 지금 모니터 구성에서 저장한 배치가 없으면
 * '다른 모니터 구성'(불러오면 먼저 묻는다). 별칭은 키워드. 문구는 Task 8의 ux-copy에서 다듬는다.
 */
export function workspacePaletteItems(list: readonly Workspace[], fingerprint: string): PaletteItem[] {
  const save: PaletteItem = {
    id: WORKSPACE_SAVE_ID,
    group: 'workspace',
    title: '지금 배치 저장',
    subtitle: '지금 열린 창 위치를 새 워크스페이스로 저장해요',
    keywords: ['save', 'workspace', 'layout', '워크스페이스', '레이아웃', '창 배치', '배치 저장']
  }
  const sorted = [...list].sort((a, b) => time(b.updatedAt) - time(a.updatedAt))
  return [
    save,
    ...sorted.map((ws): PaletteItem => {
      const own = Object.hasOwn(ws.layouts, fingerprint) ? ws.layouts[fingerprint] : undefined
      // 다른 구성이면 불러올 때 모을 배치(첫 배치)의 창 수
      const layout = own ?? Object.values(ws.layouts)[0]
      const windows = layout ? layout.windows.filter((r) => r.enabled).length : 0
      const parts = [`창 ${windows}개`]
      if (ws.hotkey) parts.push(ws.hotkey)
      if (!own) parts.push('다른 모니터 구성')
      return { id: `${ITEM_PREFIX}${ws.id}`, group: 'workspace', title: ws.name, subtitle: parts.join(' · '), keywords: [...ws.aliases] }
    })
  ]
}

export interface WorkspaceCommandDeps {
  service: Pick<WorkspaceService, 'saveNew' | 'saveAs' | 'run'>
  /** 항목을 고른 Enter·보조키를 뗄 때까지 기다린다. 시간 안에 안 떼면 false(그때는 팔레트를 숨기지 않는다) */
  waitKeysReleased(): Promise<boolean>
  hidePalette(restoreFocus: boolean): void
}

/**
 * 팔레트의 워크스페이스 명령. 누른 채로 숨기면 자동 반복 Enter가 원래 앱으로 가므로, 키를 뗀 것을 확인했을 때만 숨긴다.
 * - "지금 배치 저장"·다른 이름으로 저장(`@이름` 줄): 키 확인 → 저장 → 성공이고 뗐으면 팔레트를 숨기고 원래 창으로.
 *   팔레트(Sure-Mate 자신의 창)는 저장 대상이 아니다. 실패하면 알림을 보고 팔레트에서 다시 할 수 있게 둔다.
 * - `workspace:<id>`: 키를 뗐으면 팔레트를 숨기고(원래 창으로) 불러온다. 떼지 않았으면 팔레트를 둔 채 불러온다(M5 바 명령과 같은 규칙).
 */
export function createWorkspaceCommands(d: WorkspaceCommandDeps): {
  run(id: string): Promise<boolean>
  saveAs(name: string): Promise<WorkspaceSaveResult>
} {
  return {
    async run(id) {
      if (id === WORKSPACE_SAVE_ID) {
        const released = await d.waitKeysReleased()
        const r = await d.service.saveNew({ source: 'palette' })
        if (r.ok && released) d.hidePalette(true)
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
