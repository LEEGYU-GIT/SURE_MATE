import type { BrowserWindowConstructorOptions } from 'electron'

export type SettingsRoute = '/settings' | '/onboarding'

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
