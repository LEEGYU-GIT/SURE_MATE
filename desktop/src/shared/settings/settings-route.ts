import { parseWorkspaceId } from '../workspace/workspace-ipc'

/**
 * 설정 창 경로(설계 문서 §5): 설정 창과, 같은 창에 뜨는 첫 실행 안내·30초 따라 해 보기(트레이 메뉴·팔레트 명령으로 언제든 연다).
 * 따라 해 보기는 그 창에 선택해 둔 메모를 팔레트가 가져가야 하므로, 팔레트가 돌아갈 창으로 기억하는 설정 창에 띄운다
 */
export const SETTINGS_ROUTES = ['/settings', '/onboarding', '/try'] as const
export type SettingsRoute = (typeof SETTINGS_ROUTES)[number]

export const isSettingsRoute = (v: unknown): v is SettingsRoute =>
  SETTINGS_ROUTES.includes(v as SettingsRoute)

/**
 * 설정 창 탭 id(왼쪽 목록 순서, 설계 문서 §14). 이름표는 renderer/src/settings/tabs.ts에 있고, 탭을 더할 때는 두 곳에 함께
 * 더한다(main이 그 탭으로 설정 창을 열 수 있게: openSettings('/settings', { tab: 'pet' }), 말하듯 입력은 { tab: 'natural' }).
 */
export const SETTINGS_TAB_IDS = ['general', 'hotkeys', 'ai', 'prompts', 'masking', 'glossary', 'workspace', 'bar', 'pet', 'natural'] as const
export type SettingsTabId = (typeof SETTINGS_TAB_IDS)[number]

export const isSettingsTabId = (v: unknown): v is SettingsTabId => SETTINGS_TAB_IDS.includes(v as SettingsTabId)

/**
 * 설정 창 주소의 # 뒤. 처음 열 탭은 설정 창에만 붙이고, 워크스페이스 탭은 열 워크스페이스 id도 붙일 수 있다
 * (팔레트 워크스페이스 행의 Ctrl+Enter, 지금 배치 저장 뒤 이름 바꾸기)
 */
export type SettingsHash = SettingsRoute | `/settings?tab=${SettingsTabId}` | `/settings?tab=workspace&ws=${string}`

export function settingsHash(route: SettingsRoute, tab?: SettingsTabId | null, ws?: string | null): SettingsHash {
  if (route !== '/settings' || !tab) return route
  const id = tab === 'workspace' ? parseWorkspaceId(ws) : null
  return id ? `/settings?tab=workspace&ws=${id}` : `/settings?tab=${tab}`
}

/** 설정 창 주소: 탭(소문자·하이픈), 워크스페이스 탭이면 id(workspaces.json 규칙: 영문·숫자·하이픈 1~64자)까지. 다른 꼴은 모른다 */
const HASH_RE = /^#?\/settings\?tab=([a-z-]+)(?:&ws=([A-Za-z0-9-]{1,64}))?$/

function parseHash(hash: string): { tab: SettingsTabId; ws: string | null } | null {
  const m = HASH_RE.exec(hash)
  if (!m || !isSettingsTabId(m[1])) return null
  // 워크스페이스 id는 워크스페이스 탭에만 붙는다
  if (m[2] !== undefined && m[1] !== 'workspace') return null
  return { tab: m[1], ws: m[2] ?? null }
}

/** 처음 열 탭('#/settings?tab=pet' → 'pet'). 설정 창 주소가 아니거나 모르는 탭이면 null(일반 탭으로 연다) */
export function tabFromHash(hash: string): SettingsTabId | null {
  return parseHash(hash)?.tab ?? null
}

/** 처음 열 워크스페이스('#/settings?tab=workspace&ws=<id>' → id). 없거나 틀리면 null(워크스페이스 목록을 연다) */
export function workspaceFromHash(hash: string): string | null {
  return parseHash(hash)?.ws ?? null
}

/** 화면을 고르는 경로('#/settings?tab=pet' → '/settings'). 물음표 뒤는 뗀다 */
export function routeOfHash(hash: string): string {
  return hash.replace(/^#/, '').split('?')[0]
}
