import { ipcMain } from 'electron'
import { parseBarDrag } from '../shared/bar/bar-ipc'
import type { BarShape } from '../shared/bar/bar-settings'
import { parseFlyoutAction, parseFlyoutReady } from '../shared/flyout/flyout-action'
import type { FlyoutAction } from '../shared/flyout/flyout-content'
import { IPC, type AppStatus, type PromptPreview, type PromptRequest, type PromptRunResult } from '../shared/ipc-channels'
import { parsePromptRequest } from '../shared/prompt-request'
import type { PaletteItem } from '../shared/types'
import type { BarRuntime } from './bar/bar-runtime'
import type { GlossaryRuntime } from './glossary/glossary-runtime'

export interface IpcDeps {
  hide: () => void
  runItem: (id: string) => Promise<void>
  listItems: () => Promise<PaletteItem[]>
  previewPrompt: (req: PromptRequest) => Promise<PromptPreview>
  runPrompt: (req: PromptRequest) => Promise<PromptRunResult>
  cancelPrompt: () => void
  getStatus: () => AppStatus
  wiki: GlossaryRuntime
  saveImeLog: (label: string, json: string) => Promise<string>
  /** 바·펼침 창(아직 없거나 시작에 실패했으면 null) */
  barRuntime: () => BarRuntime | null
  barAction: (id: string) => Promise<void>
  flyoutAction: (a: FlyoutAction) => Promise<boolean>
  barShape: () => BarShape
}

const BAD_REQUEST = '요청 형식이 맞지 않아요.'

/** renderer가 보낸 용어 id(문자열, 200자 이하)만 받는다 */
const wikiId = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : null)

export function registerIpc(d: IpcDeps): void {
  ipcMain.on(IPC.paletteHide, () => d.hide())
  ipcMain.handle(IPC.paletteRunItem, (_e, id: unknown) => d.runItem(String(id)))
  ipcMain.handle(IPC.paletteListItems, () => d.listItems())
  ipcMain.handle(IPC.promptPreview, (_e, raw: unknown): Promise<PromptPreview> => {
    const req = parsePromptRequest(raw)
    return req
      ? d.previewPrompt(req)
      : Promise.resolve({
          text: '',
          truncated: false,
          inputLength: 0,
          warnings: [BAD_REQUEST],
          notes: [],
          highlights: [],
          masking: { mode: 'restore', items: [] },
          maskRanges: []
        })
  })
  ipcMain.handle(IPC.promptRun, (_e, raw: unknown): Promise<PromptRunResult> => {
    const req = parsePromptRequest(raw)
    return req ? d.runPrompt(req) : Promise.resolve({ ok: false, message: BAD_REQUEST })
  })
  ipcMain.on(IPC.promptCancel, () => d.cancelPrompt())
  ipcMain.handle(IPC.appGetStatus, () => d.getStatus())
  ipcMain.handle(IPC.wikiGet, (_e, id: unknown) => {
    const ok = wikiId(id)
    return ok ? d.wiki.get(ok) : null
  })
  ipcMain.handle(IPC.wikiCopy, (_e, id: unknown) => {
    const ok = wikiId(id)
    return ok ? d.wiki.copy(ok) : false
  })
  ipcMain.handle(IPC.wikiOpenLink, (_e, id: unknown, index: unknown) => {
    const ok = wikiId(id)
    return ok && Number.isInteger(index) && (index as number) >= 0 && (index as number) < 10 ? d.wiki.openLink(ok, index as number) : false
  })
  // 내용 검사는 런타임이 팩과 같은 규칙으로 한다. 여기서는 옵션 모양만 본다
  ipcMain.handle(IPC.wikiSave, (_e, draft: unknown, options: unknown) => {
    const o = typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : {}
    const id = o.id === undefined ? undefined : wikiId(o.id)
    if (o.id !== undefined && !id) return { ok: false, errors: [BAD_REQUEST] }
    return d.wiki.save(draft, { ...(id ? { id } : {}), allowDuplicate: o.allowDuplicate === true })
  })
  ipcMain.handle(IPC.devSaveImeLog, (_e, label: unknown, json: unknown) => d.saveImeLog(String(label), String(json)))

  // ── 바 ───────────────────────────────────────────
  ipcMain.handle(IPC.barGetState, () => d.barRuntime()?.bar.state() ?? null)
  ipcMain.on(IPC.barAction, (_e, id: unknown) => {
    if (typeof id === 'string' && id.length > 0 && id.length <= 200) void d.barAction(id)
  })
  ipcMain.on(IPC.barHover, (_e, id: unknown) => {
    const r = d.barRuntime()
    if (!r) return
    if (id === null) r.flyout.hover(null)
    else if (typeof id === 'string' && r.bar.hasItem(id)) r.flyout.hover(id)
  })
  ipcMain.on(IPC.barPointer, (_e, inside: unknown) => {
    if (typeof inside === 'boolean') d.barRuntime()?.bar.pointer(inside)
  })
  ipcMain.on(IPC.barContextMenu, (_e, y: unknown) => {
    const r = d.barRuntime()
    const anchor = r?.bar.anchor(null)
    if (!r || !anchor || typeof y !== 'number' || !Number.isFinite(y) || y < 0) return
    r.flyout.toggleMenu({ kind: 'bar-menu', shape: d.barShape() }, null, anchor.bar.y + y)
  })
  ipcMain.on(IPC.barDrag, (_e, phase: unknown, y: unknown) => {
    const p = parseBarDrag(phase, y)
    const r = d.barRuntime()
    if (!p || !r) return
    // 끌기 시작하면 이름표·메뉴를 닫는다
    if (p.phase === 'start') r.flyout.close('drag')
    r.bar.drag(p.phase, p.screenY)
  })

  // ── 펼침 창 ──────────────────────────────────────
  ipcMain.handle(IPC.flyoutGetContent, () => d.barRuntime()?.flyout.message() ?? null)
  ipcMain.on(IPC.flyoutReady, (_e, seq: unknown, w: unknown, h: unknown) => {
    const p = parseFlyoutReady(seq, w, h)
    if (p) d.barRuntime()?.flyout.ready(p.seq, { width: p.width, height: p.height })
  })
  ipcMain.on(IPC.flyoutPointer, (_e, inside: unknown) => {
    if (typeof inside === 'boolean') d.barRuntime()?.flyout.pointer(inside)
  })
  ipcMain.handle(IPC.flyoutAction, (_e, raw: unknown) => {
    const a = parseFlyoutAction(raw)
    return a ? d.flyoutAction(a) : false
  })
}
