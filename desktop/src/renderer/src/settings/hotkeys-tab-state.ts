import { repickParticle, withObjectParticle } from '../../../shared/josa'
import type { SettingsHotkeyId } from '../../../shared/settings/settings-snapshot'
import type { WorkspaceView } from '../../../shared/workspace/workspace-ipc'
import type { Notice } from './controls'

/**
 * 단축키 탭 문구(design:ux-copy, 해요체). 상태 글(쓰는 중·등록 못 함)과 등록 못 한 까닭은 워크스페이스·말랑 메이트 탭과 같은 말이다.
 * 등록 못 함은 빨간 글자지만 색만으로 알리지 않게 글자를 그대로 둔다
 */
export const HOTKEYS_COPY = {
  appTitle: '전역 단축키',
  workspaceTitle: '워크스페이스 단축키',
  inUse: '쓰는 중',
  notRegistered: '등록 못 함',
  none: '없음',
  change: '바꾸기',
  set: '정하기',
  clear: '지우기',
  taken: '다른 앱이 이 조합을 쓰고 있어 등록하지 못했어요. 다른 조합으로 바꿔 주세요.',
  loading: '워크스페이스를 읽는 중이에요…',
  noWorkspaces: '저장한 워크스페이스가 없어요',
  withoutHotkey: (n: number): string => `단축키가 없는 워크스페이스 ${n}개 · 워크스페이스 탭에서 정해요`,
  openWorkspaceTab: '워크스페이스 탭 열기',
  clearLabel: (name: string): string => `${name} 단축키 지우기`,
  clearFailed: '단축키를 지우지 못했어요. 다시 해 주세요'
} as const

/** 워크스페이스 단축키 구역: 단축키가 있는 워크스페이스(받은 순서 그대로, 워크스페이스 탭과 같은 최근 순서)와 단축키가 없는 워크스페이스 수 */
export function workspaceHotkeyRows(items: readonly WorkspaceView[]): { rows: WorkspaceView[]; without: number } {
  const rows = items.filter((v) => v.workspace.hotkey)
  return { rows, without: items.length - rows.length }
}

/** 바꾸기·정하기 단추 이름: 조합과 등록 상태는 단추 밖 글자라 이름에 함께 읽힌다(name은 '팔레트 열기', '‘QA 모드’') */
export function changeLabel(name: string, acc: string | null, registered: boolean): string {
  if (!acc) return `${name} 단축키 ${HOTKEYS_COPY.set}, 지금 ${HOTKEYS_COPY.none}`
  return `${name} 단축키 ${HOTKEYS_COPY.change}, 지금 ${acc}${registered ? '' : `, ${HOTKEYS_COPY.notRegistered}`}`
}

/**
 * 바꾼 뒤 그 줄에 보일 결과: 팔레트·용어 찾기는 바꾼 조합, 조종·워크스페이스는 그 탭과 같은 말. 경고(다른 앱 기능을 가로챔 등)가
 * 있으면 함께 주황으로
 */
export function doneNotice(id: SettingsHotkeyId, r: { acc: string; warning?: string }): Notice {
  const text =
    id === 'pet-control'
      ? `이제 ${withObjectParticle(r.acc)} 누르면 조종해요`
      : id.startsWith('workspace:')
        ? `이제 ${withObjectParticle(r.acc)} 누르면 불러와요`
        : `${r.acc}${repickParticle(r.acc, '로')?.particle ?? '로'} 바꿨어요`
  return r.warning ? { tone: 'warn', text: `${text} · ${r.warning}` } : { tone: 'ok', text }
}

/** 워크스페이스 단축키를 지운 뒤 결과. 그 줄은 목록에서 빠지므로 워크스페이스 이름으로 알린다 */
export const clearedNotice = (workspaceName: string): Notice => ({ tone: 'ok', text: `‘${workspaceName}’ 단축키를 지웠어요` })
