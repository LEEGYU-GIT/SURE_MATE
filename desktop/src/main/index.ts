import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { optimizer } from '@electron-toolkit/utils'
import { app, globalShortcut, type Tray } from 'electron'
import builtinPrompts from '../../resources/prompts.json'
import { allAiTargets, pickAiTarget } from '../shared/ai-targets'
import type { Template } from '../shared/template/types'
import { DEV_COMMAND_ITEMS, isDevCommand, runDevCommand, showCaptureResult } from './dev/dev-commands'
import { errorText } from './error-text'
import { HotkeyManager } from './hotkeys/hotkey-manager'
import { registerIpc } from './ipc'
import { log } from './log'
import type { MaskingCommands } from './masking/masking-commands'
import { createMaskingCommandsRuntime } from './masking/masking-commands-runtime'
import { createMaskingService, type MaskingService } from './masking/masking-service'
import { createTermsCache } from './masking/terms-cache'
import { isAcceleratorHeld } from './native/input'
import { nativeStatus } from './native/win32'
import { buildPaletteItems } from './prompts/palette-items'
import { createPromptRuntime } from './prompts/prompt-runtime'
import type { PromptSession } from './prompts/prompt-session'
import { createTemplateCache } from './prompts/template-cache'
import { DEFAULT_SETTINGS, loadSettings, PALETTE_HOTKEY_FALLBACKS, saveSettings, type Settings } from './settings/settings-store'
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
let masking: MaskingService | null = null
let maskingCommands: MaskingCommands | null = null
let shell: { tray: Tray; refresh: () => void } | null = null
let hotkeys: HotkeyManager | null = null
/** 트레이가 생기기 전에 생긴 파일 읽기 오류(트레이가 생기면 알린다) */
let pendingFileErrors: { what: string; errors: string[] }[] = []

function togglePalette(): void {
  if (isPaletteVisible()) hidePalette({ restoreFocus: true })
  else showPalette({ mode: 'search' })
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
  if (id.startsWith('prompt:') && prompts) return prompts.prepare(id.slice('prompt:'.length))
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
  for (const p of pendingFileErrors) warn(`${p.what} ${p.errors.length}건을 읽지 못해 건너뛰었어요. ${p.errors[0]}`)
  pendingFileErrors = []
}

/** 읽지 못한 템플릿·가명 사전 파일을 사용자에게 알린다. 파일 이름·항목에 고객사명이 있을 수 있어 로그에는 건수만 남긴다 */
function reportFileErrors(what: string, event: string, errors: string[]): void {
  log(event, { count: errors.length })
  pendingFileErrors.push({ what, errors })
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
    settings = { ...settings, hotkeys: { ...settings.hotkeys, palette: bound.acc } }
    try {
      await saveSettings(userData, settings)
    } catch (e) {
      log('settings.saveError', { error: errorText(e) })
    }
  } else if (!bound.ok) {
    warn(`팔레트 단축키(${bound.tried.join(', ')})를 모두 다른 앱이 쓰고 있어요. 트레이 아이콘을 눌러 팔레트를 열 수 있어요.`)
  }

  // 조회 단축키: M1에서는 선택 텍스트 가져오기 검증용(M4에서 사이드 패널로 바꾼다)
  const lookup = manager.bind('lookup', settings.hotkeys.lookup, () => {
    if (!isPaletteVisible()) showCaptureResult().catch((e) => log('dev.capture.error', { error: errorText(e) }))
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
    // 사전이 깨지면 이름이 가려지지 않으므로 트레이로도 알린다(확인 화면에는 미리 보기 경고로)
    const loadDictionary = createTermsCache(userData, (errors) => reportFileErrors('가명 사전 항목', 'masking.dictionaryErrors', errors))
    masking = createMaskingService({ loadDictionary, settings: () => settings.masking, now: Date.now })
    const session = createPromptRuntime({ userData, getSettings: () => settings, getTemplates: () => templates, masking })
    prompts = session
    maskingCommands = createMaskingCommandsRuntime({
      userData,
      masking,
      getMode: () => settings.masking.mode,
      setMode: async (mode) => {
        settings = { ...settings, masking: { ...settings.masking, mode } }
        shell?.refresh()
        try {
          await saveSettings(userData, settings)
        } catch (e) {
          log('settings.saveError', { error: errorText(e) })
        }
      }
    })
    createPaletteWindow({ getDisplayMode: () => settings.palette.display })
    // 뒤 단계가 실패해도 팔레트가 Esc·항목 실행·상태 표시에 반응하도록 IPC를 먼저 연다
    registerIpc({
      hide: () => hidePalette({ restoreFocus: true }),
      runItem,
      listItems: async () => {
        templates = await templateCache.get()
        return buildPaletteItems(templates, DEV_COMMAND_ITEMS, { maskingMode: settings.masking.mode })
      },
      previewPrompt: (req) => session.preview(req),
      runPrompt: async (req) => {
        const result = await session.run(req)
        // 복사만이면 팔레트가 남아 있으니 숨기고 원래 창으로 돌아간다(AI를 열었으면 이미 숨김)
        if (result.ok) hidePalette({ restoreFocus: true })
        return result
      },
      cancelPrompt: () => session.cancel(),
      saveImeLog,
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
  })

  // 창이 모두 닫혀도 트레이에 남는다
  app.on('window-all-closed', () => {})
  app.on('will-quit', () => globalShortcut.unregisterAll())
}
