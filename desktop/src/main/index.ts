import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { optimizer } from '@electron-toolkit/utils'
import { app, globalShortcut, type Tray } from 'electron'
import { maskingModeLabel } from '../shared/labels'
import { isDevCommand, runDevCommand } from './dev/dev-commands'
import { HotkeyManager } from './hotkeys/hotkey-manager'
import { registerIpc } from './ipc'
import { log } from './log'
import { DEFAULT_SETTINGS, loadSettings, PALETTE_HOTKEY_FALLBACKS, saveSettings, type Settings } from './settings/settings-store'
import { createTray } from './tray'
import { openImeLoggerWindow } from './windows/ime-logger-window'
import { createPaletteWindow, hidePalette, isPaletteVisible, showPalette } from './windows/palette-window'

app.setName('Sure-Mate')

let settings: Settings = DEFAULT_SETTINGS
let tray: Tray | null = null
let hotkeys: HotkeyManager | null = null

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
  tray?.displayBalloon({ iconType: 'warning', title: 'Sure-Mate', content })
}

function paletteHotkey(): string {
  return hotkeys?.current('palette') ?? settings.hotkeys.palette
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showPalette({ mode: 'search' }))

  app.whenReady().then(async () => {
    app.setAppUserModelId('kr.suremate.app')
    app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

    settings = await loadSettings(app.getPath('userData'))
    createPaletteWindow({ getDisplayMode: () => settings.palette.display })

    const manager = new HotkeyManager({
      register: (acc, cb) => {
        try {
          return globalShortcut.register(acc, cb)
        } catch {
          return false
        }
      },
      unregister: (acc) => globalShortcut.unregister(acc)
    })
    hotkeys = manager

    let suspended = false
    tray = createTray({
      tooltip: () => `Sure-Mate · 팔레트 ${paletteHotkey()}`,
      maskingLabel: () => maskingModeLabel(settings.masking.mode),
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

    const wanted = settings.hotkeys.palette
    const bound = manager.bindFirst('palette', [...new Set([wanted, ...PALETTE_HOTKEY_FALLBACKS])], togglePalette)
    if (bound.ok && bound.acc !== wanted) {
      warn(`${wanted}는 다른 앱이 쓰고 있어 팔레트 단축키를 ${bound.acc}로 정했어요.`)
      settings = { ...settings, hotkeys: { ...settings.hotkeys, palette: bound.acc } }
      await saveSettings(app.getPath('userData'), settings)
    } else if (!bound.ok) {
      warn(`팔레트 단축키(${bound.tried.join(', ')})를 모두 다른 앱이 쓰고 있어요. 트레이 아이콘을 눌러 팔레트를 열 수 있어요.`)
    }

    // 개발 모드에서 등록하면 node_modules의 electron.exe가 시작 프로그램에 들어가므로 설치본에서만
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, args: ['--hidden'] })

    registerIpc({
      hide: () => hidePalette({ restoreFocus: true }),
      runItem,
      saveImeLog,
      getStatus: () => ({ paletteHotkey: paletteHotkey(), maskingMode: settings.masking.mode })
    })
    log('app.ready', { version: app.getVersion(), paletteHotkey: bound.ok ? bound.acc : null })
  })

  // 창이 모두 닫혀도 트레이에 남는다
  app.on('window-all-closed', () => {})
  app.on('will-quit', () => globalShortcut.unregisterAll())
}
