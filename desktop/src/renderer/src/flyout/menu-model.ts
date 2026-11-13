import type { BarShape } from '../../../shared/bar/bar-settings'
import type { FlyoutAction, FlyoutContent } from '../../../shared/flyout/flyout-content'
import { barShapeLabel, LABEL_HINT_SEPARATOR, maskingModeLabel } from '../../../shared/labels'
import { MASKING_MODES } from '../../../shared/masking/modes'
import type { MaskingMode } from '../../../shared/types'

/** 펼침 메뉴의 한 행. tone 'warn'은 고르면 위험한 선택지(가명 처리 끔): 지금 값이면 색과 글로 함께 알린다 */
export interface MenuRow {
  key: string
  title: string
  detail?: string
  checked: boolean
  tone: 'normal' | 'warn'
  /** 지금은 고를 수 없는 행(글로 까닭을 적고, 눌러도 실행하지 않는다) */
  disabled?: boolean
  action: FlyoutAction
}

/** 메뉴 머리 문구 */
export const MENU_TITLES = {
  masking: '가명 처리 기본값',
  barShape: '바 모양',
  workspace: '워크스페이스'
} as const

/**
 * 모드를 고르면 생기는 일(바 메뉴의 한 줄, 18자 안팎: 넘으면 행이 두 줄이 된다). 끔은 주의 문구라 색만으로 알리지 않는다(§14-4).
 * 'AI 답' 같은 말 없이 무엇이 무엇으로 바뀌는지만 쓴다(2026-11-12 사용자 의견). 긴 설명은 MASKING_EXPLAIN
 */
export const MASKING_DETAILS: Record<MaskingMode, string> = {
  off: '원문 그대로 AI에 가요',
  restore: 'CLIENT_A로 바꿔 보내고 되돌려요',
  remove: '고객사A로 바꾼 채로 보내요'
}

/** 첫 실행 안내·설정 창의 긴 설명(예시와 함께 보인다). 예시 이름은 MASKING_EXAMPLE_TEXT와 같다 */
export const MASKING_EXPLAIN: Record<MaskingMode, string> = {
  off: '고객사·사람 이름·IP·경로가 원문 그대로 AI에 가요.',
  restore: "보내기 전에 가상자동차를 CLIENT_A처럼 다른 이름으로 바꿔요. AI가 쓴 글을 복사해 팔레트에서 '가명 되돌리기'를 하면 CLIENT_A가 다시 가상자동차로 돌아와요.",
  remove: '가상자동차를 고객사A처럼 바꿔 보내고 되돌리지 않아요. AI가 쓴 글에도 고객사A로 남아요.'
}

/** 가명 처리 기본값 메뉴: 끔·바꾸고 되돌리기·바꾸기만(확인 화면·Alt+M과 같은 순서) */
export function maskingMenuRows(mode: MaskingMode): MenuRow[] {
  return MASKING_MODES.map((m) => ({
    key: `masking:${m}`,
    title: maskingModeLabel(m),
    detail: MASKING_DETAILS[m],
    checked: m === mode,
    tone: m === 'off' ? 'warn' : 'normal',
    action: { type: 'set-masking', mode: m }
  }))
}

/** 바 메뉴(오른쪽 클릭): 모양 세 가지, 30분 동안 숨기기, 설정 열기 */
export function barMenuRows(shape: BarShape): MenuRow[] {
  const shapeRow = (s: BarShape, title: string, detail?: string): MenuRow => ({
    key: `shape:${s}`,
    title,
    ...(detail ? { detail } : {}),
    checked: s === shape,
    tone: 'normal',
    action: { type: 'set-bar-shape', shape: s }
  })
  return [
    shapeRow('edge', barShapeLabel('edge')),
    shapeRow('capsule', barShapeLabel('capsule')),
    // 바가 꺼지면 이 메뉴도 사라지므로 다시 켜는 곳을 함께 적는다
    shapeRow('off', '바 끄기', '트레이 아이콘이나 팔레트에서 다시 켜요'),
    { key: 'snooze', title: '30분 동안 숨기기', checked: false, tone: 'normal', action: { type: 'snooze-bar' } },
    { key: 'settings', title: '설정 열기', checked: false, tone: 'normal', action: { type: 'open-settings' } }
  ]
}

/** 고르는 행(라디오)인지: 지금 값이면 체크 표시, 아니면 빈칸. 나머지는 명령 행(아이콘) */
export const isChoiceRow = (row: MenuRow): boolean => row.action.type === 'set-masking' || row.action.type === 'set-bar-shape'

/** "Ctrl+Alt+Space"·"Alt+`"처럼 보조키 + 키 모양인 보조 글 */
const KEY_HINT = /^(?:(?:Ctrl|Alt|Shift|Win)\+)+\S+$/

/**
 * 이름표 글을 이름과 보조 글로 나눈다. 보조 글은 맨 뒤 구분(" · ") 다음이다(이름 안의 " · "는 이름에 남는다).
 * 구분이 없거나 한쪽이 비면 나누지 않는다.
 */
export function labelParts(text: string): { name: string; hint: string | null; hintIsKey: boolean } {
  const at = text.lastIndexOf(LABEL_HINT_SEPARATOR)
  const name = at > 0 ? text.slice(0, at) : ''
  const hint = at > 0 ? text.slice(at + LABEL_HINT_SEPARATOR.length) : ''
  if (name.trim() === '' || hint.trim() === '') return { name: text, hint: null, hintIsKey: false }
  return { name, hint, hintIsKey: KEY_HINT.test(hint) }
}

/** 워크스페이스 메뉴 문구 */
export const WORKSPACE_MENU_TEXT = {
  save: '지금 배치 저장',
  saveBlocked: '보안 프로그램이 창 제어를 막아 저장할 수 없어요',
  edit: '모두 보기·편집',
  editHint: '설정에서 이름과 단축키를 바꿔요',
  more: (n: number): string => `외 ${n}개 더 있어요`,
  windows: (n: number): string => `창 ${n}개`,
  otherConfig: '다른 모니터 구성',
  /** 화면 감추기(기본) 행의 한 줄 설명(18자 안: 넘으면 행이 두 줄이 된다) */
  hideAll: '열린 창을 모두 내려요',
  hideKeep: (n: number): string => `창 ${n}개만 남기고 내려요`,
  hideRestore: (n: number): string => `내렸던 창 ${n}개 되돌리기`
} as const

/** 워크스페이스 행의 설명: 다른 구성은 색(warn)만이 아니라 글로도 알린다(§14-4). 화면 감추기는 누르면 일어나는 일 */
function workspaceDetail(w: Extract<FlyoutContent, { kind: 'workspace-menu' }>['workspaces'][number]): string {
  const T = WORKSPACE_MENU_TEXT
  // 되돌릴 창이 있으면 누르면 되돌리기만 하므로 다른 모니터 구성보다 먼저 적는다(검토 M11)
  if (w.hide && w.restorable) return T.hideRestore(w.restorable)
  if (w.otherConfig) return `${T.windows(w.windows)} · ${T.otherConfig}`
  if (!w.hide) return T.windows(w.windows)
  return w.windows > 0 ? T.hideKeep(w.windows) : T.hideAll
}

/** 워크스페이스 메뉴(바의 워크스페이스 단추): 저장한 배치 불러오기(화면 감추기가 맨 앞) | 지금 배치 저장 | 모두 보기·편집 */
export function workspaceMenuRows(c: Extract<FlyoutContent, { kind: 'workspace-menu' }>): MenuRow[] {
  const T = WORKSPACE_MENU_TEXT
  const rows: MenuRow[] = c.workspaces.map((w) => ({
    key: `workspace:${w.id}`,
    title: w.name,
    detail: workspaceDetail(w),
    checked: false,
    tone: w.otherConfig && !(w.hide && w.restorable) ? 'warn' : 'normal',
    action: { type: 'workspace-run', id: w.id }
  }))
  rows.push({
    key: 'workspace-save',
    title: T.save,
    ...(c.canSave ? {} : { detail: T.saveBlocked, disabled: true }),
    checked: false,
    tone: 'normal',
    action: { type: 'workspace-save' }
  })
  rows.push({
    key: 'workspace-edit',
    title: T.edit,
    detail: c.more > 0 ? T.more(c.more) : T.editHint,
    checked: false,
    tone: 'normal',
    action: { type: 'workspace-edit' }
  })
  return rows
}
