import { ipcMain } from 'electron'
import { IPC, type AppStatus } from '../shared/ipc-channels'

export interface IpcDeps {
  hide: () => void
  runItem: (id: string) => Promise<void>
  getStatus: () => AppStatus
}

export function registerIpc(d: IpcDeps): void {
  ipcMain.on(IPC.paletteHide, () => d.hide())
  ipcMain.handle(IPC.paletteRunItem, (_e, id: unknown) => d.runItem(String(id)))
  ipcMain.handle(IPC.appGetStatus, () => d.getStatus())
}
