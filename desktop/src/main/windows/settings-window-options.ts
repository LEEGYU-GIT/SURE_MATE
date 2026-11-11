import type { BrowserWindowConstructorOptions } from 'electron'
import { settingsHash, type SettingsHash, type SettingsRoute, type SettingsTabId } from '../../shared/settings/settings-route'
import { parseWorkspaceId } from '../../shared/workspace/workspace-ipc'

export type { SettingsRoute }

/** 제목 줄 색: 토큰 --surface-palette-solid, 창 단추 글자는 --text-2(§14-4) */
const SURFACE = '#1E212A'
const SYMBOL = '#C9D0DD'

/**
 * 설정 창 옵션(설계 문서 §5 "settings: 일반 창"). 포커스를 받고 작업 표시줄에 나오며, 제목 줄은 화면이 그리고
 * Windows 창 단추만 겹쳐 그린다(titleBarOverlay). 온보딩은 같은 창 모양에 작은 고정 크기.
 * 일렉트론 런타임을 불러오지 않는 순수 모듈이라 시험에서 바로 쓴다.
 */
export function settingsWindowOptions(preload: string, route: SettingsRoute): BrowserWindowConstructorOptions {
  const onboarding = route === '/onboarding'
  return {
    show: false,
    title: onboarding ? 'Sure-Mate 시작하기' : 'Sure-Mate 설정',
    width: onboarding ? 640 : 880,
    height: onboarding ? 560 : 640,
    ...(onboarding ? { resizable: false, maximizable: false } : { minWidth: 720, minHeight: 520, resizable: true }),
    skipTaskbar: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: SURFACE, symbolColor: SYMBOL, height: 40 },
    backgroundColor: SURFACE,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  }
}

/**
 * 화면(index.html)의 <title>Sure-Mate</title>가 창 제목을 바꾸지 않게 한다. 작업 표시줄·Alt+Tab에 "Sure-Mate 설정"·
 * "Sure-Mate 시작하기"(경로를 바꿀 때 setTitle)가 그대로 보인다. 설정 창과 첫 실행 안내는 같은 창이라 한 번 걸면 된다
 */
export function keepWindowTitle(w: { on(event: 'page-title-updated', listener: (e: { preventDefault(): void }) => void): unknown }): void {
  w.on('page-title-updated', (e) => e.preventDefault())
}

/**
 * 설정 창을 열 때 할 일. 열린 창은 다시 쓴다: 경로가 바뀌면(첫 실행 안내 ↔ 설정) 크기를 바꿔 다시 읽고, 같은 설정 창이면
 * 다시 읽지 않고 탭만 바꾸라고 알린다(다시 읽으면 녹화 중인 단축키·아직 저장하지 않은 입력이 사라진다).
 * 아직 읽는 중인 창은 알림을 받을 화면이 없을 수 있어 탭을 붙여 다시 읽는다(잃을 것이 없다).
 * 워크스페이스 탭은 열 워크스페이스 id(ws)를 함께 보낸다(형식이 맞는 id만, 다른 탭에는 붙이지 않는다).
 */
export type SettingsOpenPlan =
  | { kind: 'create'; hash: SettingsHash }
  | { kind: 'switch-route'; hash: SettingsHash }
  | { kind: 'reload'; hash: SettingsHash }
  /** 앞으로 가져오기만. tab이 있으면 화면에 그 탭(워크스페이스 탭이면 그 워크스페이스)을 고르라고 보낸다 */
  | { kind: 'show'; tab: SettingsTabId | null; ws: string | null }

export function planSettingsOpen(
  open: { route: SettingsRoute; loading: boolean } | null,
  next: SettingsRoute,
  tab?: SettingsTabId,
  ws?: string | null
): SettingsOpenPlan {
  const hash = settingsHash(next, tab, ws)
  if (!open) return { kind: 'create', hash }
  if (open.route !== next) return { kind: 'switch-route', hash }
  const pick = next === '/settings' ? (tab ?? null) : null
  if (pick && open.loading) return { kind: 'reload', hash }
  return { kind: 'show', tab: pick, ws: pick === 'workspace' ? parseWorkspaceId(ws) : null }
}
