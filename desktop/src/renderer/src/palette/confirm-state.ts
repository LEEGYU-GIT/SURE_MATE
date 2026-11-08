import type { PromptDraft, PromptSource } from '../../../shared/ipc-channels'
import { MASK_CATEGORY_LABELS } from '../../../shared/labels'
import { ALL_CATEGORIES, type MaskItem } from '../../../shared/masking/types'
import type { MaskingMode } from '../../../shared/types'

export type ConfirmFocus = 'source' | 'masking' | 'items' | 'target' | 'input'

/** Alt+M·←/→로 도는 가명 처리 모드 순서(끔 → 되돌리기 → 빼기) */
export const MASKING_MODES: MaskingMode[] = ['off', 'restore', 'remove']

export interface ConfirmState {
  source: PromptSource
  target: string
  input: string
  focus: ConfirmFocus
  /** 고를 수 있는 출처(선택 글·클립보드가 비었으면 빠짐, 직접 입력은 늘 있음) */
  sources: PromptSource[]
  targets: string[]
  /** 이번 실행의 가명 처리 모드 */
  masking: MaskingMode
  /** 이번 실행에서 끈 항목 키 */
  disabledKeys: string[]
  /** 지금 미리 보기에서 찾은 항목 키(항목 초점에서 고르는 차례) */
  itemKeys: string[]
  /** 항목 초점에서 고른 항목 자리 */
  itemIndex: number
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
  | { type: 'cycle-masking' }
  | { type: 'set-masking'; mode: MaskingMode }
  | { type: 'set-items'; keys: string[] }
  /** key가 없으면 항목 초점에서 고른 항목 */
  | { type: 'toggle-item'; key?: string }
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
  /** 누르고 있어 자동 반복된 keydown(KeyboardEvent.repeat) */
  repeat: boolean
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
    targets: draft.targets.map((t) => t.id),
    masking: draft.masking,
    disabledKeys: [],
    itemKeys: [],
    itemIndex: 0
  }
}

/** Tab 순서: 출처 → 가명 처리 → (찾은 항목이 있고 끔이 아니면 항목) → 대상 → (직접 입력이면 입력칸) */
function focusOrder(s: ConfirmState): ConfirmFocus[] {
  const order: ConfirmFocus[] = ['source', 'masking']
  if (s.masking !== 'off' && s.itemKeys.length > 0) order.push('items')
  order.push('target')
  if (s.source === 'input') order.push('input')
  return order
}

/** 끔으로 바꾸거나 항목이 사라져 초점이 갈 수 없는 곳에 남으면 가명 처리 칩으로 옮긴다 */
const settleFocus = (s: ConfirmState): ConfirmState => (focusOrder(s).includes(s.focus) ? s : { ...s, focus: 'masking' })

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
      if (s.focus === 'masking') return settleFocus({ ...s, masking: step(MASKING_MODES, s.masking, delta) })
      if (s.focus === 'items' && s.itemKeys.length > 0) {
        const n = s.itemKeys.length
        return { ...s, itemIndex: (((s.itemIndex + delta) % n) + n) % n }
      }
      if (s.focus === 'target') return { ...s, target: step(s.targets, s.target, delta) }
      return s
    }
    case 'cycle-masking':
      return settleFocus({ ...s, masking: step(MASKING_MODES, s.masking, 1) })
    case 'set-masking':
      return settleFocus({ ...s, masking: a.mode })
    case 'set-items':
      return settleFocus({ ...s, itemKeys: a.keys, itemIndex: Math.min(s.itemIndex, Math.max(0, a.keys.length - 1)) })
    case 'toggle-item': {
      const key = a.key ?? s.itemKeys[s.itemIndex]
      if (!key) return s
      const at = s.itemKeys.indexOf(key)
      return {
        ...s,
        itemIndex: at >= 0 ? at : s.itemIndex,
        disabledKeys: s.disabledKeys.includes(key) ? s.disabledKeys.filter((k) => k !== key) : [...s.disabledKeys, key]
      }
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

const isEnter = (k: Pick<KeyInfo, 'code' | 'key'>): boolean => k.code === 'Enter' || k.code === 'NumpadEnter' || (!k.code && k.key === 'Enter')

/** 누르고 있어 자동 반복된 Enter. 목록·확인 화면 모두 이것으로는 실행하지 않는다(프롬프트를 고른 Enter가 이어져 실행되지 않게) */
export const isRepeatedEnter = (k: Pick<KeyInfo, 'code' | 'key' | 'repeat'>): boolean => k.repeat && isEnter(k)

/**
 * 확인 화면의 키를 동작으로 바꾼다. 한글 조합 중이면 아무것도 하지 않는다(설계 문서 §6).
 * 입력칸에서는 Enter가 줄바꿈, 화살표가 커서 이동이라 넘기고 Ctrl+Enter로 실행한다.
 * Alt+M은 어디서든 가명 처리 모드를 바꾸고, 항목 초점에서 Space는 고른 항목을 끄고 켠다.
 */
export function keyToAction(k: KeyInfo, s: ConfirmState): ConfirmAction | null {
  if (k.isComposing) return null
  if (k.code === 'Escape' || k.key === 'Escape') return { type: 'back' }
  if (isEnter(k)) return !k.repeat && (k.ctrlKey || s.focus !== 'input') ? { type: 'run' } : null
  if (k.code === 'KeyM' && k.altKey && !k.ctrlKey) return { type: 'cycle-masking' }
  if (k.code === 'Tab') return { type: k.shiftKey ? 'focus-prev' : 'focus-next' }
  if (s.focus === 'input') return null
  if (k.code === 'Space' && s.focus === 'items') return { type: 'toggle-item' }
  if (k.code === 'ArrowRight' || k.code === 'ArrowDown') return { type: 'next-value' }
  if (k.code === 'ArrowLeft' || k.code === 'ArrowUp') return { type: 'prev-value' }
  return null
}

export type PreviewPart = { text: string; mark: boolean; masked: boolean }

const inside = (ranges: [number, number][], pos: number): boolean => ranges.some(([a, b]) => pos >= a && pos < b)

/**
 * 미리 보기 글을 조각으로 나눈다. mark는 넣은 글(형광펜), masked는 가린 표시(청록 글자).
 * 두 구간은 서로 겹칠 수 있다(넣은 글 안의 이름을 가린 경우).
 */
export function splitPreview(text: string, highlights: [number, number][], masks: [number, number][]): PreviewPart[] {
  const cuts = new Set<number>([0, text.length])
  for (const [a, b] of [...highlights, ...masks]) {
    if (a > 0 && a < text.length) cuts.add(a)
    if (b > 0 && b < text.length) cuts.add(b)
  }
  const points = [...cuts].sort((x, y) => x - y)
  const parts: PreviewPart[] = []
  for (let i = 0; i + 1 < points.length; i++) {
    const [from, to] = [points[i], points[i + 1]]
    const mark = inside(highlights, from)
    const masked = inside(masks, from)
    const last = parts[parts.length - 1]
    if (last && last.mark === mark && last.masked === masked) last.text += text.slice(from, to)
    else parts.push({ text: text.slice(from, to), mark, masked })
  }
  return parts
}

/** 찾은 항목을 분류별 개수로 줄인다("고객사 2 · IP 1 · 경로 3"). 없으면 null */
export function maskingSummary(items: MaskItem[]): string | null {
  const parts = ALL_CATEGORIES.map((c) => ({ c, n: items.filter((i) => i.category === c).length }))
    .filter((p) => p.n > 0)
    .map((p) => `${MASK_CATEGORY_LABELS[p.c]} ${p.n}`)
  return parts.length ? parts.join(' · ') : null
}

const SELECTION_NOTES: Record<NonNullable<PromptDraft['selection']['skipped']>, string> = {
  terminal: '터미널에서는 가져오지 않아요',
  elevated: '관리자 권한 창이라 가져오지 못했어요',
  'no-foreground': '가져올 창이 없어요',
  'modifiers-held': '단축키를 누른 채라 가져오지 않았어요',
  busy: '다른 가져오기가 진행 중이었어요',
  'native-unavailable': '보안 프로그램이 막아 가져오지 못했어요',
  'keys-held': '키를 누르고 있어 가져오지 않았어요',
  'focus-changed': '가져오는 동안 다른 창으로 바뀌어 멈췄어요',
  'nothing-selected': '선택한 글이 없어요'
}

/** 선택 글을 못 가져온 이유. 가져왔으면 null */
export const selectionNote = (draft: PromptDraft): string | null =>
  draft.selection.skipped ? SELECTION_NOTES[draft.selection.skipped] : null
