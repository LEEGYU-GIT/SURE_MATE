import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type ShownPayload, type SureMateApi } from '../shared/ipc-channels'

// sandbox: true라서 'electron' 말고는 require할 수 없다. 필요한 코드는 번들에 들어간다.
const api: SureMateApi = {
  hide: () => ipcRenderer.send(IPC.paletteHide),
  runItem: (id) => ipcRenderer.invoke(IPC.paletteRunItem, id),
  listItems: () => ipcRenderer.invoke(IPC.paletteListItems),
  previewPrompt: (req) => ipcRenderer.invoke(IPC.promptPreview, req),
  runPrompt: (req) => ipcRenderer.invoke(IPC.promptRun, req),
  cancelPrompt: () => ipcRenderer.send(IPC.promptCancel),
  getStatus: () => ipcRenderer.invoke(IPC.appGetStatus),
  getWikiEntry: (id) => ipcRenderer.invoke(IPC.wikiGet, id),
  copyWikiDefinition: (id) => ipcRenderer.invoke(IPC.wikiCopy, id),
  openWikiLink: (id, index) => ipcRenderer.invoke(IPC.wikiOpenLink, id, index),
  saveWikiEntry: (draft, o) => ipcRenderer.invoke(IPC.wikiSave, draft, o),
  onShown: (cb) => {
    const listener = (_e: IpcRendererEvent, payload: ShownPayload): void => cb(payload)
    ipcRenderer.on(IPC.paletteShown, listener)
    return () => ipcRenderer.removeListener(IPC.paletteShown, listener)
  },
  saveImeLog: (label, json) => ipcRenderer.invoke(IPC.devSaveImeLog, label, json)
}

contextBridge.exposeInMainWorld('sureMate', api)
