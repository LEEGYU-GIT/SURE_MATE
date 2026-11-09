import type { BarShape } from '../../../shared/bar/bar-settings'
import type { FlyoutAction } from '../../../shared/flyout/flyout-content'
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
  action: FlyoutAction
}

/** 메뉴 머리 문구 */
export const MENU_TITLES = {
  masking: '가명 처리 기본값',
  barShape: '바 모양',
  workspace: '워크스페이스'
} as const

/** 모드를 고르면 생기는 일(한 줄). 끔은 주의 문구라 색만으로 알리지 않는다(§14-4) */
const MASKING_DETAILS: Record<MaskingMode, string> = {
  off: '원문 그대로 복사돼요',
  restore: '답은 원래 이름으로 되돌릴 수 있어요',
  remove: "답에도 '고객사A' 같은 표시가 남아요"
}

/** 가명 처리 기본값 메뉴: 끔·가명 후 되돌리기·결과에서 빼기(확인 화면·Alt+M과 같은 순서) */
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
