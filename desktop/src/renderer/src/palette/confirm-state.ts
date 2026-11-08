import type { PromptDraft, PromptSource } from '../../../shared/ipc-channels'

export type ConfirmFocus = 'source' | 'target' | 'input'

export interface ConfirmState {
  source: PromptSource
  target: string
  input: string
  focus: ConfirmFocus
  /** 고를 수 있는 출처(선택 글·클립보드가 비었으면 빠짐, 직접 입력은 늘 있음) */
  sources: PromptSource[]
  targets: string[]
}

export type ConfirmAction =
  | { type: 'focus-next' }
  | { type: 'focus-prev' }
  | { type: 'next-value' }
  | { type: 'prev-value' }
  | { type: 'set-source'; source: PromptSource }
  | { type: 'set-target'; target: string }
  | { type: 'set-input'; input: string }
  | { type: 'focus'; focus: ConfirmFocus }
  | { type: 'run' }
  | { type: 'back' }

/** 키 판단에 필요한 값만(KeyboardEvent에서 뽑는다) */
export interface KeyInfo {
  code: string
  key: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  /** isImeComposing(e.nativeEvent) 결과 */
  isComposing: boolean
}

export function initialConfirmState(draft: PromptDraft): ConfirmState {
  const sources: PromptSource[] = [
    ...(draft.selection.length > 0 ? (['selection'] as const) : []),
    ...(draft.clipboardLength > 0 ? (['clipboard'] as const) : []),
    'input'
  ]
  const source = sources.includes(draft.defaultSource) ? draft.defaultSource : sources[0]
  return {
    source,
    target: draft.target,
    input: '',
    focus: source === 'input' ? 'input' : 'source',
    sources,
    targets: draft.targets.map((t) => t.id)
  }
}

const focusOrder = (s: ConfirmState): ConfirmFocus[] => (s.source === 'input' ? ['source', 'target', 'input'] : ['source', 'target'])

const step = <T,>(list: T[], current: T, delta: number): T => {
  const i = list.indexOf(current)
  return list[(((i < 0 ? 0 : i) + delta) % list.length + list.length) % list.length]
}

function changeSource(s: ConfirmState, source: PromptSource): ConfirmState {
  return { ...s, source, focus: source === 'input' ? 'input' : s.focus === 'input' ? 'source' : s.focus }
}

export function confirmReducer(s: ConfirmState, a: ConfirmAction): ConfirmState {
  switch (a.type) {
    case 'focus-next':
      return { ...s, focus: step(focusOrder(s), s.focus, 1) }
    case 'focus-prev':
      return { ...s, focus: step(focusOrder(s), s.focus, -1) }
    case 'next-value':
    case 'prev-value': {
      const delta = a.type === 'next-value' ? 1 : -1
      if (s.focus === 'source') return changeSource(s, step(s.sources, s.source, delta))
      if (s.focus === 'target') return { ...s, target: step(s.targets, s.target, delta) }
      return s
    }
    case 'set-source':
      return s.sources.includes(a.source) ? changeSource(s, a.source) : s
    case 'set-target':
      return s.targets.includes(a.target) ? { ...s, target: a.target } : s
    case 'set-input':
      return { ...s, input: a.input }
    case 'focus':
      return focusOrder(s).includes(a.focus) ? { ...s, focus: a.focus } : s
    default:
      return s
  }
}

const isEnter = (k: KeyInfo): boolean => k.code === 'Enter' || k.code === 'NumpadEnter' || (!k.code && k.key === 'Enter')

/**
 * 확인 화면의 키를 동작으로 바꾼다. 한글 조합 중이면 아무것도 하지 않는다(설계 문서 §6).
 * 입력칸에서는 Enter가 줄바꿈, 화살표가 커서 이동이라 넘기고 Ctrl+Enter로 실행한다.
 */
export function keyToAction(k: KeyInfo, s: ConfirmState): ConfirmAction | null {
  if (k.isComposing) return null
  if (k.code === 'Escape' || k.key === 'Escape') return { type: 'back' }
  if (isEnter(k)) return k.ctrlKey || s.focus !== 'input' ? { type: 'run' } : null
  if (k.code === 'Tab') return { type: k.shiftKey ? 'focus-prev' : 'focus-next' }
  if (s.focus === 'input') return null
  if (k.code === 'ArrowRight' || k.code === 'ArrowDown') return { type: 'next-value' }
  if (k.code === 'ArrowLeft' || k.code === 'ArrowUp') return { type: 'prev-value' }
  return null
}

const SELECTION_NOTES: Record<NonNullable<PromptDraft['selection']['skipped']>, string> = {
  terminal: '터미널에서는 가져오지 않아요',
  elevated: '관리자 권한 창이라 가져오지 못했어요',
  'no-foreground': '가져올 창이 없어요',
  'modifiers-held': '단축키를 누른 채라 가져오지 않았어요',
  busy: '다른 가져오기가 진행 중이었어요',
  'native-unavailable': '보안 프로그램이 막아 가져오지 못했어요',
  'nothing-selected': '선택한 글이 없어요'
}

/** 선택 글을 못 가져온 이유. 가져왔으면 null */
export const selectionNote = (draft: PromptDraft): string | null =>
  draft.selection.skipped ? SELECTION_NOTES[draft.selection.skipped] : null
