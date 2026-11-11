import { beforeEach, expect, it, vi } from 'vitest'
import { IPC } from '../../shared/ipc-channels'
import { DEFAULT_SETTINGS } from '../../shared/settings/settings'
import type { SettingsSnapshot } from '../../shared/settings/settings-snapshot'

// ipcMain을 흉내 내 등록된 처리기를 직접 부른다
type Listener = (e: { sender: { id: number } }, ...args: unknown[]) => unknown
const reg = vi.hoisted(() => ({ on: new Map<string, Listener>(), handle: new Map<string, Listener>() }))
vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, fn: Listener) => void reg.on.set(channel, fn),
    handle: (channel: string, fn: Listener) => void reg.handle.set(channel, fn)
  }
}))

import { registerSettingsIpc, type SettingsIpcDeps } from './settings-ipc'

const SETTINGS = { sender: { id: 31 } }
const PALETTE = { sender: { id: 1 } }
const snapshot: SettingsSnapshot = {
  settings: DEFAULT_SETTINGS,
  aiTargets: [],
  hotkeys: { palette: { acc: 'Alt+`', registered: true }, lookup: { acc: 'Ctrl+Alt+W', registered: true } },
  displays: [],
  prompts: [],
  packaged: false
}

function deps(): SettingsIpcDeps & { [k: string]: unknown } {
  return {
    contentsId: () => 31,
    service: { snapshot: vi.fn(() => snapshot), update: vi.fn(async () => ({ ok: true as const, snapshot })), changed: vi.fn(), onChanged: vi.fn(() => () => {}) },
    hotkeys: {
      check: vi.fn(() => ({ level: 'ok' as const })),
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      set: vi.fn(async (_id: string, acc: string) => ({ ok: true as const, acc })),
      candidates: vi.fn(() => []),
      dispose: vi.fn()
    },
    openFile: vi.fn(),
    openOnboarding: vi.fn(),
    finishOnboarding: vi.fn(async () => {}),
    templates: {
      list: vi.fn(async () => ({ templates: [] })),
      save: vi.fn(async () => ({ ok: true, id: 'my-1' })),
      remove: vi.fn(async () => ({ ok: true })),
      importFile: vi.fn(async () => ({ canceled: true })),
      exportFile: vi.fn(async () => ({ canceled: true }))
    },
    glossary: {
      list: vi.fn(async () => ({ entries: [], builtinIds: [] })),
      save: vi.fn(async () => ({ ok: true })),
      remove: vi.fn(async () => ({ ok: true })),
      pack: vi.fn(async () => {})
    },
    references: { list: vi.fn(() => []), get: vi.fn(() => '글'), save: vi.fn(async () => ({ ok: true })), remove: vi.fn(async () => ({ ok: true })) },
    dictionary: { get: vi.fn(async () => ({ terms: [], errors: [] })), save: vi.fn(async () => ({ ok: true, count: 0 })), importFile: vi.fn(async () => ({ canceled: true })), exportFile: vi.fn(async () => ({ canceled: true })) }
  }
}

let d: ReturnType<typeof deps>
beforeEach(() => {
  reg.on.clear()
  reg.handle.clear()
  d = deps()
  registerSettingsIpc(d)
})
const handle = (channel: string, e: { sender: { id: number } }, ...args: unknown[]) => reg.handle.get(channel)!(e, ...args)
const send = (channel: string, e: { sender: { id: number } }, ...args: unknown[]) => reg.on.get(channel)!(e, ...args)

it('설정 창이 보낸 요청만 처리한다(다른 창은 빈 결과·거절)', async () => {
  expect(await handle(IPC.settingsGet, SETTINGS)).toBe(snapshot)
  expect(await handle(IPC.settingsGet, PALETTE)).toBeNull()
  expect(await handle(IPC.settingsUpdate, PALETTE, { bar: { opacity: 0.8 } })).toEqual({ ok: false, errors: ['설정 창에서만 바꿀 수 있어요'] })
  expect(d.service.update).not.toHaveBeenCalled()
  send(IPC.settingsHotkeyRecord, PALETTE, true)
  expect(d.hotkeys.startRecording).not.toHaveBeenCalled()
  send(IPC.settingsOpenFile, PALETTE, 'settings')
  expect(d.openFile).not.toHaveBeenCalled()
  // 설정 창이 없으면(닫힘) 아무 창도 받지 않는다
  d.contentsId = () => null
  expect(await handle(IPC.settingsGet, SETTINGS)).toBeNull()
})

it('저장 요청은 서비스에 그대로 넘긴다(검사는 서비스가 한다)', async () => {
  await handle(IPC.settingsUpdate, SETTINGS, { bar: { opacity: 0.8 } })
  expect(d.service.update).toHaveBeenCalledWith({ bar: { opacity: 0.8 } })
})

it('단축키: id는 palette·lookup만, 조합은 64자 안의 글자, 녹화는 켬·끔만', async () => {
  expect(await handle(IPC.settingsHotkeySet, SETTINGS, 'palette', 'Alt+K')).toEqual({ ok: true, acc: 'Alt+K' })
  expect(await handle(IPC.settingsHotkeySet, SETTINGS, 'quit', 'Alt+K')).toEqual({ ok: false, reason: '요청 형식이 맞지 않아요' })
  expect(await handle(IPC.settingsHotkeySet, SETTINGS, 'palette', 'x'.repeat(65))).toEqual({ ok: false, reason: '요청 형식이 맞지 않아요' })
  expect(await handle(IPC.settingsHotkeyCheck, SETTINGS, 'lookup', 'Alt+K')).toEqual({ level: 'ok' })
  expect(await handle(IPC.settingsHotkeyCheck, SETTINGS, 'lookup', 3)).toEqual({ level: 'block', reason: '요청 형식이 맞지 않아요' })
  send(IPC.settingsHotkeyRecord, SETTINGS, true)
  send(IPC.settingsHotkeyRecord, SETTINGS, false)
  send(IPC.settingsHotkeyRecord, SETTINGS, 'yes')
  expect(d.hotkeys.startRecording).toHaveBeenCalledTimes(1)
  expect(d.hotkeys.stopRecording).toHaveBeenCalledTimes(1)
})

it('파일 열기는 settings·logs만, 온보딩 열기·끝내기·후보', async () => {
  send(IPC.settingsOpenFile, SETTINGS, 'settings')
  send(IPC.settingsOpenFile, SETTINGS, 'C:\\Windows\\notepad.exe')
  expect(d.openFile).toHaveBeenCalledTimes(1)
  expect(d.openFile).toHaveBeenCalledWith('settings')
  send(IPC.settingsOpenOnboarding, SETTINGS)
  expect(d.openOnboarding).toHaveBeenCalled()
  await handle(IPC.onboardingFinish, SETTINGS)
  expect(d.finishOnboarding).toHaveBeenCalled()
  expect(await handle(IPC.onboardingCandidates, SETTINGS)).toEqual([])
})

it('가명 사전 채널도 설정 창만(다른 창이면 저장·가져오기·내보내기를 부르지 않음)', async () => {
  expect(await handle(IPC.settingsDictionarySave, PALETTE, [])).toEqual({ ok: false, errors: ['설정 창에서만 할 수 있어요'] })
  await handle(IPC.settingsDictionaryImport, PALETTE)
  await handle(IPC.settingsDictionaryExport, PALETTE)
  expect(d.dictionary.save).not.toHaveBeenCalled()
  expect(d.dictionary.importFile).not.toHaveBeenCalled()
  expect(d.dictionary.exportFile).not.toHaveBeenCalled()
  await handle(IPC.settingsDictionarySave, SETTINGS, [{ id: 'a' }])
  expect(d.dictionary.save).toHaveBeenCalledWith([{ id: 'a' }])
})

it('템플릿 저장·지우기도 설정 창만, 지울 id는 64자 안의 글자', async () => {
  expect(await handle(IPC.settingsTemplateSave, PALETTE, { name: 'x' })).toEqual({ ok: false, errors: ['설정 창에서만 할 수 있어요'] })
  expect(d.templates.save).not.toHaveBeenCalled()
  expect(await handle(IPC.settingsTemplateDelete, SETTINGS, 5)).toEqual({ ok: false, reason: '요청 형식이 맞지 않아요' })
  await handle(IPC.settingsTemplateDelete, SETTINGS, 'my-1')
  expect(d.templates.remove).toHaveBeenCalledWith('my-1')
})

it('기준 예시: 설정 창만, 종류는 40자 안의 글자·글은 문자열이어야 넘긴다', async () => {
  expect(await handle(IPC.settingsReferenceGet, PALETTE, '회의록')).toBeNull()
  expect(await handle(IPC.settingsReferenceSave, SETTINGS, '회의록', 3)).toEqual({ ok: false, reason: '요청 형식이 맞지 않아요' })
  expect(await handle(IPC.settingsReferenceSave, SETTINGS, 'x'.repeat(41), '글')).toEqual({ ok: false, reason: '요청 형식이 맞지 않아요' })
  expect(d.references.save).not.toHaveBeenCalled()
  await handle(IPC.settingsReferenceSave, SETTINGS, '회의록', '글')
  expect(d.references.save).toHaveBeenCalledWith('회의록', '글')
})

it('용어: 설정 창만, 저장 옵션은 id(64자)·allowDuplicate(true일 때만)만 넘기고, 팩은 import·export만', async () => {
  expect(await handle(IPC.settingsGlossarySave, PALETTE, {}, {})).toEqual({ ok: false, errors: ['설정 창에서만 할 수 있어요'] })
  await handle(IPC.settingsGlossarySave, SETTINGS, { term: 'x' }, { id: 'mcdc', allowDuplicate: 'yes', extra: 1 })
  expect(d.glossary.save).toHaveBeenCalledWith({ term: 'x' }, { id: 'mcdc', allowDuplicate: false })
  await handle(IPC.settingsGlossaryPack, SETTINGS, 'delete-all')
  expect(d.glossary.pack).not.toHaveBeenCalled()
  await handle(IPC.settingsGlossaryPack, SETTINGS, 'export')
  expect(d.glossary.pack).toHaveBeenCalledWith('export')
})
