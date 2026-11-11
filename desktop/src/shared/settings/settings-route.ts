/** 설정 창 경로(설계 문서 §5): 설정 창과, 같은 창에 뜨는 첫 실행 안내 */
export type SettingsRoute = '/settings' | '/onboarding'

/**
 * 설정 창 탭 id(왼쪽 목록 순서, 설계 문서 §14). 이름표는 renderer/src/settings/tabs.ts에 있고, 탭을 더할 때는 두 곳에 함께
 * 더한다(main이 그 탭으로 설정 창을 열 수 있게: openSettings('/settings', { tab: 'pet' })). 워크스페이스·말하듯 입력은 M7이 더한다.
 */
export const SETTINGS_TAB_IDS = ['general', 'hotkeys', 'ai', 'prompts', 'masking', 'glossary', 'bar', 'pet'] as const
export type SettingsTabId = (typeof SETTINGS_TAB_IDS)[number]

export const isSettingsTabId = (v: unknown): v is SettingsTabId => SETTINGS_TAB_IDS.includes(v as SettingsTabId)

/** 설정 창 주소의 # 뒤. 처음 열 탭은 설정 창에만 붙인다 */
export type SettingsHash = SettingsRoute | `/settings?tab=${SettingsTabId}`

export function settingsHash(route: SettingsRoute, tab?: SettingsTabId | null): SettingsHash {
  return route === '/settings' && tab ? `/settings?tab=${tab}` : route
}

/** 처음 열 탭('#/settings?tab=pet' → 'pet'). 설정 창 주소가 아니거나 모르는 탭이면 null(일반 탭으로 연다) */
export function tabFromHash(hash: string): SettingsTabId | null {
  const m = /^#?\/settings\?tab=([a-z-]+)$/.exec(hash)
  return m && isSettingsTabId(m[1]) ? m[1] : null
}

/** 화면을 고르는 경로('#/settings?tab=pet' → '/settings'). 물음표 뒤는 뗀다 */
export function routeOfHash(hash: string): string {
  return hash.replace(/^#/, '').split('?')[0]
}
