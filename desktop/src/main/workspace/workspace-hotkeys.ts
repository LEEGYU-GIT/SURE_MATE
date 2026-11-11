import { sameAccelerator } from '../../shared/hotkeys/accelerator-input'
import type { Workspace } from '../../shared/workspace/types'
import { errorText } from '../error-text'
import type { WorkspaceHotkeySide } from '../hotkeys/hotkey-change'
import { type HotkeyManager, isWorkspaceHotkey, workspaceHotkeyId } from '../hotkeys/hotkey-manager'
import type { WorkspaceService } from './workspace-service'

export interface WorkspaceHotkeysDeps {
  manager: Pick<HotkeyManager, 'bind' | 'unbind' | 'ids' | 'current'>
  service: Pick<WorkspaceService, 'list' | 'setHotkey' | 'run'>
  /**
   * 누른 뒤 불러오기 전에 부른다(index.ts의 beforeCapture): 말랑 메이트 조종 중이면 원래 창으로 포커스를 돌리며 조종을 끝내고
   * 그 창이 앞에 올 때까지 기다린다(M6 최종 검토 I1). 조종 중에는 펫 창이 앞에 있어, 불러오기가 시작 때 앞 창으로 기억했다가
   * 끝에 펫 창을 다시 앞으로 가져온다. 없으면 바로 불러온다
   */
  beforeRun?(): Promise<void>
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
  /** workspaces.json에 저장된 조합(워크스페이스 id → 조합). 등록하지 못한 조합도 겹침 검사가 본다(A-M7) */
  let savedHotkeys = new Map<string, string>()

  const handler =
    (id: string) =>
    (): void => {
      const run = (): Promise<unknown> => d.service.run(id, 'hotkey')
      // 조종 중이면 먼저 원래 창으로 돌려 둔 뒤 불러온다(I1). 넘겨주기가 실패하면 불러오지 않고 기록만 한다
      const started = d.beforeRun ? d.beforeRun().then(run) : run()
      started.catch((e) => d.log('workspace.hotkeyError', { id, error: errorText(e) }))
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
      savedHotkeys = new Map(list.flatMap((w) => (w.hotkey ? [[w.id, w.hotkey] as const] : [])))
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

    async save(id, acc) {
      const ok = await d.service.setHotkey(id, acc)
      // 목록이 바뀌어 다시 맞추기(sync) 전에도 겹침 검사가 저장한 조합을 보게
      if (ok) {
        if (acc === null) savedHotkeys.delete(id)
        else savedHotkeys.set(id, acc)
      }
      return ok
    },

    name: (id) => names.get(id) ?? null,

    saved: () => savedHotkeys.entries()
  }
}
