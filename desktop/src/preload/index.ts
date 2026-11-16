import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { BarViewState } from '../shared/bar/bar-items'
import type { FlyoutMessage } from '../shared/flyout/flyout-content'
import { IPC, type OnboardingProgress, type SettingsApi, type ShownPayload, type SureMateApi } from '../shared/ipc-channels'
import type { NaturalView } from '../shared/natural/natural-ipc'
import type { PetView } from '../shared/pet/pet-view'
import type { SettingsTabId } from '../shared/settings/settings-route'
import type { SettingsSnapshot } from '../shared/settings/settings-snapshot'
import type { WorkspaceListView } from '../shared/workspace/workspace-ipc'

const settings: SettingsApi = {
  get: () => ipcRenderer.invoke(IPC.settingsGet),
  update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  onChanged: (cb) => {
    const listener = (_e: IpcRendererEvent, s: SettingsSnapshot): void => cb(s)
    ipcRenderer.on(IPC.settingsChanged, listener)
    return () => ipcRenderer.removeListener(IPC.settingsChanged, listener)
  },
  // 받은 탭 id·워크스페이스 id는 화면(SettingsApp)이 다시 확인한다
  onShowTab: (cb) => {
    const listener = (_e: IpcRendererEvent, tab: SettingsTabId, ws?: string | null): void => cb(tab, ws ?? null)
    ipcRenderer.on(IPC.settingsShowTab, listener)
    return () => ipcRenderer.removeListener(IPC.settingsShowTab, listener)
  },
  hotkeyCheck: (id, acc) => ipcRenderer.invoke(IPC.settingsHotkeyCheck, id, acc),
  hotkeyRecord: (on) => ipcRenderer.send(IPC.settingsHotkeyRecord, on),
  onHotkeyRecordEnded: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.settingsHotkeyRecordEnded, listener)
    return () => ipcRenderer.removeListener(IPC.settingsHotkeyRecordEnded, listener)
  },
  hotkeySet: (id, acc) => ipcRenderer.invoke(IPC.settingsHotkeySet, id, acc),
  openFile: (which) => ipcRenderer.send(IPC.settingsOpenFile, which),
  openOnboarding: () => ipcRenderer.send(IPC.settingsOpenOnboarding),
  awayPreview: () => ipcRenderer.send(IPC.settingsAwayPreview),
  onboardingCandidates: () => ipcRenderer.invoke(IPC.onboardingCandidates),
  finishOnboarding: () => ipcRenderer.invoke(IPC.onboardingFinish),
  // 받은 진행은 화면(onboarding-state)이 다시 확인한다
  onOnboardingProgress: (cb) => {
    const listener = (_e: IpcRendererEvent, p: OnboardingProgress): void => cb(p)
    ipcRenderer.on(IPC.onboardingProgress, listener)
    return () => ipcRenderer.removeListener(IPC.onboardingProgress, listener)
  },
  onboardingSaveWorkspace: (name) => ipcRenderer.invoke(IPC.onboardingSaveWorkspace, name),
  dictionary: () => ipcRenderer.invoke(IPC.settingsDictionary),
  dictionarySave: (terms) => ipcRenderer.invoke(IPC.settingsDictionarySave, terms),
  dictionaryImport: () => ipcRenderer.invoke(IPC.settingsDictionaryImport),
  dictionaryExport: () => ipcRenderer.invoke(IPC.settingsDictionaryExport),
  templates: () => ipcRenderer.invoke(IPC.settingsTemplates),
  templateSave: (draft) => ipcRenderer.invoke(IPC.settingsTemplateSave, draft),
  templateDelete: (id) => ipcRenderer.invoke(IPC.settingsTemplateDelete, id),
  templateImport: () => ipcRenderer.invoke(IPC.settingsTemplateImport),
  templateExport: () => ipcRenderer.invoke(IPC.settingsTemplateExport),
  references: () => ipcRenderer.invoke(IPC.settingsReferences),
  referenceGet: (kind) => ipcRenderer.invoke(IPC.settingsReferenceGet, kind),
  referenceSave: (kind, text) => ipcRenderer.invoke(IPC.settingsReferenceSave, kind, text),
  referenceDelete: (kind) => ipcRenderer.invoke(IPC.settingsReferenceDelete, kind),
  glossary: () => ipcRenderer.invoke(IPC.settingsGlossary),
  glossarySave: (draft, o) => ipcRenderer.invoke(IPC.settingsGlossarySave, draft, o),
  glossaryDelete: (id) => ipcRenderer.invoke(IPC.settingsGlossaryDelete, id),
  glossaryPack: (which) => ipcRenderer.invoke(IPC.settingsGlossaryPack, which)
}

// sandbox: true라서 'electron' 말고는 require할 수 없다. 필요한 코드는 번들에 들어간다.
const api: SureMateApi = {
  hide: () => ipcRenderer.send(IPC.paletteHide),
  runItem: (id) => ipcRenderer.invoke(IPC.paletteRunItem, id),
  listItems: () => ipcRenderer.invoke(IPC.paletteListItems),
  getSearchContext: () => ipcRenderer.invoke(IPC.paletteSearchContext),
  recordPick: (p) => ipcRenderer.send(IPC.palettePick, p),
  previewPrompt: (req) => ipcRenderer.invoke(IPC.promptPreview, req),
  runPrompt: (req) => ipcRenderer.invoke(IPC.promptRun, req),
  cancelPrompt: () => ipcRenderer.send(IPC.promptCancel),
  maskingTipSeen: (reason) => ipcRenderer.send(IPC.maskingTipSeen, reason),
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
  barAction: (id, how) => ipcRenderer.send(IPC.barAction, id, how),
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
  getPetView: () => ipcRenderer.invoke(IPC.petGetView),
  onPetView: (cb) => {
    const listener = (_e: IpcRendererEvent, v: PetView): void => cb(v)
    ipcRenderer.on(IPC.petView, listener)
    return () => ipcRenderer.removeListener(IPC.petView, listener)
  },
  petPress: (down) => ipcRenderer.send(IPC.petPress, down),
  petContextMenu: () => ipcRenderer.send(IPC.petContextMenu),
  petBubbleClick: () => ipcRenderer.send(IPC.petBubbleClick),
  petBubbleRect: (r) => ipcRenderer.send(IPC.petBubbleRect, r),
  petMenu: (a) => ipcRenderer.send(IPC.petMenu, a),
  petKey: (k, down) => ipcRenderer.send(IPC.petKey, k, down),
  settings,
  listWorkspaces: () => ipcRenderer.invoke(IPC.workspaceList),
  onWorkspacesChanged: (cb) => {
    const listener = (_e: IpcRendererEvent, v: WorkspaceListView): void => cb(v)
    ipcRenderer.on(IPC.workspaceChanged, listener)
    return () => ipcRenderer.removeListener(IPC.workspaceChanged, listener)
  },
  getWorkspace: (id) => ipcRenderer.invoke(IPC.workspaceGet, id),
  editWorkspace: (id, edit) => ipcRenderer.invoke(IPC.workspaceEdit, id, edit),
  recaptureWorkspace: (id) => ipcRenderer.invoke(IPC.workspaceRecapture, id),
  runWorkspace: (id) => ipcRenderer.invoke(IPC.workspaceRun, id),
  saveWorkspaceNew: () => ipcRenderer.invoke(IPC.workspaceSaveNew),
  removeWorkspace: (id) => ipcRenderer.invoke(IPC.workspaceRemove, id),
  setWorkspaceKeepOnTop: (id, on) => ipcRenderer.invoke(IPC.workspaceSetKeepOnTop, id, on),
  saveWorkspaceAs: (name) => ipcRenderer.invoke(IPC.workspaceSaveAs, name),
  naturalView: () => ipcRenderer.invoke(IPC.naturalView),
  onNaturalChanged: (cb) => {
    const listener = (_e: IpcRendererEvent, v: NaturalView): void => cb(v)
    ipcRenderer.on(IPC.naturalChanged, listener)
    return () => ipcRenderer.removeListener(IPC.naturalChanged, listener)
  },
  forgetPhrase: (key) => ipcRenderer.invoke(IPC.naturalForget, key),
  forgetAllPhrases: () => ipcRenderer.invoke(IPC.naturalForgetAll),
  clearUsage: () => ipcRenderer.invoke(IPC.naturalClearUsage),
  openIntentsFile: () => ipcRenderer.invoke(IPC.naturalOpenIntents)
}

contextBridge.exposeInMainWorld('sureMate', api)
