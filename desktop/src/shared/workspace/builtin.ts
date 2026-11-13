import { compactOf } from '../search/ranker'
import type { HotkeyCheck } from '../settings/settings-snapshot'
import type { Workspace } from './types'

// 기본 워크스페이스 '화면 감추기'(2026-11-12 사용자 결정 "화면 감추기용 워크스페이스가 기본으로 탑재되어 있어야 해, 끄고 켜는 게 아니라").
// 처음부터 있고 지울 수 없다. 불러오면 저장한 창만 앞에 남기고 나머지 앱 창을 모두 내린다(hide.ts). 이름·별칭·단축키·창 규칙은 다른
// 워크스페이스처럼 고친다(이름도 바꿀 수 있다: 찾는 기준은 고정 id다).

/** workspaces.json·IPC의 id 규칙(영문·숫자·하이픈)을 지키는 고정 id */
export const HIDE_WORKSPACE_ID = 'builtin-hide'
export const HIDE_WORKSPACE_NAME = '화면 감추기'
/** 이름이 다른 워크스페이스와 겹칠 때 쓰는 이름 */
const HIDE_WORKSPACE_NAME_TAKEN = '화면 감추기 (기본)'
/**
 * 팔레트에서 '화면 감춰줘'·'화면 숨겨줘'·'창 내려줘'처럼 말해도 맨 위에 오게 하는 별칭(natural-search 시험이 확인한다).
 * 별칭 제한(10개, 하나에 40자) 안이다
 */
export const HIDE_WORKSPACE_ALIASES: readonly string[] = ['감추기', '숨기기', '가리기', '화면 숨기기', '화면 가리기', '창 숨기기', '창 내리기']
/** 만들 때 이 조합이 비어 있으면 단축키로 정한다(defaultHideHotkey) */
export const HIDE_DEFAULT_HOTKEY = 'Ctrl+Alt+H'

export const isHideWorkspace = (id: string): boolean => id === HIDE_WORKSPACE_ID

/**
 * 기본 워크스페이스가 없으면 맨 앞에 더한 새 목록(added true), 있으면 받은 목록 그대로(added false: 사용자가 바꾼 이름·별칭·단축키·배치를
 * 덮지 않는다). 새로 만든 것은 배치가 비어 있어(저장 전) 불러오면 모든 앱 창을 내리고, 단축키는 hotkey(defaultHideHotkey의 결과).
 * 다른 워크스페이스가 같은 이름(compactOf)을 쓰면 '화면 감추기 (기본)'으로 만든다. 30개 제한에 들지 않는다(workspace-file.ts)
 */
export function withHideWorkspace(list: readonly Workspace[], o: { now: Date; hotkey: string | null }): { list: Workspace[]; added: boolean } {
  if (list.some((w) => isHideWorkspace(w.id))) return { list: list as Workspace[], added: false }
  const taken = list.some((w) => compactOf(w.name) === compactOf(HIDE_WORKSPACE_NAME))
  const hide: Workspace = {
    id: HIDE_WORKSPACE_ID,
    name: taken ? HIDE_WORKSPACE_NAME_TAKEN : HIDE_WORKSPACE_NAME,
    aliases: [...HIDE_WORKSPACE_ALIASES],
    hotkey: o.hotkey,
    layouts: {},
    updatedAt: o.now.toISOString()
  }
  return { list: [hide, ...list], added: true }
}

/**
 * 기본 워크스페이스를 만들 때 줄 단축키: 단축키 바꾸기 검사(hotkey-change.ts의 check: 막힌 조합·다른 단축키와 겹침·다른 앱이 씀·경고)가
 * 'ok'일 때만 Ctrl+Alt+H, 아니면 없음. 검사할 수 없으면(null) 없음. 만들 때 한 번만 정한다(사용자가 지운 단축키를 다시 넣지 않는다)
 */
export function defaultHideHotkey(level: HotkeyCheck['level'] | null): string | null {
  return level === 'ok' ? HIDE_DEFAULT_HOTKEY : null
}

/** 기본 워크스페이스를 맨 앞으로(나머지는 받은 차례 그대로, 새 배열). 설정 창 목록·팔레트 `@`·바 메뉴가 같은 규칙 */
export function hideFirst<T>(list: readonly T[], idOf: (x: T) => string): T[] {
  const hide = list.filter((x) => isHideWorkspace(idOf(x)))
  return [...hide, ...list.filter((x) => !isHideWorkspace(idOf(x)))]
}
