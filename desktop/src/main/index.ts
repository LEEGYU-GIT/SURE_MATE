import { randomUUID } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { optimizer } from '@electron-toolkit/utils'
import { app, dialog, shell as electronShell, globalShortcut, screen, type Tray } from 'electron'
import builtinGlossary from '../../resources/glossary.json'
import builtinIntents from '../../resources/intents.json'
import builtinPrompts from '../../resources/prompts.json'
import { allAiTargets, pickAiTarget } from '../shared/ai-targets'
import { withPosition, type BarShape } from '../shared/bar/bar-settings'
import type { WikiCardView } from '../shared/flyout/flyout-content'
import { IPC, type OnboardingProgress, type ShownPayload } from '../shared/ipc-channels'
import type { GlossaryEntry } from '../shared/glossary/types'
import { parseGlossaryPack } from '../shared/glossary/pack'
import { parseTemplatePack } from '../shared/template/pack'
import type { Template } from '../shared/template/types'
import type { MaskingMode, PaletteItem } from '../shared/types'
import { defaultHideHotkey, HIDE_DEFAULT_HOTKEY, HIDE_WORKSPACE_ID } from '../shared/workspace/builtin'
import { monitorFingerprint } from '../shared/workspace/monitors'
import { appEvents } from './app-events'
import { createBarCommands } from './bar/bar-commands'
import { createPetCommands, createPetControlHotkey } from './pet/pet-commands'
import { createBarRuntime, type BarRuntime } from './bar/bar-runtime'
import { DEV_COMMAND_ITEMS, isDevCommand, runDevCommand } from './dev/dev-commands'
import { errorCode, errorText } from './error-text'
import { fileErrorNotice, type FileErrorReport } from './file-error-notice'
import { createGlossaryRuntime, type GlossaryRuntime } from './glossary/glossary-runtime'
import { createGlossaryCache, saveUserEntries } from './glossary/glossary-store'
import { createPackCommands, PACK_MAX_BYTES } from './glossary/pack-commands'
import { createWikiCard, type WikiCard } from './glossary/wiki-card'
import { createHotkeyChanger, resumeFailedNotice, type HotkeyChanger } from './hotkeys/hotkey-change'
import { type HotkeyId, HotkeyManager, workspaceHotkeyId } from './hotkeys/hotkey-manager'
import { hotkeyStatuses, resumeChangedStatus, withHotkeySetting } from './hotkeys/hotkey-settings'
import { registerIpc } from './ipc'
import { log } from './log'
import type { MaskingCommands } from './masking/masking-commands'
import { createMaskingCommandsRuntime } from './masking/masking-commands-runtime'
import { createMaskingService, type MaskingService } from './masking/masking-service'
import { exportMaskDictionaryText, importMaskDictionary, loadMaskDictionary, saveMaskDictionary } from './masking/dictionary-store'
import { createTermsCache } from './masking/terms-cache'
import { getMonitors } from './native/coords'
import { isAcceleratorHeld, waitPickKeysReleased } from './native/input'
import { captureSelection, readClipboardText, writeClipboardText } from './native/selection'
import { nativeStatus } from './native/win32'
import { getForegroundWindow } from './native/windows'
import { buildPaletteItems } from './prompts/palette-items'
import { createIntentCache, ensureUserIntents } from './natural/intent-store'
import { createNaturalCommands, openIntentsFile, type IntentFileDeps } from './natural/natural-commands'
import { createNaturalService } from './natural/natural-service'
import { createPhraseStore } from './natural/phrase-store'
import { createUsageStore } from './natural/usage-store'
import { notify } from './notify'
import { electronPetEnv } from './pet/pet-env'
import { handOffForCapture } from './pet/pet-focus'
import { createPetRuntime, type PetRuntime } from './pet/pet-runtime'
import { createPromptRuntime, PICK_KEYS_WAIT_MS } from './prompts/prompt-runtime'
import type { PromptSession } from './prompts/prompt-session'
import { deletePersonalTemplate, exportMyTemplatesText, importTemplatePack, readMyTemplates, savePersonalTemplate } from './prompts/personal-templates'
import { deleteReference, listReferenceKinds, readReference, saveReference } from './prompts/references'
import { createTemplateCache } from './prompts/template-cache'
import { createSnippetRuntime } from './snippets/snippet-runtime'
import { DEFAULT_SETTINGS, loadSettings, PALETTE_HOTKEY_FALLBACKS, SETTINGS_FILE, settingsLoadNotice, type Settings, type SettingsLoadError } from './settings/settings-store'
import { registerSettingsIpc } from './settings/settings-ipc'
import { shouldShowOnboarding } from './settings/first-run'
import { createSettingsCommands } from './settings/settings-commands'
import { createSettingsService } from './settings/settings-service'
import { createSettingsWriter } from './settings/settings-writer'
import { realTimers } from './timers'
import { createTray } from './tray'
import { lockNavigation } from './windows/navigation-guard'
import { imeLoggerContentsId, openImeLoggerWindow } from './windows/ime-logger-window'
import { createPaletteWindow, hidePalette, hidePaletteAndRefocus, isPaletteVisible, paletteContentsId, showPalette } from './windows/palette-window'
import { closeSettingsWindow, openSettingsWindow, sendToSettings, settingsContentsId, settingsRoute, settingsWindow, type SettingsRoute, type SettingsTabId } from './windows/settings-window'
import { createWorkspaceHotkeys } from './workspace/workspace-hotkeys'
import { createWorkspaceCommands, workspaceMenuContent, workspacePaletteItems } from './workspace/workspace-items'
import { createWorkspaceRuntime } from './workspace/workspace-runtime'

app.setName('Sure-Mate')

// 처리하지 못한 오류를 기록한다. 동기 예외는 Electron 기본 동작(오류 창)을 그대로 두고 기록만 덧붙인다.
process.on('unhandledRejection', (reason) => log('error.unhandledRejection', { error: errorText(reason) }))
process.on('uncaughtExceptionMonitor', (e) => log('error.uncaughtException', { error: errorText(e) }))

let userData = ''
let settings: Settings = DEFAULT_SETTINGS
let templates: Template[] = []
let prompts: PromptSession | null = null
let snippets: { run(templateId: string): Promise<unknown> } | null = null
let masking: MaskingService | null = null
let maskingCommands: MaskingCommands | null = null
const barCommands = createBarCommands({
  getShape: () => settings.bar.shape,
  setShape: setBarShape,
  waitKeysReleased: () => waitPickKeysReleased(PICK_KEYS_WAIT_MS),
  hidePalette: (restoreFocus) => hidePalette({ restoreFocus }),
  notify,
  log
})
const petCommands = createPetCommands({
  isVisible: () => settings.pet.visible,
  setVisible: setPetVisible,
  toggleControl: () => petRuntime?.controller.toggleControl(),
  putToSleep: () => petRuntime?.controller.putToSleep() ?? false,
  wakeUp: () => petRuntime?.controller.wakeUp() ?? false,
  waitKeysReleased: () => waitPickKeysReleased(PICK_KEYS_WAIT_MS),
  hidePalette: (restoreFocus) => hidePalette({ restoreFocus }),
  hidePaletteAndRefocus,
  notify,
  log
})
const settingsCommands = createSettingsCommands({
  waitKeysReleased: () => waitPickKeysReleased(PICK_KEYS_WAIT_MS),
  hidePalette: (restoreFocus) => hidePalette({ restoreFocus }),
  openSettings: () => openSettings('/settings'),
  openTry: () => openSettings('/try'),
  log
})
let packCommands: { run(id: string): Promise<boolean> } | null = null
/** 워크스페이스 팔레트 명령(지금 배치 저장·불러오기, 설계 §11). 앱이 준비되면 만든다 */
let workspaceCommands: ReturnType<typeof createWorkspaceCommands> | null = null
let naturalCommands: ReturnType<typeof createNaturalCommands> | null = null
/** 워크스페이스 서비스(바 메뉴가 쓴다). 앱이 준비되면 만든다 */
let workspaceSvc: ReturnType<typeof createWorkspaceRuntime> | null = null
/** 지금 용어 목록. 팔레트를 열 때(목록 요청)마다 새로 읽은 것으로 바꾼다({{terms}}는 이것을 쓴다) */
let glossaryEntries: GlossaryEntry[] = []
let shell: { tray: Tray; refresh: () => void } | null = null
let hotkeys: HotkeyManager | null = null
/** Sure-Mate 바와 펼침 창. 시작하지 못했거나 앱을 끝낸 뒤에는 null(팔레트·트레이는 그대로 동작) */
let barRuntime: BarRuntime | null = null
/** 말랑 메이트(바 다음에 만든다). 시작하지 못했거나 앱을 끝낸 뒤에는 null(바·팔레트·트레이는 그대로 동작) */
let petRuntime: PetRuntime | null = null
/** 팔레트 위키와 위키 카드의 설명 복사(앱이 준비되면 만든다) */
let glossaryRuntime: GlossaryRuntime | null = null
/** 선택 텍스트 위키 카드(조회 단축키, 카드의 [클립보드 글로 찾기]) */
let wikiCard: WikiCard | null = null
/** 트레이가 생기기 전에 생긴 파일 읽기 오류(트레이가 생기면 알린다) */
let pendingFileErrors: FileErrorReport[] = []
/** 시작할 때 settings.json을 읽지 못해 기본 설정으로 시작했다는 알림(트레이가 생기면 한 번 알린다) */
let pendingSettingsNotice: string | null = null

/**
 * 팔레트를 연다(단축키·바 로고·바 용어·펼침 창·펫 더블클릭·트레이·두 번째 실행). 말랑 메이트 조종 중이면 먼저 원래 창으로
 * 포커스를 돌리며 조종을 끝내고, 그 창을 팔레트가 돌아갈 창으로 준다(펫 창이 아직 앞에 있어도, M6 최종 검토 I1)
 */
function openPalette(payload: ShownPayload = { mode: 'search' }): void {
  showPalette(payload, { returnTo: petRuntime?.controller.handOff() ?? null })
}

function togglePalette(): void {
  if (isPaletteVisible()) hidePalette({ restoreFocus: true })
  else openPalette({ mode: 'search' })
}

/**
 * 사용자 창의 선택 글을 읽기 전에(바 고정 프롬프트·조회 단축키): 조종 중이면 원래 창으로 포커스를 돌리며 끝내고
 * 그 창이 앞에 올 때까지 최대 80ms 기다린다(조종 중에는 펫 창이 앞에 있어 펫 창에서 가져오게 된다, I1).
 * 사용자 창을 읽거나 옮기는 워크스페이스 단축키·바 워크스페이스 메뉴도 먼저 부른다(불러오기가 시작 때 앞 창을 기억해 끝에 돌려준다)
 */
function beforeCapture(): Promise<void> {
  return handOffForCapture({
    handOff: () => petRuntime?.controller.handOff() ?? null,
    foreground: () => {
      try {
        return getForegroundWindow()
      } catch {
        return null
      }
    },
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  })
}

/** 바뀐 설정을 적용한다: 트레이 툴팁·메뉴와 바를 다시 그리고 말랑 메이트가 다시 판단한다(보이기·크기·가명 처리 선글라스 등) */
function applySettings(next: Settings): void {
  settings = next
  shell?.refresh()
  barRuntime?.refresh()
  petRuntime?.refresh()
  settingsService.changed()
}

/**
 * 시작할 때 설정 파일 문제. 깨진 JSON의 오류 글에는 파일 내용 일부가 들어가므로 오류 코드와 남긴 파일 이름만 기록한다.
 * 기본 설정으로 시작했으면(읽지 못함·깨짐) 트레이가 생긴 뒤 한 번 알린다
 */
const onSettingsLoadError: SettingsLoadError = (what, e, kept) => {
  log('settings.loadError', { what, error: errorCode(e), ...(kept ? { kept: kept.name, moved: kept.moved } : {}) })
  if (what !== 'keep-corrupt') pendingSettingsNotice = settingsLoadNotice(what, kept ?? null)
}

/**
 * 실행 중 설정 저장(한 번에 하나씩). 파일을 다시 읽어 바꿀 값만 고치고(손으로 고친 값을 덮어쓰지 않게),
 * 파일을 읽지 못했거나 깨졌으면 덮지 않고 메모리의 설정에만 적용한다
 */
const settingsWriter = createSettingsWriter({ dir: () => userData, current: () => settings, apply: applySettings, notify, log })

const changeSettings = (update: (current: Settings) => Settings): Promise<void> => settingsWriter.change(update)

/** 팔레트에서 마지막으로 고른 프롬프트(첫 실행 안내의 따라 해 보기를 알아본다) */
let lastPreparedTemplate: string | null = null
/** 첫 실행 안내에서 따라 해 보는 프롬프트 */
const ONBOARDING_TEMPLATE = 'meeting-notes'

/** 단축키 바꾸기(설정 창·온보딩). 트레이·단축키를 만드는 startShell에서 만든다 */
let hotkeyChanger: HotkeyChanger | null = null
const NOT_READY = '단축키를 아직 준비하지 못했어요'
/** 설정 IPC는 startShell보다 먼저 열리므로, 단축키 바꾸기가 생기기 전에는 거절한다 */
const changerProxy: HotkeyChanger = {
  check: (id, acc) => hotkeyChanger?.check(id, acc) ?? { level: 'block', reason: NOT_READY },
  startRecording: () => hotkeyChanger?.startRecording(),
  stopRecording: () => hotkeyChanger?.stopRecording(),
  recording: () => hotkeyChanger?.recording() ?? false,
  set: async (id, acc) => (hotkeyChanger ? hotkeyChanger.set(id, acc) : { ok: false, reason: NOT_READY }),
  candidates: () => hotkeyChanger?.candidates() ?? [],
  dispose: () => hotkeyChanger?.dispose()
}

/** 설정 창의 읽기·저장(설계 문서 §14). 저장은 보낸 필드만 그때의 설정에 덮는다 */
const settingsService = createSettingsService({
  current: () => settings,
  change: changeSettings,
  // 실제로 등록된 조합(못 잡았으면 설정 값과 등록 못 함, 되살리지 못했으면 그 조합으로 등록 못 함). 조종 단축키를 비웠으면 acc null
  hotkeys: () => hotkeyStatuses(settings, (id) => hotkeys?.current(id), (id) => hotkeys?.isRegistered(id) ?? false),
  displays: () => {
    const primary = screen.getPrimaryDisplay().id
    return screen.getAllDisplays().map((d) => ({ id: String(d.id), label: `${d.label || '모니터'} · ${d.size.width}×${d.size.height}`, primary: d.id === primary }))
  },
  prompts: () => templates.filter((t) => t.kind === 'prompt').map((t) => ({ id: t.id, name: t.name })),
  packaged: () => app.isPackaged,
  setLoginItem: (open) => app.setLoginItemSettings({ openAtLogin: open, args: ['--hidden'] }),
  log
})
settingsService.onChanged((s) => sendToSettings(IPC.settingsChanged, s))

/** 열린 설정 창의 워크스페이스 탭이 새 목록(단축키 등록 상태 포함)을 그리게 한다. 서비스가 없거나 창이 닫혀 있으면 아무것도 하지 않는다 */
function pushWorkspaceView(svc: ReturnType<typeof createWorkspaceRuntime> | null = workspaceSvc): void {
  if (!svc || settingsContentsId() === null) return
  void svc
    .listView()
    .then((v) => sendToSettings(IPC.workspaceChanged, v))
    .catch((e) => log('workspace.pushError', { error: errorText(e) }))
}

/** 지난번에 되살릴 때 등록하지 못한 단축키(설정 창에 '등록 못 함'으로 보이는 것) */
let lastResumeFailed: readonly HotkeyId[] = []

/**
 * 단축키를 되살린 뒤(녹화가 끝남·트레이 일시 중지 끄기): 되살리지 못한 단축키가 지난번과 다르면 설정 창의 '쓰는 중'·'등록 못 함'을
 * 다시 그리게 한다(A-M6). 같으면 보내지 않는다(같은 스냅숏을 다시 받으면 끌던 슬라이더 값이 잠시 되돌아간다).
 * 되살리지 못한 단축키는 조합을 기억하지만 등록되지 않았다(HotkeyManager.isRegistered)
 */
function hotkeysResumed(failed: readonly HotkeyId[]): void {
  const changed = resumeChangedStatus(lastResumeFailed, failed)
  lastResumeFailed = [...failed]
  if (!changed) return
  settingsService.changed()
  pushWorkspaceView()
}

/** 설정 창을 부모로 둔 대화상자(창이 닫혀 있으면 부모 없이) */
async function openDialog(o: Electron.OpenDialogOptions): Promise<string | null> {
  const parent = settingsWindow()
  const r = parent ? await dialog.showOpenDialog(parent, o) : await dialog.showOpenDialog(o)
  return r.canceled ? null : (r.filePaths[0] ?? null)
}

async function saveDialog(o: Electron.SaveDialogOptions): Promise<string | null> {
  const parent = settingsWindow()
  const r = parent ? await dialog.showSaveDialog(parent, o) : await dialog.showSaveDialog(o)
  return r.canceled || !r.filePath ? null : r.filePath
}

/** 받은 가명 사전 파일을 지금 사전에 더한다(같은 분류·이름은 건너뜀). 기록에는 개수만 */
async function importDictionaryFile(): Promise<unknown> {
  const path = await openDialog({ title: '가명 사전 가져오기', properties: ['openFile'], filters: [{ name: 'Sure-Mate 가명 사전', extensions: ['json'] }] })
  if (!path) return { canceled: true }
  let text: string
  try {
    if ((await stat(path)).size > PACK_MAX_BYTES) return { ok: false, errors: ['5MB가 넘는 파일은 가져오지 않아요'] }
    text = await readFile(path, 'utf8')
  } catch (e) {
    return { ok: false, errors: [`파일을 읽지 못했어요(${errorCode(e)})`] }
  }
  const r = await importMaskDictionary(userData, text)
  log('masking.dictionary.import', r.ok ? { added: r.added, skipped: r.skipped } : { errors: r.errors.length })
  return r
}

/** 가명 사전 내보내기: 고객사 이름이 들어 있으니 사내에서만 공유하라고 먼저 묻는다(설계 문서 §8) */
async function exportDictionaryFile(): Promise<unknown> {
  const parent = settingsWindow()
  const ask: Electron.MessageBoxOptions = {
    type: 'warning',
    title: 'Sure-Mate',
    message: '가명 사전을 파일로 내보낼까요?',
    detail: '고객사·프로젝트·담당자 이름이 그대로 들어 있어요. 사내에서만 공유해 주세요.',
    buttons: ['내보내기', '취소'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  }
  const answer = parent ? await dialog.showMessageBox(parent, ask) : await dialog.showMessageBox(ask)
  if (answer.response !== 0) return { canceled: true }
  const path = await saveDialog({ title: '가명 사전 내보내기', defaultPath: join(app.getPath('documents'), 'sure-mate-masking.json'), filters: [{ name: 'Sure-Mate 가명 사전', extensions: ['json'] }] })
  if (!path) return { canceled: true }
  try {
    await writeFile(path, await exportMaskDictionaryText(userData), 'utf8')
  } catch (e) {
    return { ok: false, errors: [`파일에 쓰지 못했어요(${errorCode(e)})`] }
  }
  log('masking.dictionary.export', {})
  return { ok: true }
}

/**
 * 설정 창을 연다(설계 문서 §5). 닫히면 단축키 녹화를 멈춘다(Review Focus 1).
 * tab을 주면 그 탭으로 연다(펫 메뉴 "펫 설정" → 'pet'). 열려 있던 설정 창은 다시 읽지 않고 탭만 바꾼다.
 * ws는 워크스페이스 탭에서 열 워크스페이스(팔레트 행의 Ctrl+Enter, 지금 배치 저장 뒤 이름 바꾸기)
 */
function openSettings(route: SettingsRoute = '/settings', o: { tab?: SettingsTabId; ws?: string } = {}): void {
  openSettingsWindow(route, { closed: () => hotkeyChanger?.stopRecording(), tab: o.tab, ws: o.ws })
}

/** 가명 처리 기본값(팔레트 명령·바 메뉴). 파일을 다시 읽어 모드만 바꾼다 */
const setMaskingMode = (mode: MaskingMode): Promise<void> => changeSettings((cur) => ({ ...cur, masking: { ...cur.masking, mode } }))

/** 바 모양(바 메뉴). 잠시 숨김 해제는 부르는 쪽이 한다 */
const saveBarShape = (shape: BarShape): Promise<void> => changeSettings((cur) => ({ ...cur, bar: { ...cur.bar, shape } }))

/** 팔레트 명령·트레이: 모양을 저장하고 잠시 숨김을 푼다(바 메뉴 set-bar-shape와 같은 순서) */
async function setBarShape(shape: BarShape): Promise<void> {
  await saveBarShape(shape)
  barRuntime?.bar.unsnooze()
  // 이미 숨겨져 있던 바는 unsnooze가 보임 변화를 알리지 않으므로 트레이 메뉴("바 다시 보이기")를 직접 고친다
  shell?.refresh()
}

/**
 * 말랑 메이트 보이기·숨기기(바 펫 단추): 차례가 왔을 때 보이는 상태를 뒤집는다(빠르게 두 번 누르면 두 번 바뀐다).
 * setPetVisible과 같은 저장 줄(설정 쓰기)을 지나고, 저장 뒤 applySettings가 펫을 다시 판단한다
 */
async function togglePet(): Promise<void> {
  await settingsWriter.togglePet()
}

/**
 * 말랑 메이트 보이기 값을 저장한다(펫 메뉴 "숨기기", 팔레트·트레이). 설정 창·바 펫 단추와 같은 저장 줄(changeSettings → 설정 쓰기)만
 * 지나고(두 번째 저장 경로를 만들지 않는다), 저장 뒤 applySettings → petRuntime.refresh()가 펫을 숨기거나 띄운다
 */
async function setPetVisible(visible: boolean): Promise<void> {
  await changeSettings((cur) => ({ ...cur, pet: { ...cur.pet, visible } }))
  log('pet.visible', { visible })
}

/**
 * 설정 창 일반 탭의 "설정 파일 열기": settings.json을 기본 프로그램으로 연다(바·트레이·팔레트는 설정 창을 연다).
 * 파일이 없으면 지금 설정으로 만들고, .json을 열 프로그램이 없으면 폴더를 연다(가명 사전 열기와 같은 처리).
 */
async function openSettingsFile(): Promise<void> {
  const path = join(userData, SETTINGS_FILE)
  // 없을 때(ENOENT)만 만든다. 다른 설정 저장과 같은 임시 파일을 쓰므로 같은 줄에서
  const created = await settingsWriter.ensureFile()
  const error = await electronShell.openPath(path)
  if (error) {
    electronShell.showItemInFolder(path)
    notify('설정 파일(.json)을 열 프로그램이 없어 폴더를 열었어요. 메모장으로 열어 고쳐 주세요.')
  }
  log('settings.open', { opened: !error, created })
}

/** Sure-Mate 바와 펼침 창(설계 §14-1). 여기서 실패해도 팔레트·트레이는 이미 살아 있다 */
function startBar(): void {
  barRuntime = createBarRuntime({
    inputs: () => ({ bar: settings.bar, maskingMode: settings.masking.mode, petVisible: settings.pet.visible, paletteHotkey: paletteHotkey(), templates }),
    savePosition: (display, ratio) => changeSettings((cur) => ({ ...cur, bar: withPosition(cur.bar, display, ratio) })),
    // 트레이 메뉴가 바의 잠시 숨김 상태를 보여 준다
    onVisibleChange: () => shell?.refresh(),
    togglePalette,
    showPalette: openPalette,
    // 조종 중이면 원래 창으로 돌려 둔 뒤 그 창의 선택 글로 실행한다(I1)
    runPrompt: async (templateId) => {
      await beforeCapture()
      return prompts ? prompts.runFromBar(templateId) : 'missing'
    },
    togglePet,
    openSettings: async () => openSettings('/settings'),
    setMaskingMode,
    saveBarShape,
    copyWiki: (id) => (glossaryRuntime ? glossaryRuntime.copyForCard(id) : Promise.resolve(false)),
    lookupClipboard: () => (wikiCard ? wikiCard.lookupClipboard() : Promise.resolve()),
    workspaceMenu: async (maxHeight) =>
      workspaceMenuContent(workspaceSvc ? await workspaceSvc.list() : [], monitorFingerprint(getMonitors()), nativeStatus().ok, maxHeight, workspaceSvc?.hideRestorable() ?? 0),
    // 메뉴는 이미 닫혔고 포커스는 원래 창에 있다. 알림(이름 포함)·바쁨·Win32 불가는 서비스가 처리한다
    onWorkspaceAction: async (a) => {
      if (a.type === 'workspace-edit') {
        // '모두 보기·편집': 설정 창의 워크스페이스 탭(목록)으로 연다
        openSettings('/settings', { tab: 'workspace' })
        return true
      }
      if (!workspaceSvc) return false
      // 바는 포커스를 받지 않아 조종 중에도 눌린다: 조종 중이면 원래 창으로 돌려 둔 뒤 저장·불러오기한다(I1)
      await beforeCapture()
      if (a.type === 'workspace-run') await workspaceSvc.run(a.id, 'bar')
      else await workspaceSvc.saveNew({ source: 'bar' })
      return true
    },
    notify,
    log,
    // 말랑 메이트(바 다음에 만들어지므로 그 전에는 아무것도 하지 않는다)
    onFullscreen: (on) => petRuntime?.setFullscreen(on),
    afterRaise: () => petRuntime?.raise(),
    onBarChange: () => petRuntime?.worldChanged()
  })
}

/**
 * 말랑 메이트(설계 §14-2). 바 다음에 띄운다: 바 런타임의 전체 화면 상태를 읽고 바 변화·맨 앞 순서에 이어진다.
 * 바를 시작하지 못했으면 바 없는 세계에서 바닥만 다니고 전체 화면 앱에서 숨지 못한다. 여기서 실패해도 바·팔레트는 동작한다
 */
function startPet(): void {
  const bar = barRuntime
  petRuntime = createPetRuntime(
    {
      bar: bar ? { bar: bar.bar, fullscreen: () => bar.fullscreen() } : null,
      getSettings: () => settings,
      // 더블클릭(조종 중이면 openPalette가 조종을 끝내고 원래 창을 팔레트에 준다)
      openPalette: () => openPalette({ mode: 'search' }),
      // 메뉴 "펫 설정": 말랑 메이트 탭으로 연다
      openSettings: async () => openSettings('/settings', { tab: 'pet' }),
      setPetVisible,
      notify,
      log
    },
    electronPetEnv()
  )
}

/**
 * 위키 카드를 바 옆 펼침 창에 띄운다(바를 꺼 두었으면 커서가 있는 모니터의 바 쪽 가장자리 위쪽, 설계 §9).
 * 바와 펼침 창을 시작하지 못했으면 팔레트를 위키 범위(?)로 연다.
 */
function showWikiCard(view: WikiCardView): void {
  if (barRuntime) barRuntime.flyout.showCard(view, { width: settings.bar.wikiCardWidth, autoHideMs: settings.bar.wikiCardMs })
  else openPalette({ mode: 'search', query: '?' })
}

/**
 * 조회 단축키: 선택한 글로 위키 카드를 띄운다. 가져오기 수치·카드 종류는 로그 wiki.card 한 줄.
 * 조종 중이면 원래 창으로 돌려 둔 뒤 그 창에서 가져온다(I1)
 */
function lookupSelection(): void {
  const card = wikiCard
  if (!card) return
  beforeCapture()
    .then(() => card.lookupSelection())
    .catch((e) => log('wiki.card.error', { error: errorText(e) }))
}

async function runItem(id: string): Promise<void> {
  log('palette.run', { id })
  if (id === 'dev.imeLogger') {
    hidePalette({ restoreFocus: false })
    openImeLoggerWindow()
    return
  }
  if (isDevCommand(id)) return runDevCommand(id)
  if (maskingCommands && (await maskingCommands.run(id))) return
  if (packCommands && (await packCommands.run(id))) return
  if (await barCommands.run(id)) return
  if (await petCommands.run(id)) return
  if (await settingsCommands.run(id)) return
  // 지금 배치 저장(cmd.workspace-save)·워크스페이스 불러오기(workspace:<id>)
  if (workspaceCommands && (await workspaceCommands.run(id))) return
  if (naturalCommands && (await naturalCommands.run(id))) return
  if (id.startsWith('prompt:') && prompts) {
    lastPreparedTemplate = id.slice('prompt:'.length)
    return prompts.prepare(lastPreparedTemplate)
  }
  if (id.startsWith('snippet:') && snippets) {
    await snippets.run(id.slice('snippet:'.length))
    return
  }
  hidePalette({ restoreFocus: true })
}

/** 개발용: 한글 입력 기록을 logs/ime-<이름>-<시각>.json으로 저장 */
async function saveImeLog(label: string, json: string): Promise<string> {
  const safe = label.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'ime'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = join(app.getPath('userData'), 'logs', `ime-${safe}-${stamp}.json`)
  await writeFile(path, json, 'utf8')
  log('dev.imeLog.saved', { path, bytes: json.length })
  return path
}

function warn(content: string): void {
  shell?.tray.displayBalloon({ iconType: 'warning', title: 'Sure-Mate', content })
}

/** 트레이가 있으면 쌓아 둔 설정·파일 읽기 오류를 알린다 */
function flushFileErrors(): void {
  if (!shell) return
  if (pendingSettingsNotice) warn(pendingSettingsNotice)
  pendingSettingsNotice = null
  for (const p of pendingFileErrors) warn(fileErrorNotice(p))
  pendingFileErrors = []
}

/**
 * 읽지 못한 템플릿·가명 사전·용어 파일을 사용자에게 알린다. 파일 이름·항목에 고객사명이 있을 수 있어 로그에는 건수만 남긴다.
 * trimmed: errors 가운데 일부 값만 빼고 읽은 항목 수(용어만 있다)
 */
function reportFileErrors(what: string, event: string, errors: string[], trimmed = 0): void {
  log(event, { count: errors.length, ...(trimmed ? { trimmed } : {}) })
  pendingFileErrors.push({ what, errors, trimmed })
  flushFileErrors()
}

/** 실제로 등록된 팔레트 단축키. 하나도 못 잡았으면 null */
function paletteHotkey(): string | null {
  return hotkeys?.current('palette') ?? null
}

/** 트레이·전역 단축키·시작 프로그램 등록. 여기서 실패해도 팔레트 창과 IPC는 이미 살아 있다. */
async function startShell(): Promise<void> {
  const manager = new HotkeyManager(
    {
      register: (acc, cb) => {
        try {
          return globalShortcut.register(acc, cb)
        } catch {
          return false
        }
      },
      unregister: (acc) => globalShortcut.unregister(acc)
    },
    Date.now,
    // 누르고 있는 동안의 자동 반복(첫 반복은 약 0.5초 뒤)으로 팔레트가 열렸다 닫히지 않게
    isAcceleratorHeld
  )
  hotkeys = manager
  // 트레이 "단축키 일시 중지". 키 녹화와 따로 기록한다: 녹화가 끝나도 일시 중지 중이면 되살리지 않고,
  // 녹화 중에 일시 중지를 끄면 녹화가 끝날 때 되살린다
  let suspended = false
  // 워크스페이스 단축키(설계 §11): 누르면 그 배치를 불러온다. 설정 창에서 바꾸면 workspaces.json에 저장한다
  const workspaces = workspaceSvc
  // 조종 중에 누르면 먼저 조종을 끝내고 원래 창으로 돌려 둔 뒤 불러온다(I1)
  const workspaceHotkeys = workspaces ? createWorkspaceHotkeys({ manager, service: workspaces, beforeRun: beforeCapture, log }) : null
  hotkeyChanger = createHotkeyChanger({
    manager,
    // 등록해 보고 바로 풀어 다른 앱이 쓰는지 본다
    probe: (acc) => {
      try {
        if (!globalShortcut.register(acc, () => {})) return false
        globalShortcut.unregister(acc)
        return true
      } catch {
        return false
      }
    },
    // 설정 쓰기 한 줄(changeSettings)로 저장한다. 조종 단축키는 pet.controlHotkey(null이면 단축키 없음)
    save: (id, acc) => changeSettings((cur) => withHotkeySetting(cur, id, acc)),
    timers: realTimers,
    log,
    userSuspended: () => suspended,
    warn,
    resumed: hotkeysResumed,
    // 30초가 지나 녹화를 끝냈으면 설정 창의 녹화 칸을 닫는다(되살린 단축키를 누르면 실행되므로)
    recordingEnded: () => sendToSettings(IPC.settingsHotkeyRecordEnded),
    workspaces: workspaceHotkeys ?? undefined
  })

  shell = createTray({
    paletteHotkey,
    maskingMode: () => settings.masking.mode,
    onOpenPalette: () => openPalette({ mode: 'search' }),
    onOpenSettings: () => openSettings('/settings'),
    onOpenTry: () => openSettings('/try'),
    barShape: () => settings.bar.shape,
    onBarShape: (shape) =>
      void setBarShape(shape).catch((e) => {
        log('bar.trayShapeError', { error: errorText(e) })
        notify('처리하지 못했어요. 다시 해 보고, 계속 안 되면 앱을 다시 켜 주세요.')
        // 눌러서 먼저 바뀐 라디오를 저장된 모양으로 되돌린다
        shell?.refresh()
      }),
    barSnoozed: () => barRuntime?.bar.snoozed() ?? false,
    onUnsnooze: () => barRuntime?.bar.unsnooze(),
    petVisible: () => settings.pet.visible,
    onPetVisible: (visible) =>
      void setPetVisible(visible).catch((e) => {
        log('pet.trayVisibleError', { error: errorText(e) })
        notify('처리하지 못했어요. 다시 해 보고, 계속 안 되면 앱을 다시 켜 주세요.')
        // 눌러서 먼저 바뀐 체크를 저장된 값으로 되돌린다
        shell?.refresh()
      }),
    onToggleSuspend: () => {
      suspended = !suspended
      if (suspended) manager.suspendAll()
      else if (!hotkeyChanger?.recording()) {
        const { failed } = manager.resumeAll()
        if (failed.length) warn(resumeFailedNotice(failed, workspaceHotkeys?.name))
        hotkeysResumed(failed)
      }
      return suspended
    },
    onQuit: () => app.quit()
  })

  const native = nativeStatus()
  if (!native.ok) {
    log('native.unavailable', { error: errorText(native.error) })
    warn('보안 프로그램이 Win32 기능을 막아 선택 글 가져오기와 창 옮기기를 쓸 수 없어요. 팔레트는 그대로 쓸 수 있어요.')
  }

  const wanted = settings.hotkeys.palette
  const bound = manager.bindFirst('palette', [...new Set([wanted, ...PALETTE_HOTKEY_FALLBACKS])], togglePalette)
  if (bound.ok && bound.acc !== wanted) {
    warn(`${wanted}는 다른 앱이 쓰고 있어 팔레트 단축키를 ${bound.acc}로 정했어요.`)
    const palette = bound.acc
    await changeSettings((cur) => ({ ...cur, hotkeys: { ...cur.hotkeys, palette } }))
  } else if (!bound.ok) {
    warn(`팔레트 단축키(${bound.tried.join(', ')})를 모두 다른 앱이 쓰고 있어요. 트레이 아이콘을 눌러 팔레트를 열 수 있어요.`)
  }

  // 조회 단축키(기본 Ctrl+Alt+W): 팔레트가 보이지 않을 때 선택한 글로 위키 카드를 띄운다(설계 §9)
  const lookup = manager.bind('lookup', settings.hotkeys.lookup, () => {
    if (!isPaletteVisible()) lookupSelection()
  })
  if (!lookup.ok) warn(`조회 단축키 ${settings.hotkeys.lookup}를 등록하지 못했어요.`)

  // 말랑 메이트 조종 단축키(기본 없음, §19): 처리기는 늘 두고 조합이 있을 때만 등록한다. 설정 창에서 정하거나 비우면
  // hotkeyChanger가 바로 등록·해제한다(다시 시작하지 않아도). manager라 녹화 중 일시 중지에도 걸린다.
  // 숨긴 펫이면 조종하지 않고 다시 부르는 곳을 알린다(누를 때마다 한 번)
  const petControl = settings.pet.controlHotkey
  const onPetControl = createPetControlHotkey({
    isVisible: () => settings.pet.visible,
    toggleControl: () => petRuntime?.controller.toggleControl(),
    notify,
    log
  })
  if (!manager.bind('pet-control', petControl, onPetControl).ok) {
    warn(`말랑 메이트 조종 단축키 ${petControl}를 등록하지 못했어요.`)
  }

  // 워크스페이스 단축키는 팔레트·조회·조종 단축키 다음에 등록한다(같은 조합이면 앞의 것이 남는다). 못 잡은 조합은 한 번에 알리고
  // 로그에는 id·까닭만 남긴다(workspace.hotkey). 저장·편집·삭제·단축키 저장으로 목록이 바뀔 때마다 다시 맞춘다
  if (workspaces && workspaceHotkeys) {
    const { failed } = workspaceHotkeys.sync(await workspaces.list())
    if (failed.length) warn(`워크스페이스 단축키를 등록하지 못했어요: ${failed.map((f) => f.hotkey).join(', ')}`)
    workspaces.onChange((list) => void workspaceHotkeys.sync(list))
    // 기본 워크스페이스 '화면 감추기'(2026-11-12): 없으면 만든다. 단축키는 만들 때만 Ctrl+Alt+H가 비어 있으면(단축키 바꾸기 검사 ok:
    // 막힌 조합·다른 단축키와 겹침·다른 앱이 씀이 아님) 정하고 아니면 없음. 위에서 등록한 워크스페이스 단축키와도 견주도록 맞춘 뒤에 묻는다
    await workspaces.ensureBuiltin({
      hotkey: () => defaultHideHotkey(hotkeyChanger?.check(workspaceHotkeyId(HIDE_WORKSPACE_ID), HIDE_DEFAULT_HOTKEY).level ?? null)
    })
  }

  flushFileErrors()

  // 툴팁을 실제로 등록된 단축키로 다시 그린다(대체 조합으로 바뀌었거나 하나도 못 잡은 경우)
  shell.refresh()
  log('tray.refresh', { paletteHotkey: paletteHotkey() })

  // 개발 모드에서 등록하면 node_modules의 electron.exe가 시작 프로그램에 들어가므로 설치본에서만
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, args: ['--hidden'] })
  log('app.ready', { version: app.getVersion(), paletteHotkey: bound.ok ? bound.acc : null, lookupHotkey: lookup.ok, native: native.ok })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => openPalette({ mode: 'search' }))

  app.whenReady().then(async () => {
    app.setAppUserModelId('kr.suremate.app')
    app.on('browser-window-created', (_, w) => {
      optimizer.watchWindowShortcuts(w)
      // 모든 창: 파일을 끌어다 놓거나 링크를 눌러도 다른 주소로 이동하지 않는다
      lockNavigation(w.webContents)
    })

    userData = app.getPath('userData')
    settings = await loadSettings(userData, onSettingsLoadError)
    // 팔레트를 열 때마다(목록 요청) 템플릿 파일이 바뀌었는지 보고 다시 읽는다
    const templateCache = createTemplateCache(userData, builtinPrompts, (errors) => reportFileErrors('프롬프트 템플릿', 'templates.loadErrors', errors))
    templates = await templateCache.get()
    // 용어도 팔레트를 열 때마다 사용자 파일이 바뀌었는지 보고 다시 읽는다
    const glossaryCache = createGlossaryCache(userData, builtinGlossary, (errors, trimmed) => reportFileErrors('용어', 'glossary.loadErrors', errors, trimmed))
    const wiki = createGlossaryRuntime({
      entries: async () => (await glossaryCache.get()).entries,
      writeClipboard: async (text) => {
        await writeClipboardText(text, { excludeFromHistory: false })
      },
      waitKeysReleased: () => waitPickKeysReleased(PICK_KEYS_WAIT_MS),
      hidePalette: (restoreFocus) => hidePalette({ restoreFocus }),
      notify,
      openExternal: (url) => electronShell.openExternal(url),
      userEntries: async () => (await glossaryCache.get()).userEntries,
      saveUserEntries: async (list) => {
        await saveUserEntries(userData, list)
        glossaryCache.invalidate()
      },
      newId: () => randomUUID(),
      now: () => new Date().toISOString(),
      log
    })
    glossaryRuntime = wiki
    // 선택 텍스트 위키 카드: 가져오기·클립보드 읽기는 selection.ts의 한 줄(clipboard-gate)을 거친다
    wikiCard = createWikiCard({
      capture: captureSelection,
      readClipboard: readClipboardText,
      entries: async () => (await glossaryCache.get()).entries,
      show: showWikiCard,
      log,
      // 말랑 메이트 반응(설계 §14-2 "앱과 연결")
      emit: appEvents.emit
    })
    // 용어 팩 내보내기·가져오기(설계 문서 §9). 대화상자는 팔레트를 숨긴 뒤 부모 창 없이 띄운다
    packCommands = createPackCommands({
      glossary: () => glossaryCache.get(),
      saveUserEntries: async (list) => {
        await saveUserEntries(userData, list)
        glossaryCache.invalidate()
      },
      waitKeysReleased: () => waitPickKeysReleased(PICK_KEYS_WAIT_MS),
      hidePalette: (restoreFocus) => hidePalette({ restoreFocus }),
      showSaveDialog: async (name) => {
        const r = await dialog.showSaveDialog({
          title: '용어 팩 내보내기',
          defaultPath: join(app.getPath('documents'), name),
          filters: [{ name: 'Sure-Mate 용어 팩', extensions: ['json'] }]
        })
        return r.canceled || !r.filePath ? null : r.filePath
      },
      showOpenDialog: async () => {
        const r = await dialog.showOpenDialog({ title: '용어 팩 가져오기', properties: ['openFile'], filters: [{ name: 'Sure-Mate 용어 팩', extensions: ['json'] }] })
        return r.canceled ? null : (r.filePaths[0] ?? null)
      },
      writeFile: (path, text) => writeFile(path, text, 'utf8'),
      readFile: async (path) => {
        try {
          if ((await stat(path)).size > PACK_MAX_BYTES) return { error: 'too-big' }
          return { text: await readFile(path, 'utf8') }
        } catch {
          return { error: 'read-failed' }
        }
      },
      confirm: async (detail) =>
        (
          await dialog.showMessageBox({
            type: 'question',
            title: 'Sure-Mate',
            message: '이 용어 팩을 가져올까요?',
            detail,
            buttons: ['가져오기', '취소'],
            defaultId: 0,
            cancelId: 1,
            noLink: true
          })
        ).response === 0,
      notify,
      log,
      now: () => new Date()
    })
    // 사전이 깨지면 이름이 가려지지 않으므로 트레이로도 알린다(확인 화면에는 미리 보기 경고로)
    const loadDictionary = createTermsCache(userData, (errors) => reportFileErrors('가명 사전 항목', 'masking.dictionaryErrors', errors))
    masking = createMaskingService({ loadDictionary, settings: () => settings.masking, now: Date.now })
    glossaryEntries = (await glossaryCache.get()).entries
    const session = createPromptRuntime({ userData, getSettings: () => settings, getTemplates: () => templates, getGlossary: () => glossaryEntries, masking })
    prompts = session
    snippets = createSnippetRuntime({ getTemplates: () => templates })
    maskingCommands = createMaskingCommandsRuntime({
      userData,
      masking,
      getMode: () => settings.masking.mode,
      // 파일을 다시 읽어 모드만 바꾼다(실행 중에 손으로 고친 사내 도메인 등을 덮어쓰지 않게). 트레이·바도 갱신
      setMode: setMaskingMode
    })
    // 워크스페이스(설계 §11): workspaces.json은 팔레트를 열 때마다 바뀌었는지 보고 다시 읽고, 읽지 못한 항목은 트레이로 알린다.
    // 저장·불러오기는 한 번에 하나이고, Win32를 쓸 수 없으면 알리기만 하고 창·파일을 바꾸지 않는다
    const workspaceService = createWorkspaceRuntime({
      userData,
      reportErrors: (errors) => reportFileErrors('워크스페이스', 'workspaces.loadErrors', errors),
      // 설정 창의 '쓰는 중'·'등록 못 함'(단축키 관리자는 startShell에서 생긴다). 되살리지 못한 조합은 등록 못 함(A-M6)
      hotkeyBound: (id) => {
        const hid = workspaceHotkeyId(id)
        return hotkeys?.isRegistered(hid) ? hotkeys.current(hid) : undefined
      },
      // 첫 실행 안내의 워크스페이스 따라 해 보기: 어디서 불러왔든(팔레트·단축키·바·안내 창) 안내 창에 알린다. 안내 창이 열려 있으면
      // 포커스는 그대로 두고 맨 위로만 올려 '해냈어요'가 보이게 한다(다른 앱에서 불러오면 안내 창이 불러온 창들 뒤로 간다)
      restored: (id) => {
        const progress: OnboardingProgress = { kind: 'workspace', id }
        sendToSettings(IPC.onboardingProgress, progress)
        if (settingsRoute() === '/onboarding') settingsWindow()?.moveTop()
      }
    })
    const workspaceCmds = createWorkspaceCommands({
      service: workspaceService,
      waitKeysReleased: () => waitPickKeysReleased(PICK_KEYS_WAIT_MS),
      hidePalette: (restoreFocus) => hidePalette({ restoreFocus }),
      // 편집은 설정 창의 워크스페이스 탭에서(그 워크스페이스의 이름 칸을 골라 둔다)
      openEditor: (ws) => openSettings('/settings', { tab: 'workspace', ws }),
      notify
    })
    workspaceCommands = workspaceCmds
    // 열린 설정 창의 워크스페이스 탭이 어디서 바뀐 것이든(팔레트·바 저장, 단축키, 편집, 지우기) 새 목록을 그리게 한다
    workspaceService.onChange(() => pushWorkspaceView(workspaceService))
    // 말하듯 입력(설계 §13): 단어 목록(기본본 + 사용자 intents.json), 기억한 문장, 사용 기록은 모두 이 PC에만 저장한다
    const intentCache = createIntentCache(userData, builtinIntents, (errors) => reportFileErrors('말하듯 입력 단어 목록', 'intents.loadErrors', errors))
    // 단어 목록 파일 열기: 팔레트 명령(cmd.open-intents)과 설정 창 말하듯 입력 탭이 같은 흐름(없으면 만들고 열기, 못 열면 폴더와 알림)
    const intentFile: IntentFileDeps = {
      ensure: () => ensureUserIntents(userData, builtinIntents),
      openFile: (path) => electronShell.openPath(path),
      showInFolder: (path) => electronShell.showItemInFolder(path),
      notify,
      log
    }
    naturalCommands = createNaturalCommands({
      ...intentFile,
      waitKeysReleased: () => waitPickKeysReleased(PICK_KEYS_WAIT_MS),
      hidePalette: (restoreFocus) => hidePalette({ restoreFocus })
    })
    /** 지금 팔레트 항목(팔레트 목록과 같은 규칙). 설정 창 말하듯 입력 탭은 이것으로 기억한 문장·의도 대상의 이름과 구역을 찾는다 */
    const paletteItemsOf = async (list: Template[], glossary: GlossaryEntry[]): Promise<PaletteItem[]> => {
      // 워크스페이스 구역: "지금 배치 저장"과 저장한 배치(지금 모니터 구성과 다르면 부제에 알린다)
      const workspaceItems = workspacePaletteItems(await workspaceService.list(), monitorFingerprint(getMonitors()), { restorable: workspaceService.hideRestorable() })
      return buildPaletteItems(list, DEV_COMMAND_ITEMS, {
        maskingMode: settings.masking.mode,
        glossary,
        barShape: settings.bar.shape,
        petVisible: settings.pet.visible,
        // 졸고 있으면 "재우기" 대신 "깨우기"(M4)
        petSleeping: petRuntime?.controller.status().mode === 'sleep',
        workspaces: workspaceItems
      })
    }
    // 기억한 문장·사용 기록: 팔레트 검색 문맥과 설정 창 말하듯 입력 탭이 같은 저장소를 쓴다. 저장소가 바꾼 값을 메모리에 바로 두고
    // 팔레트는 보일 때마다 검색 문맥을 새로 받으므로, 설정 창에서 지운 문장·기록은 다음 검색부터 빠진다(따로 지울 캐시가 없다)
    const naturalService = createNaturalService({
      phrases: createPhraseStore(userData),
      usage: createUsageStore(userData),
      intents: () => intentCache.state(),
      items: async () => paletteItemsOf(await templateCache.get(), (await glossaryCache.get()).entries),
      openIntents: () => openIntentsFile(intentFile),
      notify,
      log,
      now: Date.now
    })
    // 열린 설정 창의 말하듯 입력 탭이 어디서 바뀐 것이든(팔레트 선택·기억하기, 지우기) 새 보기를 그리게 한다(문장은 로그에 남기지 않는다)
    naturalService.onChange(() => {
      if (settingsContentsId() === null) return
      void naturalService
        .view()
        .then((v) => sendToSettings(IPC.naturalChanged, v))
        .catch((e) => log('natural.pushError', { error: errorText(e) }))
    })
    workspaceSvc = workspaceService
    // 시작할 때 한 번 읽어 깨진 파일을 바로 알린다
    await workspaceService.list()
    createPaletteWindow({ getDisplayMode: () => settings.palette.display })
    // 뒤 단계가 실패해도 팔레트가 Esc·항목 실행·상태 표시에 반응하도록 IPC를 먼저 연다
    registerIpc({
      hide: () => hidePalette({ restoreFocus: true }),
      runItem,
      listItems: async () => {
        templates = await templateCache.get()
        const glossary = (await glossaryCache.get()).entries
        glossaryEntries = glossary
        // 고정 프롬프트의 이름·목록이 바뀌었을 수 있어 바도 다시 그린다
        applySettings(settings)
        return paletteItemsOf(templates, glossary)
      },
      previewPrompt: (req) => session.preview(req),
      runPrompt: async (req) => {
        const result = await session.run(req)
        // 복사만이면 팔레트가 남아 있으니 숨기고 원래 창으로 돌아간다(AI를 열었으면 이미 숨김)
        if (result.ok) hidePalette({ restoreFocus: true })
        // 30초 따라 해 보기(설정 창의 #/try, 회의록 정리)를 마쳤다고 그 창에 알린다
        if (result.ok && lastPreparedTemplate === ONBOARDING_TEMPLATE)
          sendToSettings(IPC.onboardingProgress, { kind: 'prompt' } satisfies OnboardingProgress)
        return result
      },
      cancelPrompt: () => session.cancel(),
      // 확인 화면의 가명 처리 첫 안내를 다 봤다: 설정에 남겨 다시 보이지 않게 한다(이미 봤으면 쓰지 않는다)
      maskingTipSeen: (reason) => {
        if (settings.tips.maskingExampleSeen) return
        log('masking.tipSeen', { reason })
        void changeSettings((cur) =>
          cur.tips.maskingExampleSeen
            ? cur
            : { ...cur, tips: { ...cur.tips, maskingExampleSeen: true } }
        ).catch((e) => log('masking.tipSeenError', { error: errorText(e) }))
      },
      wiki,
      // 검색 문맥·선택 기록은 팔레트 창, 보기·지우기·단어 목록 파일 열기는 설정 창이 보낸 것만 받는다
      natural: naturalService,
      saveImeLog,
      getStatus: () => ({
        paletteHotkey: paletteHotkey(),
        maskingMode: settings.masking.mode,
        aiTargetName: pickAiTarget({ defaultId: settings.ai.defaultTarget, targets: allAiTargets(settings.ai.custom) }).name
      }),
      overlay: () => barRuntime,
      // 편집 화면은 설정 창의 워크스페이스 탭: 목록·보기·편집·다시 저장·새로 저장(알림 없이 결과를 화면에)·불러오기(결과 알림)·지우기.
      // `@이름` 저장 줄은 팔레트가 보낸다
      workspaces: {
        list: () => workspaceService.listView(),
        get: (id) => workspaceService.view(id),
        edit: (id, edit) => workspaceService.edit(id, edit),
        recapture: (id) => workspaceService.recapture(id, { source: 'editor', quiet: true }),
        run: (id) => workspaceService.run(id, 'editor'),
        saveNew: () => workspaceService.saveNew({ source: 'editor', quiet: true }),
        remove: (id) => workspaceService.remove(id),
        setKeepOnTop: (id, on) => workspaceService.setKeepOnTop(id, on),
        saveAs: (name) => workspaceCmds.saveAs(name)
      },
      // 펫 채널은 펫 창이 보낸 것만 받는다(펫 런타임은 바 다음에 만든다)
      pet: () => petRuntime,
      // 팔레트 채널은 팔레트 창, 기록 저장은 기록기 창, 워크스페이스 편집·말하듯 입력 탭은 설정 창이 보낸 것만 받는다(모든 창이 같은 preload를 쓴다)
      paletteContentsId,
      imeLoggerContentsId,
      settingsContentsId
    })
    /** 기본 용어 id(설정 창이 기본 용어·고친 기본 용어를 가린다) */
    const builtinGlossaryIds = parseGlossaryPack(builtinGlossary, 'builtin').entries.map((e) => e.id)
    /** 기본 템플릿 id(설정 창이 '기본'·'기본을 고침'을 가린다) */
    const builtinTemplateIds = parseTemplatePack(builtinPrompts, 'builtin').templates.map((t) => t.id)
    /** 템플릿을 저장·지운 뒤: 다시 읽고 바의 고정 프롬프트·설정 창의 이름 목록을 고친다 */
    const afterTemplatesChanged = async (): Promise<void> => {
      templates = await templateCache.get()
      barRuntime?.refresh()
      settingsService.changed()
    }
    registerSettingsIpc({
      contentsId: settingsContentsId,
      service: settingsService,
      hotkeys: changerProxy,
      openFile: (which) => {
        if (which === 'settings') void openSettingsFile()
        else void electronShell.openPath(join(userData, 'logs'))
      },
      openOnboarding: () => openSettings('/onboarding'),
      finishOnboarding: async () => {
        await changeSettings((cur) => ({ ...cur, onboardingDone: true }))
        log('onboarding.finish', {})
        closeSettingsWindow()
      },
      // 안내 창에서 결과를 바로 보이므로 Windows 알림은 띄우지 않는다
      saveOnboardingWorkspace: (name) => workspaceService.saveAs(name, 'onboarding', { quiet: true }),
      dictionary: {
        get: () => loadMaskDictionary(userData),
        save: async (terms) => {
          const r = await saveMaskDictionary(userData, terms)
          log('masking.dictionary.save', r.ok ? { count: r.count } : { errors: r.errors.length })
          return r
        },
        importFile: importDictionaryFile,
        exportFile: exportDictionaryFile
      },
      templates: {
        list: async () => {
          templates = await templateCache.get()
          const mine = await readMyTemplates(userData)
          return { templates, mine: mine.templates.map((t) => t.id), builtinIds: builtinTemplateIds, errors: mine.errors }
        },
        save: async (draft) => {
          const r = await savePersonalTemplate(userData, draft)
          log('template.save', r.ok ? { id: r.id } : { errors: r.errors.length })
          if (r.ok) await afterTemplatesChanged()
          return r
        },
        remove: async (id) => {
          const r = await deletePersonalTemplate(userData, id)
          log('template.delete', { id, ok: r.ok })
          if (r.ok) await afterTemplatesChanged()
          return r
        },
        importFile: async () => {
          const path = await openDialog({ title: '템플릿 팩 가져오기', properties: ['openFile'], filters: [{ name: 'Sure-Mate 템플릿 팩', extensions: ['json'] }] })
          if (!path) return { canceled: true }
          let text: string
          try {
            if ((await stat(path)).size > PACK_MAX_BYTES) return { ok: false, errors: ['5MB가 넘는 파일은 가져오지 않아요'] }
            text = await readFile(path, 'utf8')
          } catch (e) {
            return { ok: false, errors: [`파일을 읽지 못했어요(${errorCode(e)})`] }
          }
          const r = await importTemplatePack(userData, text, templates.map((t) => t.id))
          log('template.import', r.ok ? { added: r.added, replaced: r.replaced } : { errors: r.errors.length })
          if (r.ok) await afterTemplatesChanged()
          return r
        },
        exportFile: async () => {
          const path = await saveDialog({ title: '내 템플릿 내보내기', defaultPath: join(app.getPath('documents'), 'sure-mate-templates.json'), filters: [{ name: 'Sure-Mate 템플릿 팩', extensions: ['json'] }] })
          if (!path) return { canceled: true }
          try {
            await writeFile(path, await exportMyTemplatesText(userData), 'utf8')
          } catch (e) {
            return { ok: false, errors: [`파일에 쓰지 못했어요(${errorCode(e)})`] }
          }
          log('template.export', {})
          return { ok: true }
        }
      },
      glossary: {
        list: async () => ({ entries: (await glossaryCache.get()).entries, builtinIds: builtinGlossaryIds }),
        save: (draft, o) => wiki.save(draft, o),
        remove: (id) => wiki.remove(id),
        // 팔레트 명령과 같은 흐름(대화상자·미리 보기 확인·알림)
        pack: async (which) => {
          await packCommands?.run(which === 'import' ? 'cmd.glossary-import' : 'cmd.glossary-export')
        }
      },
      references: {
        list: () => listReferenceKinds(templates, userData),
        get: (kind) => readReference(userData, kind),
        save: async (kind, text) => {
          const r = await saveReference(userData, kind, text)
          log('reference.save', { ok: r.ok, length: [...text].length })
          return r
        },
        remove: async (kind) => {
          const r = await deleteReference(userData, kind)
          log('reference.delete', { ok: r.ok })
          return r
        }
      }
    })

    try {
      await startShell()
    } catch (e) {
      log('app.startupError', { error: errorText(e) })
    }

    // 바는 팔레트·트레이 다음에 띄운다(바가 실패해도 팔레트·트레이는 동작한다)
    try {
      startBar()
    } catch (e) {
      log('bar.startError', { error: errorText(e) })
    }

    // 말랑 메이트는 바 다음에 띄운다(펫이 실패해도 바·팔레트·트레이는 동작한다)
    try {
      startPet()
    } catch (e) {
      petRuntime = null
      log('pet.startError', { error: errorText(e) })
    }

    // 첫 실행 안내(설계 문서 §6). 끝내지 않았으면 다음 실행에도 띄운다
    if (shouldShowOnboarding(settings)) openSettings('/onboarding')
  })

  // 창이 모두 닫혀도 트레이에 남는다
  app.on('window-all-closed', () => {})
  // 화면 감추기가 항상 위에 둔 업무 창을 앱이 끝나기 전에 푼다(그대로 두면 다른 창 위에 계속 남는다)
  app.on('before-quit', () => workspaceSvc?.shutdown())
  app.on('will-quit', () => {
    hotkeyChanger?.dispose()
    globalShortcut.unregisterAll()
    // 펫의 동작 고리·커서 조회·맨 앞 유지 타이머와 화면·앱 일 구독을 멈춘다(바보다 먼저: 펫이 바에 이어져 있다)
    petRuntime?.dispose()
    petRuntime = null
    // 맨 앞 유지·전체 화면 확인·펼침 창 타이머와 화면 이벤트 구독을 멈춘다
    barRuntime?.dispose()
    barRuntime = null
  })
}
