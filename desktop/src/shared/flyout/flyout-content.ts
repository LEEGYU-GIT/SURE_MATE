import type { GlossaryEntry } from '../glossary/types'
import type { BarEdge, BarShape } from '../bar/bar-settings'
import type { CaptureSkipReason, MaskingMode } from '../types'

/**
 * 펼침 창 내용(카드)의 최대 높이(DIP). main은 창을 이보다 크게 놓지 않고(flyout-placement.ts),
 * 위키 카드는 이 높이를 넘는 설명을 카드 안에서 스크롤한다(renderer/src/flyout/WikiCard.tsx).
 */
export const FLYOUT_MAX_HEIGHT = 560

/** 위키 카드에 그리는 용어 한 건(링크·태그 등 카드에 쓰지 않는 값은 뺀다) */
export interface WikiCardEntry {
  id: string
  term: string
  aliases: string[]
  definition: string
  example?: string
  source: GlossaryEntry['source']
}

/**
 * 안내 카드(note)의 까닭: 선택한 글을 가져오지 못한 까닭, 선택한 글이 없음, 또는 [클립보드 글로 찾기]를 눌렀는데
 * 클립보드가 비었음(clipboard-empty). 카드는 까닭과 클립보드 글이 있는지로 다음 할 일을 고른다
 */
export type WikiNoteReason = CaptureSkipReason | 'nothing-selected' | 'clipboard-empty'

export type WikiCardView =
  | { kind: 'best'; source: 'selection' | 'clipboard'; best: WikiCardEntry; others: WikiCardEntry[] }
  | { kind: 'found'; source: 'selection' | 'clipboard'; entries: WikiCardEntry[]; more: number }
  | { kind: 'none'; source: 'selection' | 'clipboard'; query: string }
  | { kind: 'note'; reason: WikiNoteReason; message: string; canUseClipboard: boolean }

export type FlyoutContent =
  | { kind: 'label'; text: string }
  | { kind: 'masking-menu'; mode: MaskingMode }
  /**
   * 워크스페이스 메뉴: 최근에 바꾼 순서의 앞 8개(workspaces), 나머지 수(more), Win32를 쓸 수 있는지(canSave).
   * otherConfig: 지금 모니터 구성에서 저장한 배치가 없음(불러오면 먼저 묻는다). windows는 켜진 창 수
   */
  | { kind: 'workspace-menu'; workspaces: { id: string; name: string; windows: number; otherConfig: boolean }[]; canSave: boolean; more: number }
  | { kind: 'bar-menu'; shape: BarShape }
  /**
   * cardId: 조회마다 main(showCard)이 새로 매기는 카드 번호. 고정(pin)만 바뀐 새 내용은 같은 번호라
   * 화면이 카드 상태(고른 후보·연 상세)를 그대로 두고, 번호가 다르면 내용이 같아도 새 카드로 띄운다
   */
  | { kind: 'wiki-card'; view: WikiCardView; pinned: boolean; width: number; cardId: number }

export type MenuContent = Extract<FlyoutContent, { kind: 'masking-menu' | 'workspace-menu' | 'bar-menu' }>

/** 투명 창 안에서 그림자가 잘리지 않게 두는 여백(바 반대쪽 세 면) */
export type FlyoutPad = { top: number; right: number; bottom: number; left: number }

/**
 * main → 펼침 창 메시지. seq가 새로우면 새 내용이다.
 * 지금 seq와 같은 seq가 다시 오면 창을 놓으면서 면별 그림자 여백(pad)이나 바 쪽(edge)이 바뀐 것이다
 * (작업 영역 안으로 맞추느라 여백이 줄었거나, 띄우기 전에 바가 반대쪽으로 옮겨졌다).
 * 그래서 화면은 pad·edge가 달라질 때마다 seq와 상관없이 적용하고, 내용 갱신만 seq로 거른다
 * (renderer/src/flyout/flyout-state.ts, 시험 flyout-state.test.ts).
 */
export interface FlyoutMessage {
  seq: number
  content: FlyoutContent
  pad: FlyoutPad
  /**
   * 바가 있는 쪽(바가 없으면 카드를 띄운 화면 가장자리). 화면은 그림자를 들이는 면과 들어오는 방향을 이것으로 정한다.
   * 여백에서 짐작하지 않는 이유: 작업 영역에 맞추느라 여백이 모두 0이 되면 반대쪽으로 짐작한다.
   */
  edge: BarEdge
}

export type FlyoutAction =
  | { type: 'set-masking'; mode: MaskingMode }
  | { type: 'set-bar-shape'; shape: BarShape }
  | { type: 'snooze-bar' }
  | { type: 'open-settings' }
  | { type: 'wiki-copy'; id: string }
  | { type: 'wiki-pin'; pinned: boolean }
  | { type: 'wiki-open'; id: string }
  | { type: 'wiki-search'; query: string }
  | { type: 'wiki-clipboard' }
  | { type: 'workspace-run'; id: string }
  | { type: 'workspace-save' }
  | { type: 'workspace-edit' }
  | { type: 'close' }
