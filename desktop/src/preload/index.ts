import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { BarViewState } from '../shared/bar/bar-items'
import type { FlyoutMessage } from '../shared/flyout/flyout-content'
import { IPC, type SettingsApi, type ShownPayload, type SureMateApi } from '../shared/ipc-channels'
import type { SettingsSnapshot } from '../shared/settings/settings-snapshot'

const settings: SettingsApi = {
  get: () => ipcRenderer.invoke(IPC.settingsGet),
  update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  onChanged: (cb) => {
    const listener = (_e: IpcRendererEvent, s: SettingsSnapshot): void => cb(s)
    ipcRenderer.on(IPC.settingsChanged, listener)
    return () => ipcRenderer.removeListener(IPC.settingsChanged, listener)
  },
  hotkeyCheck: (id, acc) => ipcRenderer.invoke(IPC.settingsHotkeyCheck, id, acc),
  hotkeyRecord: (on) => ipcRenderer.send(IPC.settingsHotkeyRecord, on),
  hotkeySet: (id, acc) => ipcRenderer.invoke(IPC.settingsHotkeySet, id, acc),
  openFile: (which) => ipcRenderer.send(IPC.settingsOpenFile, which),
  openOnboarding: () => ipcRenderer.send(IPC.settingsOpenOnboarding),
  onboardingCandidates: () => ipcRenderer.invoke(IPC.onboardingCandidates),
  finishOnboarding: () => ipcRenderer.invoke(IPC.onboardingFinish),
  onOnboardingProgress: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.onboardingProgress, listener)
    return () => ipcRenderer.removeListener(IPC.onboardingProgress, listener)
  }
}

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
  saveImeLog: (label, json) => ipcRenderer.invoke(IPC.devSaveImeLog, label, json),
  getBarState: () => ipcRenderer.invoke(IPC.barGetState),
  onBarState: (cb) => {
    const listener = (_e: IpcRendererEvent, s: BarViewState): void => cb(s)
    ipcRenderer.on(IPC.barState, listener)
    return () => ipcRenderer.removeListener(IPC.barState, listener)
  },
  barAction: (id) => ipcRenderer.send(IPC.barAction, id),
  barHover: (id) => ipcRenderer.send(IPC.barHover, id),
  barPointer: (inside) => ipcRenderer.send(IPC.barPointer, inside),
  barContextMenu: (y) => ipcRenderer.send(IPC.barContextMenu, y),
  barDrag: (phase, screenY) => ipcRenderer.send(IPC.barDrag, phase, screenY),
  getFlyoutContent: () => ipcRenderer.invoke(IPC.flyoutGetContent),
  onFlyoutContent: (cb) => {
    const listener = (_e: IpcRendererEvent, m: FlyoutMessage): void => cb(m)
    ipcRenderer.on(IPC.flyoutContent, listener)
    return () => ipcRenderer.removeListener(IPC.flyoutContent, listener)
  },
  onFlyoutShown: (cb) => {
    const listener = (_e: IpcRendererEvent, seq: number): void => cb(seq)
    ipcRenderer.on(IPC.flyoutShown, listener)
    return () => ipcRenderer.removeListener(IPC.flyoutShown, listener)
  },
  onFlyoutHidden: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.flyoutHidden, listener)
    return () => ipcRenderer.removeListener(IPC.flyoutHidden, listener)
  },
  flyoutReady: (seq, width, height) => ipcRenderer.send(IPC.flyoutReady, seq, width, height),
  flyoutPointer: (inside) => ipcRenderer.send(IPC.flyoutPointer, inside),
  flyoutAction: (a) => ipcRenderer.invoke(IPC.flyoutAction, a),
  settings
}

contextBridge.exposeInMainWorld('sureMate', api)
