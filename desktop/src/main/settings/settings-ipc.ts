import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { SettingsHotkeyId } from '../../shared/settings/settings-snapshot'
import type { HotkeyChanger } from '../hotkeys/hotkey-change'
import type { SettingsService } from './settings-service'

export interface SettingsIpcDeps {
  /** 지금 열린 설정 창의 webContents id(없으면 null) */
  contentsId(): number | null
  service: SettingsService
  hotkeys: HotkeyChanger
  openFile(which: 'settings' | 'logs'): void
  openOnboarding(): void
  finishOnboarding(): Promise<void>
  dictionary: {
    get(): Promise<{ terms: unknown[]; errors: string[] }>
    save(terms: unknown): Promise<unknown>
    importFile(): Promise<unknown>
    exportFile(): Promise<unknown>
  }
}

type Sender = { sender: { id: number } }
const BAD = '요청 형식이 맞지 않아요'
const HOTKEY_IDS: readonly SettingsHotkeyId[] = ['palette', 'lookup']
const isHotkeyId = (v: unknown): v is SettingsHotkeyId => HOTKEY_IDS.includes(v as SettingsHotkeyId)
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
  ipcMain.handle(IPC.settingsHotkeySet, (e, id: unknown, acc: unknown) =>
    fromSettings(e) && isHotkeyId(id) && isAcc(acc) ? d.hotkeys.set(id, acc) : { ok: false, reason: BAD }
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
  const refused = { ok: false, errors: ['설정 창에서만 할 수 있어요'] }
  ipcMain.handle(IPC.settingsDictionary, (e) => (fromSettings(e) ? d.dictionary.get() : { terms: [], errors: [] }))
  ipcMain.handle(IPC.settingsDictionarySave, (e, terms: unknown) => (fromSettings(e) ? d.dictionary.save(terms) : refused))
  ipcMain.handle(IPC.settingsDictionaryImport, (e) => (fromSettings(e) ? d.dictionary.importFile() : refused))
  ipcMain.handle(IPC.settingsDictionaryExport, (e) => (fromSettings(e) ? d.dictionary.exportFile() : refused))
}
