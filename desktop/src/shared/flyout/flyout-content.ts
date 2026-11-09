import type { GlossaryEntry } from '../glossary/types'
import type { BarShape } from '../bar/bar-settings'
import type { MaskingMode } from '../types'

/** 위키 카드에 그리는 용어 한 건(링크·태그 등 카드에 쓰지 않는 값은 뺀다) */
export interface WikiCardEntry {
  id: string
  term: string
  aliases: string[]
  definition: string
  example?: string
  source: GlossaryEntry['source']
}

export type WikiCardView =
  | { kind: 'best'; source: 'selection' | 'clipboard'; best: WikiCardEntry; others: WikiCardEntry[] }
  | { kind: 'found'; source: 'selection' | 'clipboard'; entries: WikiCardEntry[]; more: number }
  | { kind: 'none'; source: 'selection' | 'clipboard'; query: string }
  | { kind: 'note'; message: string; canUseClipboard: boolean }

export type FlyoutContent =
  | { kind: 'label'; text: string }
  | { kind: 'masking-menu'; mode: MaskingMode }
  | { kind: 'workspace-menu'; workspaces: { id: string; name: string }[]; canSave: boolean }
  | { kind: 'bar-menu'; shape: BarShape }
  /** maxHeight: 카드가 넘지 않을 높이(560, 작업 영역이 낮으면 그 안). 넘치는 설명은 카드 안에서 스크롤한다 */
  | { kind: 'wiki-card'; view: WikiCardView; pinned: boolean; width: number; maxHeight: number }

export type MenuContent = Extract<FlyoutContent, { kind: 'masking-menu' | 'workspace-menu' | 'bar-menu' }>

/** 투명 창 안에서 그림자가 잘리지 않게 두는 여백(바 반대쪽 세 면) */
export type FlyoutPad = { top: number; right: number; bottom: number; left: number }

/**
 * main → 펼침 창 메시지. seq가 새로우면 새 내용이다.
 * 지금 seq와 같은 seq가 다시 오면 창을 작업 영역 안으로 맞추느라 면별 그림자 여백(pad)이 바뀐 것이다.
 * 그래서 화면은 pad가 달라질 때마다 seq와 상관없이 pad를 적용하고, 내용 갱신만 seq로 거른다
 * (renderer/src/flyout/flyout-state.ts, 시험 flyout-state.test.ts).
 */
export interface FlyoutMessage {
  seq: number
  content: FlyoutContent
  pad: FlyoutPad
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
  | { type: 'close' }
