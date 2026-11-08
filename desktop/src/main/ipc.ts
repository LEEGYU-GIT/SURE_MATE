import { ipcMain } from 'electron'
import { IPC, type AppStatus } from '../shared/ipc-channels'
import type { PaletteItem } from '../shared/types'

export interface IpcDeps {
  hide: () => void
  runItem: (id: string) => Promise<void>
  listItems: () => PaletteItem[]
  getStatus: () => AppStatus
  saveImeLog: (label: string, json: string) => Promise<string>
}

export function registerIpc(d: IpcDeps): void {
  ipcMain.on(IPC.paletteHide, () => d.hide())
  ipcMain.handle(IPC.paletteRunItem, (_e, id: unknown) => d.runItem(String(id)))
  ipcMain.handle(IPC.paletteListItems, () => d.listItems())
  ipcMain.handle(IPC.appGetStatus, () => d.getStatus())
  ipcMain.handle(IPC.devSaveImeLog, (_e, label: unknown, json: unknown) => d.saveImeLog(String(label), String(json)))
}
