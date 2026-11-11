import { sameAccelerator } from '../../shared/hotkeys/accelerator-input'
import type { Workspace } from '../../shared/workspace/types'
import { errorText } from '../error-text'
import type { WorkspaceHotkeySide } from '../hotkeys/hotkey-change'
import { type HotkeyManager, isWorkspaceHotkey, workspaceHotkeyId } from '../hotkeys/hotkey-manager'
import type { WorkspaceService } from './workspace-service'

export interface WorkspaceHotkeysDeps {
  manager: Pick<HotkeyManager, 'bind' | 'unbind' | 'ids' | 'current'>
  service: Pick<WorkspaceService, 'list' | 'setHotkey' | 'run'>
  /** id·결과·까닭만 남긴다(워크스페이스 이름 금지) */
  log(event: string, data: Record<string, unknown>): void
}

export interface WorkspaceHotkeys extends WorkspaceHotkeySide {
  /** 목록에 맞춰 등록·해제한다(시작할 때와 목록이 바뀔 때마다). 등록하지 못한 조합을 돌려준다 */
  sync(list: Workspace[]): { failed: { id: string; hotkey: string }[] }
}

/**
 * 워크스페이스 단축키(설계 §11): 누르면 그 워크스페이스를 불러온다(source 'hotkey'). 설정 창에서 바꾸는 일은 단축키 바꾸기
 * (hotkey-change.ts, id workspace:<id>)가 하고, 여기서는 그쪽에 처리기·저장·이름을 넘긴다.
 * 모든 워크스페이스에 처리기를 둬서(조합이 없으면 처리기만) 설정 창에서 처음 정할 때도 rebind로 붙는다.
 */
export function createWorkspaceHotkeys(d: WorkspaceHotkeysDeps): WorkspaceHotkeys {
  /** 처리기를 붙인 워크스페이스. 처리기는 워크스페이스 id만 쓰므로 한 번 붙이면 계속 쓴다 */
  const handled = new Set<string>()
  /** 마지막으로 본 이름(겹침·알림 문구용) */
  let names = new Map<string, string>()

  const handler =
    (id: string) =>
    (): void => {
      d.service.run(id, 'hotkey').catch((e) => d.log('workspace.hotkeyError', { id, error: errorText(e) }))
    }

  /** 처리기를 붙인 적이 없으면 붙인다(그 id의 조합도 없다: 조합은 처리기가 있어야 등록된다) */
  const ensureHandler = (id: string): void => {
    if (handled.has(id)) return
    d.manager.bind(workspaceHotkeyId(id), null, handler(id))
    handled.add(id)
  }

  return {
    sync(list) {
      names = new Map(list.map((w) => [w.id, w.name]))
      const wanted = new Map(list.flatMap((w) => (w.hotkey ? [[workspaceHotkeyId(w.id), w.hotkey] as const] : [])))
      // 먼저 지운 워크스페이스·비운 단축키·바뀐 조합을 모두 푼다(바뀐 조합끼리 서로 막지 않게)
      for (const hid of d.manager.ids()) {
        if (!isWorkspaceHotkey(hid)) continue
        const want = wanted.get(hid)
        const now = d.manager.current(hid)
        if (want === undefined || now === undefined || !sameAccelerator(now, want)) d.manager.unbind(hid)
      }
      const failed: { id: string; hotkey: string }[] = []
      for (const w of list) {
        const hid = workspaceHotkeyId(w.id)
        if (!w.hotkey) {
          ensureHandler(w.id)
          continue
        }
        // 같은 조합으로 이미 등록됨(일시 중지 중인 것 포함)
        if (d.manager.current(hid) !== undefined) continue
        const r = d.manager.bind(hid, w.hotkey, handler(w.id))
        handled.add(w.id)
        d.log('workspace.hotkey', r.ok ? { id: w.id, ok: true } : { id: w.id, ok: false, reason: r.reason })
        if (!r.ok) failed.push({ id: w.id, hotkey: w.hotkey })
      }
      return { failed }
    },

    async prepare(id) {
      const ws = (await d.service.list()).find((w) => w.id === id)
      if (!ws) return false
      names.set(ws.id, ws.name)
      ensureHandler(ws.id)
      return true
    },

    save: (id, acc) => d.service.setHotkey(id, acc),

    name: (id) => names.get(id) ?? null
  }
}
