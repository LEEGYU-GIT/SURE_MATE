import { ipcMain } from 'electron'
import { IPC, type AppStatus, type PromptPreview, type PromptRequest, type PromptRunResult } from '../shared/ipc-channels'
import { parsePromptRequest } from '../shared/prompt-request'
import type { PaletteItem } from '../shared/types'
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
}
