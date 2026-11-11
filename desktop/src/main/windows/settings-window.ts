import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { SettingsTabId } from '../../shared/settings/settings-route'
import { log } from '../log'
import { loadRoute } from './overlay-window'
import { planSettingsOpen, settingsWindowOptions, type SettingsRoute } from './settings-window-options'

export type { SettingsRoute, SettingsTabId }

let win: BrowserWindow | null = null
let route: SettingsRoute = '/settings'
let onClosed: (() => void) | null = null

/** 설정 창의 webContents id(설정 IPC가 보낸 창을 확인한다). 열려 있지 않으면 null */
export const settingsContentsId = (): number | null => (win && !win.isDestroyed() ? win.webContents.id : null)

/** 열린 설정 창(대화상자의 부모 창). 없으면 null */
export const settingsWindow = (): BrowserWindow | null => (win && !win.isDestroyed() ? win : null)

/** 열린 설정 창에 보낸다(없으면 아무것도 하지 않음) */
export function sendToSettings(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

/**
 * 설정 창(설계 문서 §5): 열 때 만들고 닫으면 없앤다(§16 메모리). 하나만 열고, 이미 열려 있으면 그 경로로 바꿔 앞으로 가져온다.
 * tab을 주면 그 탭을 연다(설정 창만): 새 창·경로 바꾸기는 주소에 붙이고, 열린 설정 창은 다시 읽지 않고 화면에 알린다
 * (planSettingsOpen). closed는 창이 닫힐 때 한 번 부른다(단축키 녹화를 멈추는 등).
 */
export function openSettingsWindow(next: SettingsRoute, o: { closed?: () => void; tab?: SettingsTabId } = {}): void {
  if (o.closed) onClosed = o.closed
  const open = win && !win.isDestroyed() ? win : null
  const plan = planSettingsOpen(open ? { route, loading: open.webContents.isLoading() } : null, next, o.tab)
  if (open) {
    if (plan.kind === 'switch-route') {
      route = next
      const opts = settingsWindowOptions('', next)
      open.setResizable(true)
      open.setMinimumSize(opts.minWidth ?? 0, opts.minHeight ?? 0)
      open.setSize(opts.width ?? 880, opts.height ?? 640)
      open.setResizable(opts.resizable !== false)
      open.setTitle(opts.title ?? 'Sure-Mate')
      open.center()
      loadRoute(open, plan.hash)
    } else if (plan.kind === 'reload') {
      loadRoute(open, plan.hash)
    } else if (plan.kind === 'show' && plan.tab) {
      open.webContents.send(IPC.settingsShowTab, plan.tab)
    }
    if (open.isMinimized()) open.restore()
    open.show()
    open.focus()
    log('settings.window', { route: next, reused: true, ...(o.tab ? { tab: o.tab } : {}) })
    return
  }
  route = next
  const w = new BrowserWindow(settingsWindowOptions(join(__dirname, '../preload/index.js'), next))
  // 메뉴 막대를 없앤다(Alt를 눌러 단축키를 녹화할 때 기본 메뉴가 나오지 않게)
  w.removeMenu()
  win = w
  loadRoute(w, plan.kind === 'create' ? plan.hash : next)
  w.once('ready-to-show', () => {
    if (!w.isDestroyed()) {
      w.show()
      w.focus()
    }
  })
  w.on('closed', () => {
    if (win === w) win = null
    log('settings.window.closed', { route })
    onClosed?.()
  })
  log('settings.window', { route: next, reused: false, ...(o.tab ? { tab: o.tab } : {}) })
}

/** 설정 창을 닫는다(온보딩을 마쳤을 때) */
export function closeSettingsWindow(): void {
  if (win && !win.isDestroyed()) win.close()
}
