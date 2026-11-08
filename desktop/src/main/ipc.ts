import { ipcMain } from 'electron'
import { IPC, type AppStatus, type PromptPreview, type PromptRequest, type PromptRunResult } from '../shared/ipc-channels'
import { parsePromptRequest } from '../shared/prompt-request'
import type { PaletteItem } from '../shared/types'

export interface IpcDeps {
  hide: () => void
  runItem: (id: string) => Promise<void>
  listItems: () => Promise<PaletteItem[]>
  previewPrompt: (req: PromptRequest) => Promise<PromptPreview>
  runPrompt: (req: PromptRequest) => Promise<PromptRunResult>
  cancelPrompt: () => void
  getStatus: () => AppStatus
  saveImeLog: (label: string, json: string) => Promise<string>
}

const BAD_REQUEST = '요청 형식이 맞지 않아요.'

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
  ipcMain.handle(IPC.devSaveImeLog, (_e, label: unknown, json: unknown) => d.saveImeLog(String(label), String(json)))
}
