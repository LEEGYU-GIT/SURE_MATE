import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { AppHotkeyId, SettingsHotkeyId } from '../../shared/settings/settings-snapshot'
import { WORKSPACE_LIMITS } from '../../shared/workspace/types'
import { parseWorkspaceId } from '../../shared/workspace/workspace-ipc'
import type { HotkeyChanger } from '../hotkeys/hotkey-change'
import { WORKSPACE_HOTKEY_PREFIX } from '../hotkeys/hotkey-manager'
import type { SettingsService } from './settings-service'

export interface SettingsIpcDeps {
  /** 지금 열린 설정 창의 webContents id(없으면 null) */
  contentsId(): number | null
  service: SettingsService
  /** 녹화 중인지는 트레이 일시 중지만 본다 */
  hotkeys: Omit<HotkeyChanger, 'recording'>
  openFile(which: 'settings' | 'logs'): void
  openOnboarding(): void
  finishOnboarding(): Promise<void>
  /** 첫 실행 안내의 워크스페이스 따라 해 보기: 지금 배치를 이 이름으로 저장(같은 이름이면 다시 저장, 알림 없이) */
  saveOnboardingWorkspace(name: string): Promise<unknown>
  templates: {
    list(): Promise<unknown>
    save(draft: unknown): Promise<unknown>
    remove(id: string): Promise<unknown>
    importFile(): Promise<unknown>
    exportFile(): Promise<unknown>
  }
  glossary: {
    list(): Promise<unknown>
    save(draft: unknown, o: { id?: string; allowDuplicate: boolean }): Promise<unknown>
    remove(id: string): Promise<unknown>
    pack(which: 'import' | 'export'): Promise<void>
  }
  references: {
    list(): unknown
    get(kind: string): string | null
    save(kind: string, text: string): Promise<unknown>
    remove(kind: string): Promise<unknown>
  }
  dictionary: {
    get(): Promise<{ terms: unknown[]; errors: string[] }>
    save(terms: unknown): Promise<unknown>
    importFile(): Promise<unknown>
    exportFile(): Promise<unknown>
  }
}

type Sender = { sender: { id: number } }
const BAD = '요청 형식이 맞지 않아요'
const APP_HOTKEY_IDS: readonly AppHotkeyId[] = ['palette', 'lookup', 'pet-control']
/** 앱 단축키 id, 또는 workspace:<워크스페이스 id>(id는 workspaces.json 규칙: 영문·숫자·하이픈 1~64자) */
const isHotkeyId = (v: unknown): v is SettingsHotkeyId =>
  APP_HOTKEY_IDS.includes(v as AppHotkeyId) ||
  (typeof v === 'string' && v.startsWith(WORKSPACE_HOTKEY_PREFIX) && parseWorkspaceId(v.slice(WORKSPACE_HOTKEY_PREFIX.length)) !== null)
const isAcc = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64

/**
 * 설정 창 IPC(설계 문서 §14). 설정 창 webContents가 보낸 것만 받는다(다른 창은 같은 preload를 써도 거절).
 * 값 검사는 받는 쪽(설정 서비스·단축키 바꾸기)이 다시 한다.
 */
export function registerSettingsIpc(d: SettingsIpcDeps): void {
  const fromSettings = (e: Sender): boolean => {
    const id = d.contentsId()
    return id !== null && e.sender.id === id
  }
  ipcMain.handle(IPC.settingsGet, (e) => (fromSettings(e) ? d.service.snapshot() : null))
  ipcMain.handle(IPC.settingsUpdate, (e, raw: unknown) => (fromSettings(e) ? d.service.update(raw) : { ok: false, errors: ['설정 창에서만 바꿀 수 있어요'] }))
  ipcMain.handle(IPC.settingsHotkeyCheck, (e, id: unknown, acc: unknown) =>
    fromSettings(e) && isHotkeyId(id) && isAcc(acc) ? d.hotkeys.check(id, acc) : { level: 'block', reason: BAD }
  )
  ipcMain.on(IPC.settingsHotkeyRecord, (e, on: unknown) => {
    if (!fromSettings(e) || typeof on !== 'boolean') return
    if (on) d.hotkeys.startRecording()
    else d.hotkeys.stopRecording()
  })
  // acc null은 비우기(조종 단축키). 어느 단축키를 비울 수 있는지는 단축키 바꾸기가 판단한다
  ipcMain.handle(IPC.settingsHotkeySet, (e, id: unknown, acc: unknown) =>
    fromSettings(e) && isHotkeyId(id) && (acc === null || isAcc(acc)) ? d.hotkeys.set(id, acc) : { ok: false, reason: BAD }
  )
  ipcMain.on(IPC.settingsOpenFile, (e, which: unknown) => {
    if (fromSettings(e) && (which === 'settings' || which === 'logs')) d.openFile(which)
  })
  ipcMain.on(IPC.settingsOpenOnboarding, (e) => {
    if (fromSettings(e)) d.openOnboarding()
  })
  ipcMain.handle(IPC.onboardingCandidates, (e) => (fromSettings(e) ? d.hotkeys.candidates() : []))
  ipcMain.handle(IPC.onboardingFinish, async (e) => {
    if (fromSettings(e)) await d.finishOnboarding()
  })
  ipcMain.handle(IPC.onboardingSaveWorkspace, (e, raw: unknown) => {
    const name = typeof raw === 'string' ? raw.trim() : ''
    const ok = fromSettings(e) && name.length > 0 && name.length <= WORKSPACE_LIMITS.name
    return ok ? d.saveOnboardingWorkspace(name) : { ok: false, reason: 'invalid', message: BAD }
  })
  const refused = { ok: false, errors: ['설정 창에서만 할 수 있어요'] }
  ipcMain.handle(IPC.settingsDictionary, (e) => (fromSettings(e) ? d.dictionary.get() : { terms: [], errors: [] }))
  ipcMain.handle(IPC.settingsDictionarySave, (e, terms: unknown) => (fromSettings(e) ? d.dictionary.save(terms) : refused))
  ipcMain.handle(IPC.settingsDictionaryImport, (e) => (fromSettings(e) ? d.dictionary.importFile() : refused))
  ipcMain.handle(IPC.settingsDictionaryExport, (e) => (fromSettings(e) ? d.dictionary.exportFile() : refused))
  ipcMain.handle(IPC.settingsTemplates, (e) => (fromSettings(e) ? d.templates.list() : { templates: [], mine: [], builtinIds: [], errors: [] }))
  ipcMain.handle(IPC.settingsTemplateSave, (e, draft: unknown) => (fromSettings(e) ? d.templates.save(draft) : refused))
  ipcMain.handle(IPC.settingsTemplateDelete, (e, id: unknown) =>
    fromSettings(e) && typeof id === 'string' && id.length <= 64 ? d.templates.remove(id) : { ok: false, reason: BAD }
  )
  ipcMain.handle(IPC.settingsTemplateImport, (e) => (fromSettings(e) ? d.templates.importFile() : refused))
  ipcMain.handle(IPC.settingsTemplateExport, (e) => (fromSettings(e) ? d.templates.exportFile() : refused))
  const isKind = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 40
  ipcMain.handle(IPC.settingsReferences, (e) => (fromSettings(e) ? d.references.list() : []))
  ipcMain.handle(IPC.settingsReferenceGet, (e, kind: unknown) => (fromSettings(e) && isKind(kind) ? d.references.get(kind) : null))
  ipcMain.handle(IPC.settingsReferenceSave, (e, kind: unknown, text: unknown) =>
    fromSettings(e) && isKind(kind) && typeof text === 'string' ? d.references.save(kind, text) : { ok: false, reason: BAD }
  )
  ipcMain.handle(IPC.settingsReferenceDelete, (e, kind: unknown) => (fromSettings(e) && isKind(kind) ? d.references.remove(kind) : { ok: false, reason: BAD }))
  ipcMain.handle(IPC.settingsGlossary, (e) => (fromSettings(e) ? d.glossary.list() : { entries: [], builtinIds: [] }))
  ipcMain.handle(IPC.settingsGlossarySave, (e, draft: unknown, o: unknown) => {
    if (!fromSettings(e)) return { ok: false, errors: ['설정 창에서만 할 수 있어요'] }
    const opts = typeof o === 'object' && o !== null ? (o as Record<string, unknown>) : {}
    const id = typeof opts.id === 'string' && opts.id.length <= 64 ? opts.id : undefined
    return d.glossary.save(draft, { ...(id ? { id } : {}), allowDuplicate: opts.allowDuplicate === true })
  })
  ipcMain.handle(IPC.settingsGlossaryDelete, (e, id: unknown) =>
    fromSettings(e) && typeof id === 'string' && id.length <= 64 ? d.glossary.remove(id) : { ok: false, reason: 'missing' }
  )
  ipcMain.handle(IPC.settingsGlossaryPack, async (e, which: unknown) => {
    if (fromSettings(e) && (which === 'import' || which === 'export')) await d.glossary.pack(which)
  })
}
