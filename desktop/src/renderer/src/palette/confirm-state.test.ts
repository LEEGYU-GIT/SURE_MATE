import { expect, it } from 'vitest'
import type { PromptDraft } from '../../../shared/ipc-channels'
import { confirmReducer, initialConfirmState, keyToAction, selectionNote, type ConfirmState, type KeyInfo } from './confirm-state'

const draft = (over: Partial<PromptDraft> = {}): PromptDraft => ({
  templateId: 'meeting-notes',
  name: '회의록 정리',
  selection: { length: 10 },
  clipboardLength: 5,
  defaultSource: 'selection',
  targets: [
    { id: 'claude', name: 'Claude' },
    { id: 'chatgpt', name: 'ChatGPT' },
    { id: 'gemini', name: 'Gemini' },
    { id: 'copy', name: '복사만' }
  ],
  target: 'claude',
  ...over
})

const key = (code: string, o: Partial<KeyInfo> = {}): KeyInfo => ({
  code,
  key: code,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  isComposing: false,
  ...o
})

it('선택 글이 없으면 출처를 바꿀 때 선택 글을 건너뛰고, 직접 입력으로 바꾸면 초점이 입력칸으로', () => {
  let s = initialConfirmState(draft({ selection: { length: 0, skipped: 'nothing-selected' }, defaultSource: 'clipboard' }))
  expect(s.sources).toEqual(['clipboard', 'input'])
  expect(s.focus).toBe('source')
  s = confirmReducer(s, { type: 'next-value' })
  expect(s.source).toBe('input')
  expect(s.focus).toBe('input')
})

it('대상은 끝에서 처음으로, 처음에서 끝으로 돌아간다', () => {
  let s: ConfirmState = { ...initialConfirmState(draft({ target: 'copy' })), focus: 'target' }
  s = confirmReducer(s, { type: 'next-value' })
  expect(s.target).toBe('claude')
  s = confirmReducer(s, { type: 'prev-value' })
  expect(s.target).toBe('copy')
})

it('직접 입력으로 시작하면 초점은 입력칸, 거기서 Enter는 줄바꿈이고 Ctrl+Enter가 실행', () => {
  const s = initialConfirmState(draft({ defaultSource: 'input', selection: { length: 0, skipped: 'terminal' }, clipboardLength: 0 }))
  expect(s.focus).toBe('input')
  expect(keyToAction(key('Enter'), s)).toBeNull()
  expect(keyToAction(key('Enter', { ctrlKey: true }), s)).toEqual({ type: 'run' })
})

it('칩에 초점이 있으면 Enter로 실행, Esc는 목록으로', () => {
  const s = initialConfirmState(draft())
  expect(keyToAction(key('Enter'), s)).toEqual({ type: 'run' })
  expect(keyToAction(key('NumpadEnter'), s)).toEqual({ type: 'run' })
  expect(keyToAction(key('Escape'), s)).toEqual({ type: 'back' })
  expect(keyToAction({ ...key(''), key: 'Escape' }, s)).toEqual({ type: 'back' })
})

it('한글 조합 중에는 Enter·Ctrl+Enter·Tab·화살표를 모두 무시한다', () => {
  const s = initialConfirmState(draft())
  for (const k of [
    key('Enter', { isComposing: true }),
    key('Enter', { ctrlKey: true, isComposing: true }),
    key('Tab', { isComposing: true }),
    key('ArrowRight', { isComposing: true })
  ]) {
    expect(keyToAction(k, s), k.code).toBeNull()
  }
})

it('Tab은 출처 → 대상 → (직접 입력이면 입력칸) 순서로 돌고 Shift+Tab은 거꾸로', () => {
  let s = initialConfirmState(draft())
  s = confirmReducer(s, keyToAction(key('Tab'), s)!)
  expect(s.focus).toBe('target')
  s = confirmReducer(s, keyToAction(key('Tab'), s)!)
  expect(s.focus).toBe('source')
  s = confirmReducer(s, keyToAction(key('Tab', { shiftKey: true }), s)!)
  expect(s.focus).toBe('target')

  let withInput: ConfirmState = { ...initialConfirmState(draft()), source: 'input', focus: 'target' }
  withInput = confirmReducer(withInput, { type: 'focus-next' })
  expect(withInput.focus).toBe('input')
})

it('화살표는 칩 값을 바꾸고, 입력칸에서는 커서 이동이라 무시한다', () => {
  const s = initialConfirmState(draft())
  expect(keyToAction(key('ArrowRight'), s)).toEqual({ type: 'next-value' })
  expect(keyToAction(key('ArrowLeft'), s)).toEqual({ type: 'prev-value' })
  expect(keyToAction(key('ArrowRight'), { ...s, source: 'input', focus: 'input' })).toBeNull()
})

it('선택 글을 못 가져온 이유를 짧게 알려 준다', () => {
  expect(selectionNote(draft())).toBeNull()
  expect(selectionNote(draft({ selection: { length: 0, skipped: 'terminal' } }))).toBe('터미널에서는 가져오지 않아요')
  expect(selectionNote(draft({ selection: { length: 0, skipped: 'nothing-selected' } }))).toBe('선택한 글이 없어요')
})
