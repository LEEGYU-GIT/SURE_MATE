import { randomUUID } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { optimizer } from '@electron-toolkit/utils'
import { app, clipboard, dialog, shell as electronShell, globalShortcut, type Tray } from 'electron'
import builtinGlossary from '../../resources/glossary.json'
import builtinPrompts from '../../resources/prompts.json'
import { allAiTargets, pickAiTarget } from '../shared/ai-targets'
import { withPosition, type BarShape } from '../shared/bar/bar-settings'
import type { FlyoutAction, WikiCardView } from '../shared/flyout/flyout-content'
import type { ShownPayload } from '../shared/ipc-channels'
import type { MaskingMode } from '../shared/types'
import { createBarActions } from './bar/bar-actions'
import { createBarCommands } from './bar/bar-commands'
import { createBarRuntime, type BarRuntime } from './bar/bar-runtime'
import type { GlossaryEntry } from '../shared/glossary/types'
import type { Template } from '../shared/template/types'
import { DEV_COMMAND_ITEMS, isDevCommand, runDevCommand } from './dev/dev-commands'
import { errorText } from './error-text'
import { fileErrorNotice, type FileErrorReport } from './file-error-notice'
import { createGlossaryRuntime } from './glossary/glossary-runtime'
import { createGlossaryCache, saveUserEntries } from './glossary/glossary-store'
import { createPackCommands, PACK_MAX_BYTES } from './glossary/pack-commands'
import { createWikiCard } from './glossary/wiki-card'
import { createWikiCardActions } from './glossary/wiki-card-actions'
import { HotkeyManager } from './hotkeys/hotkey-manager'
import { registerIpc } from './ipc'
import { log } from './log'
import type { MaskingCommands } from './masking/masking-commands'
import { createMaskingCommandsRuntime } from './masking/masking-commands-runtime'
import { createMaskingService, type MaskingService } from './masking/masking-service'
import { createTermsCache } from './masking/terms-cache'
import { isAcceleratorHeld, waitPickKeysReleased } from './native/input'
import { captureSelection, writeClipboardText } from './native/selection'
import { nativeStatus } from './native/win32'
import { buildPaletteItems } from './prompts/palette-items'
import { notify } from './notify'
import { createPromptRuntime, PICK_KEYS_WAIT_MS } from './prompts/prompt-runtime'
import type { PromptSession } from './prompts/prompt-session'
import { createTemplateCache } from './prompts/template-cache'
import { createSnippetRuntime } from './snippets/snippet-runtime'
import { DEFAULT_SETTINGS, loadSettings, PALETTE_HOTKEY_FALLBACKS, saveSettings, updateSettings, type Settings } from './settings/settings-store'
import { createTray } from './tray'
import { lockNavigation } from './windows/navigation-guard'
import { openImeLoggerWindow } from './windows/ime-logger-window'
import { createPaletteWindow, hidePalette, isPaletteVisible, showPalette } from './windows/palette-window'

app.setName('Sure-Mate')

// 처리하지 못한 오류를 기록한다. 동기 예외는 Electron 기본 동작(오류 창)을 그대로 두고 기록만 덧붙인다.
process.on('unhandledRejection', (reason) => log('error.unhandledRejection', { error: errorText(reason) }))
process.on('uncaughtExceptionMonitor', (e) => log('error.uncaughtException', { error: errorText(e) }))

let settings: Settings = DEFAULT_SETTINGS
let templates: Template[] = []
let prompts: PromptSession | null = null
let snippets: { run(templateId: string): Promise<unknown> } | null = null
let masking: MaskingService | null = null
let maskingCommands: MaskingCommands | null = null
let packCommands: { run(id: string): Promise<boolean> } | null = null
/** 지금 용어 목록. 팔레트를 열 때(목록 요청)마다 새로 읽은 것으로 바꾼다({{terms}}는 이것을 쓴다) */
let glossaryEntries: GlossaryEntry[] = []
let shell: { tray: Tray; refresh: () => void } | null = null
let hotkeys: HotkeyManager | null = null
/** Sure-Mate 바·펼침 창(시작에 실패하면 null, 팔레트·트레이는 그대로) */
let barRuntime: BarRuntime | null = null
let barActions: { run(id: string): Promise<void> } | null = null
let barCommands: { run(id: string): Promise<boolean> } | null = null
/** 선택 글 위키 카드(Ctrl+Alt+W)와 카드 단추 처리 */
let wikiCard: { lookupSelection(): Promise<void>; lookupClipboard(): Promise<void> } | null = null
let wikiCardAction: ((a: FlyoutAction) => Promise<boolean> | null) | null = null
/** 트레이가 생기기 전에 생긴 파일 읽기 오류(트레이가 생기면 알린다) */
let pendingFileErrors: FileErrorReport[] = []

function togglePalette(): void {
  if (isPaletteVisible()) hidePalette({ restoreFocus: true })
  else showPalette({ mode: 'search' })
}

/** 설정이 바뀌면 트레이 툴팁과 바를 다시 그린다 */
function applySettings(next: Settings): void {
  settings = next
  shell?.refresh()
  barRuntime?.refresh()
}

/** 파일을 다시 읽어 바꿀 값만 고쳐 저장하고(실행 중 손으로 고친 값을 덮어쓰지 않게) 적용한다 */
async function changeSettings(userData: string, update: (cur: Settings) => Settings): Promise<void> {
  try {
    applySettings(await updateSettings(userData, update, (what, e) => log('settings.loadError', { what, error: errorText(e) })))
  } catch (e) {
    log('settings.saveError', { error: errorText(e) })
    applySettings(update(settings))
  }
}

/** 가명 처리 기본값 바꾸기(팔레트 명령과 바의 가명 처리 메뉴가 같이 쓴다) */
function setMaskingMode(userData: string, mode: MaskingMode): Promise<void> {
  return changeSettings(userData, (cur) => ({ ...cur, masking: { ...cur.masking, mode } }))
}

/** 바 모양을 저장하고 적용한다. 모양을 고르면 잠시 숨김도 푼다(트레이·팔레트·바 메뉴가 같이 쓴다) */
async function setBarShape(userData: string, shape: BarShape): Promise<void> {
  await changeSettings(userData, (cur) => ({ ...cur, bar: { ...cur.bar, shape } }))
  barRuntime?.bar.unsnooze()
  shell?.refresh()
}

/** 설정 화면이 생기기 전까지는 settings.json을 기본 프로그램으로 연다(없으면 만든다) */
async function openSettingsFile(userData: string): Promise<void> {
  const path = join(userData, 'settings.json')
  try {
    await stat(path)
  } catch {
    await saveSettings(userData, settings)
  }
  const error = await electronShell.openPath(path)
  if (error) {
    electronShell.showItemInFolder(path)
    notify('설정 파일(.json)을 열 프로그램이 없어 폴더를 열었어요. 메모장으로 열어 고쳐 주세요.')
  }
  log('settings.open', { opened: !error })
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
  if (barCommands && (await barCommands.run(id))) return
  if (packCommands && (await packCommands.run(id))) return
  if (id.startsWith('prompt:') && prompts) return prompts.prepare(id.slice('prompt:'.length))
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

/** 트레이가 있으면 쌓아 둔 파일 읽기 오류를 알린다 */
function flushFileErrors(): void {
  if (!shell) return
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
async function startShell(userData: string): Promise<void> {
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

  let suspended = false
  shell = createTray({
    paletteHotkey,
    maskingMode: () => settings.masking.mode,
    onOpenPalette: () => showPalette({ mode: 'search' }),
    onToggleSuspend: () => {
      if (suspended) {
        const { failed } = manager.resumeAll()
        if (failed.length) warn(`다시 등록하지 못한 단축키가 있어요: ${failed.join(', ')}`)
      } else {
        manager.suspendAll()
      }
      suspended = !suspended
      return suspended
    },
    onQuit: () => app.quit(),
    barShape: () => settings.bar.shape,
    onBarShape: (shape) => {
      log('bar.shape', { shape, source: 'tray' })
      void setBarShape(userData, shape)
    },
    barSnoozed: () => barRuntime?.bar.snoozed() ?? false,
    onUnsnooze: () => {
      barRuntime?.bar.unsnooze()
      shell?.refresh()
    }
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
    await changeSettings(userData, (cur) => ({ ...cur, hotkeys: { ...cur.hotkeys, palette: bound.acc } }))
  } else if (!bound.ok) {
    warn(`팔레트 단축키(${bound.tried.join(', ')})를 모두 다른 앱이 쓰고 있어요. 트레이 아이콘을 눌러 팔레트를 열 수 있어요.`)
  }

  // 조회 단축키: 선택한 글을 가져와 바 옆 위키 카드로 보인다(설계 문서 §9). 팔레트가 보이면 팔레트에서 찾는다
  const lookup = manager.bind('lookup', settings.hotkeys.lookup, () => {
    if (!isPaletteVisible()) wikiCard?.lookupSelection().catch((e) => log('wiki.card.error', { error: errorText(e) }))
  })
  if (!lookup.ok) warn(`조회 단축키 ${settings.hotkeys.lookup}를 등록하지 못했어요.`)

  flushFileErrors()

  // 툴팁을 실제로 등록된 단축키로 다시 그린다(대체 조합으로 바뀌었거나 하나도 못 잡은 경우)
  shell.refresh()
  log('tray.refresh', { paletteHotkey: paletteHotkey() })

  // 개발 모드에서 등록하면 node_modules의 electron.exe가 시작 프로그램에 들어가므로 설치본에서만
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, args: ['--hidden'] })
  log('app.ready', { version: app.getVersion(), paletteHotkey: bound.ok ? bound.acc : null, lookupHotkey: lookup.ok, native: native.ok })
}

/** Sure-Mate 바와 펼침 창을 띄운다(설계 문서 §14-1). 실패해도 팔레트·트레이는 그대로 쓴다 */
function startBar(userData: string): void {
  barRuntime = createBarRuntime({
    inputs: () => ({
      bar: settings.bar,
      maskingMode: settings.masking.mode,
      petVisible: settings.pet.visible,
      paletteHotkey: paletteHotkey(),
      templates
    }),
    savePosition: (display, ratio) => changeSettings(userData, (cur) => ({ ...cur, bar: withPosition(cur.bar, display, ratio) })),
    onVisibleChange: () => shell?.refresh(),
    log
  })
  barActions = createBarActions({
    isKnown: (id) => barRuntime?.bar.hasItem(id) ?? false,
    togglePalette,
    openPalette: (p: ShownPayload) => showPalette(p),
    toggleMenu: (kind, itemId) =>
      barRuntime?.flyout.toggleMenu(
        kind === 'masking-menu' ? { kind, mode: settings.masking.mode } : { kind, workspaces: [], canSave: false },
        itemId
      ),
    runPrompt: (templateId) => prompts?.runFromBar(templateId) ?? Promise.resolve('missing'),
    setBusy: (itemId) => barRuntime?.bar.setBusy(itemId),
    togglePet: () => changeSettings(userData, (cur) => ({ ...cur, pet: { ...cur.pet, visible: !cur.pet.visible } })),
    openSettings: () => openSettingsFile(userData),
    log
  })
  barCommands = createBarCommands({
    getShape: () => settings.bar.shape,
    setShape: (shape) => setBarShape(userData, shape),
    waitKeysReleased: () => waitPickKeysReleased(PICK_KEYS_WAIT_MS),
    hidePalette: (restoreFocus) => hidePalette({ restoreFocus }),
    notify,
    log
  })
}

/** 위키 카드를 바 옆에 띄운다. 바가 시작되지 못했으면 팔레트 위키에서 대신 보인다 */
function showWikiCard(view: WikiCardView): void {
  const r = barRuntime
  if (r) {
    r.flyout.showCard(view, { width: settings.bar.wikiCardWidth, autoHideMs: settings.bar.wikiCardMs })
    return
  }
  if (view.kind === 'best') showPalette({ mode: 'wiki', id: view.best.id })
  else showPalette({ mode: 'search', query: view.kind === 'none' ? `?${view.query}` : '?' })
}

/** 펼침 창에서 고른 동작(메뉴 행·위키 카드 단추) */
async function runFlyoutAction(userData: string, a: FlyoutAction): Promise<boolean> {
  const r = barRuntime
  if (!r) return false
  switch (a.type) {
    case 'set-masking':
      await setMaskingMode(userData, a.mode)
      r.flyout.close('done')
      return true
    case 'set-bar-shape':
      r.flyout.close('done')
      await setBarShape(userData, a.shape)
      return true
    case 'snooze-bar':
      r.flyout.close('done')
      r.bar.snooze()
      return true
    case 'open-settings':
      r.flyout.close('done')
      await openSettingsFile(userData)
      return true
    case 'close':
      r.flyout.close('button')
      return true
    default:
      return (await wikiCardAction?.(a)) ?? false
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showPalette({ mode: 'search' }))

  app.whenReady().then(async () => {
    app.setAppUserModelId('kr.suremate.app')
    app.on('browser-window-created', (_, w) => {
      optimizer.watchWindowShortcuts(w)
      // 모든 창: 파일을 끌어다 놓거나 링크를 눌러도 다른 주소로 이동하지 않는다
      lockNavigation(w.webContents)
    })

    const userData = app.getPath('userData')
    settings = await loadSettings(userData, (what, e) => log('settings.loadError', { what, error: errorText(e) }))
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
    // 선택 글 위키 카드(설계 문서 §9). 가져오기 결과·건수만 기록한다(선택 글·용어 이름 없음)
    const card = createWikiCard({
      capture: () => captureSelection(),
      readClipboard: async () => clipboard.readText(),
      entries: async () => (await glossaryCache.get()).entries,
      show: showWikiCard,
      log
    })
    wikiCard = card
    wikiCardAction = createWikiCardActions({
      copy: (id) => wiki.copy(id),
      pin: (pinned) => barRuntime?.flyout.pin(pinned),
      close: (reason) => barRuntime?.flyout.close(reason),
      showPalette: (p) => showPalette(p),
      lookupClipboard: () => card.lookupClipboard()
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
      // 파일을 다시 읽어 모드만 바꾼다(실행 중에 손으로 고친 사내 도메인 등을 덮어쓰지 않게)
      setMode: (mode) => setMaskingMode(userData, mode)
    })
    createPaletteWindow({ getDisplayMode: () => settings.palette.display })
    // 뒤 단계가 실패해도 팔레트가 Esc·항목 실행·상태 표시에 반응하도록 IPC를 먼저 연다
    registerIpc({
      hide: () => hidePalette({ restoreFocus: true }),
      runItem,
      listItems: async () => {
        templates = await templateCache.get()
        // 템플릿 이름이 바뀌었으면 바의 고정 프롬프트도 다시 그린다
        barRuntime?.refresh()
        const glossary = (await glossaryCache.get()).entries
        glossaryEntries = glossary
        return buildPaletteItems(templates, DEV_COMMAND_ITEMS, { maskingMode: settings.masking.mode, glossary, barShape: settings.bar.shape })
      },
      previewPrompt: (req) => session.preview(req),
      runPrompt: async (req) => {
        const result = await session.run(req)
        // 복사만이면 팔레트가 남아 있으니 숨기고 원래 창으로 돌아간다(AI를 열었으면 이미 숨김)
        if (result.ok) hidePalette({ restoreFocus: true })
        return result
      },
      cancelPrompt: () => session.cancel(),
      wiki,
      saveImeLog,
      barRuntime: () => barRuntime,
      barAction: async (id) => {
        await barActions?.run(id)
      },
      flyoutAction: (a) => runFlyoutAction(userData, a),
      barShape: () => settings.bar.shape,
      getStatus: () => ({
        paletteHotkey: paletteHotkey(),
        maskingMode: settings.masking.mode,
        aiTargetName: pickAiTarget({ defaultId: settings.ai.defaultTarget, targets: allAiTargets(settings.ai.custom) }).name
      })
    })

    try {
      await startShell(userData)
    } catch (e) {
      log('app.startupError', { error: errorText(e) })
    }
    try {
      startBar(userData)
    } catch (e) {
      barRuntime = null
      log('bar.startError', { error: errorText(e) })
    }
  })

  // 창이 모두 닫혀도 트레이에 남는다
  app.on('window-all-closed', () => {})
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    barRuntime?.dispose()
  })
}
