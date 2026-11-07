import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type ShownPayload, type SureMateApi } from '../shared/ipc-channels'

// sandbox: true라서 'electron' 말고는 require할 수 없다. 필요한 코드는 번들에 들어간다.
const api: SureMateApi = {
  hide: () => ipcRenderer.send(IPC.paletteHide),
  runItem: (id) => ipcRenderer.invoke(IPC.paletteRunItem, id),
  getStatus: () => ipcRenderer.invoke(IPC.appGetStatus),
  onShown: (cb) => {
    const listener = (_e: IpcRendererEvent, payload: ShownPayload): void => cb(payload)
    ipcRenderer.on(IPC.paletteShown, listener)
    return () => ipcRenderer.removeListener(IPC.paletteShown, listener)
  }
}

contextBridge.exposeInMainWorld('sureMate', api)
