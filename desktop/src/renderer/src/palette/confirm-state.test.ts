import { describe, expect, it } from 'vitest'
import type { PromptDraft } from '../../../shared/ipc-channels'
import type { MaskItem } from '../../../shared/masking/types'
import {
  confirmReducer,
  initialConfirmState,
  isRepeatedEnter,
  keyToAction,
  maskingSummary,
  maskingTipVisible,
  selectionNote,
  splitPreview,
  type ConfirmState,
  type KeyInfo
} from './confirm-state'

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
  masking: 'restore',
  maskingTip: false,
  ...over
})

const key = (code: string, o: Partial<KeyInfo> = {}): KeyInfo => ({
  code,
  key: code,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  isComposing: false,
  repeat: false,
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

it('누르고 있어 자동 반복된 Enter·Ctrl+Enter로는 실행하지 않는다', () => {
  const chip = initialConfirmState(draft())
  expect(keyToAction(key('Enter', { repeat: true }), chip)).toBeNull()
  const input: ConfirmState = { ...chip, source: 'input', focus: 'input' }
  expect(keyToAction(key('Enter', { ctrlKey: true, repeat: true }), input)).toBeNull()
})

it('목록에서도 자동 반복된 Enter는 알아본다(프롬프트를 두 번 고르지 않게)', () => {
  expect(isRepeatedEnter(key('Enter', { repeat: true }))).toBe(true)
  expect(isRepeatedEnter(key('NumpadEnter', { repeat: true }))).toBe(true)
  expect(isRepeatedEnter(key('Enter'))).toBe(false)
  expect(isRepeatedEnter(key('ArrowDown', { repeat: true }))).toBe(false)
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

const tab = (s: ConfirmState, shiftKey = false): ConfirmState => confirmReducer(s, keyToAction(key('Tab', { shiftKey }), s)!)

it('Tab은 출처 → 가명 처리 → (찾은 항목이 있으면 항목) → 대상 → (직접 입력이면 입력칸) 순서로 돌고 Shift+Tab은 거꾸로', () => {
  let s = initialConfirmState(draft())
  s = tab(s)
  expect(s.focus).toBe('masking')
  s = tab(s)
  expect(s.focus).toBe('target')
  s = tab(s)
  expect(s.focus).toBe('source')
  s = tab(s, true)
  expect(s.focus).toBe('target')

  s = confirmReducer({ ...s, focus: 'masking' }, { type: 'set-items', keys: ['client:a'] })
  s = tab(s)
  expect(s.focus).toBe('items')
  s = tab(s)
  expect(s.focus).toBe('target')

  // 끔이면 항목을 건너뛴다
  const off = confirmReducer({ ...s, focus: 'masking' }, { type: 'set-masking', mode: 'off' })
  expect(tab(off).focus).toBe('target')

  const withInput: ConfirmState = { ...initialConfirmState(draft()), source: 'input', focus: 'target' }
  expect(tab(withInput).focus).toBe('input')
})

it('Alt+M은 가명 처리 모드를 끔 → 되돌리기 → 빼기 순서로 돌리고, 한글 조합 중이면 무시한다', () => {
  let s = initialConfirmState(draft({ masking: 'restore' }))
  expect(s.masking).toBe('restore')
  const altM = key('KeyM', { key: 'm', altKey: true })
  s = confirmReducer(s, keyToAction(altM, s)!)
  expect(s.masking).toBe('remove')
  s = confirmReducer(s, keyToAction(altM, s)!)
  expect(s.masking).toBe('off')
  s = confirmReducer(s, keyToAction(altM, s)!)
  expect(s.masking).toBe('restore')
  expect(keyToAction({ ...altM, isComposing: true }, s)).toBeNull()
  // 입력칸에서도 바꿀 수 있다
  expect(keyToAction(altM, { ...s, source: 'input', focus: 'input' })).toEqual({ type: 'cycle-masking' })
})

it('가명 처리 칩에 초점이 있으면 ←/→로 모드를 바꾼다', () => {
  const s: ConfirmState = { ...initialConfirmState(draft({ masking: 'off' })), focus: 'masking' }
  expect(confirmReducer(s, keyToAction(key('ArrowRight'), s)!).masking).toBe('restore')
  expect(confirmReducer(s, keyToAction(key('ArrowLeft'), s)!).masking).toBe('remove')
})

it('항목 초점에서 ←/→로 항목을 고르고 Space로 끄고 켠다', () => {
  let s: ConfirmState = { ...confirmReducer(initialConfirmState(draft()), { type: 'set-items', keys: ['client:a', 'ip:10.0.0.1'] }), focus: 'items' }
  const space = key('Space', { key: ' ' })
  s = confirmReducer(s, keyToAction(space, s)!)
  expect(s.disabledKeys).toEqual(['client:a'])
  s = confirmReducer(s, keyToAction(key('ArrowRight'), s)!)
  s = confirmReducer(s, keyToAction(space, s)!)
  expect(s.disabledKeys).toEqual(['client:a', 'ip:10.0.0.1'])
  s = confirmReducer(s, { type: 'toggle-item', key: 'client:a' })
  expect(s.disabledKeys).toEqual(['ip:10.0.0.1'])
  // 눌러서 끈 항목으로 고른 자리도 옮긴다
  expect(s.itemIndex).toBe(0)
  // 다른 칩에 초점이 있으면 Space는 아무 일도 하지 않는다
  expect(keyToAction(space, { ...s, focus: 'target' })).toBeNull()
})

it('항목에 초점이 있을 때 끔으로 바꾸거나 찾은 항목이 없어지면 초점이 가명 처리 칩으로 간다', () => {
  const s: ConfirmState = { ...confirmReducer(initialConfirmState(draft()), { type: 'set-items', keys: ['client:a', 'ip:1'] }), focus: 'items', itemIndex: 1 }
  expect(confirmReducer(s, { type: 'set-masking', mode: 'remove' }).focus).toBe('items')
  expect(confirmReducer(s, { type: 'set-masking', mode: 'off' }).focus).toBe('masking')
  expect(confirmReducer(s, { type: 'set-items', keys: [] }).focus).toBe('masking')
  // 항목이 줄면 고른 자리도 범위 안으로
  expect(confirmReducer(s, { type: 'set-items', keys: ['client:a'] }).itemIndex).toBe(0)
})

describe('가명 처리 첫 안내(2026-11-12): 아직 보지 않았고, 이번 모드가 끔이 아니고, 직접 입력이 아닐 때 보인다', () => {
  const tipDraft = (over: Partial<PromptDraft> = {}): PromptDraft =>
    draft({ maskingTip: true, ...over })

  it('이미 봤으면(draft.maskingTip false) 어떤 모드에서도 보이지 않는다', () => {
    for (const masking of ['off', 'restore', 'remove'] as const)
      expect(maskingTipVisible(initialConfirmState(draft({ masking })))).toBe(false)
  })

  it('바꾸고 되돌리기·바꾸기만이면 보이고, 끔이면 숨는다(끔에서 다시 켜면 다시 보인다)', () => {
    expect(maskingTipVisible(initialConfirmState(tipDraft({ masking: 'restore' })))).toBe(true)
    expect(maskingTipVisible(initialConfirmState(tipDraft({ masking: 'remove' })))).toBe(true)
    const off = initialConfirmState(tipDraft({ masking: 'off' }))
    expect(maskingTipVisible(off)).toBe(false)
    expect(maskingTipVisible(confirmReducer(off, { type: 'set-masking', mode: 'restore' }))).toBe(
      true
    )
  })

  it('직접 입력이면 숨는다(입력칸을 덮지 않게). 선택 글로 돌아오면 다시 보인다', () => {
    const input = initialConfirmState(
      tipDraft({
        selection: { length: 0, skipped: 'nothing-selected' },
        clipboardLength: 0,
        defaultSource: 'input'
      })
    )
    expect(input.source).toBe('input')
    expect(maskingTipVisible(input)).toBe(false)
    const s = initialConfirmState(tipDraft())
    const typed = confirmReducer(s, { type: 'set-source', source: 'input' })
    expect(maskingTipVisible(typed)).toBe(false)
    expect(
      maskingTipVisible(confirmReducer(typed, { type: 'set-source', source: 'selection' }))
    ).toBe(true)
  })

  it('[알겠어요](dismiss-tip)를 누르면 이 확인 화면에서는 모드를 바꿔도 다시 보이지 않는다', () => {
    let s = confirmReducer(initialConfirmState(tipDraft()), { type: 'dismiss-tip' })
    expect(maskingTipVisible(s)).toBe(false)
    s = confirmReducer(confirmReducer(s, { type: 'set-masking', mode: 'off' }), {
      type: 'set-masking',
      mode: 'remove'
    })
    expect(maskingTipVisible(s)).toBe(false)
  })

  it('안내가 보이는 동안 Tab은 출처 → 가명 처리 → 안내(안내가 덮은 항목·대상은 건너뛴다). 닫으면 원래 순서', () => {
    let s = confirmReducer(initialConfirmState(tipDraft()), {
      type: 'set-items',
      keys: ['ip:10.0.3.15']
    })
    s = tab(s)
    expect(s.focus).toBe('masking')
    s = tab(s)
    expect(s.focus).toBe('tip')
    s = tab(s)
    expect(s.focus).toBe('source')
    expect(tab(s, true).focus).toBe('tip')
    const closed = confirmReducer({ ...s, focus: 'masking' }, { type: 'dismiss-tip' })
    expect(tab(closed).focus).toBe('items')
  })

  it('안내에 초점이 있으면 Enter·Space는 안내를 닫고(복사하지 않는다) 초점은 가명 처리 칩으로 간다. 자동 반복 Enter는 무시', () => {
    const s: ConfirmState = { ...initialConfirmState(tipDraft()), focus: 'tip' }
    expect(keyToAction(key('Enter'), s)).toEqual({ type: 'dismiss-tip' })
    expect(keyToAction(key('NumpadEnter'), s)).toEqual({ type: 'dismiss-tip' })
    expect(keyToAction(key('Space', { key: ' ' }), s)).toEqual({ type: 'dismiss-tip' })
    expect(keyToAction(key('Enter', { repeat: true }), s)).toBeNull()
    expect(keyToAction(key('ArrowRight'), s)).toBeNull()
    expect(keyToAction(key('Escape'), s)).toEqual({ type: 'back' })
    const closed = confirmReducer(s, { type: 'dismiss-tip' })
    expect(closed.focus).toBe('masking')
  })

  it('안내가 보여도 다른 곳에 초점이 있으면 Enter는 그대로 실행(복사)이다', () => {
    const s = initialConfirmState(tipDraft())
    expect(s.focus).toBe('source')
    expect(keyToAction(key('Enter'), s)).toEqual({ type: 'run' })
    expect(keyToAction(key('Enter'), { ...s, focus: 'masking' })).toEqual({ type: 'run' })
  })

  it('안내에 초점이 있을 때 끔으로 바꾸거나(Alt+M) 직접 입력으로 바꿔 안내가 숨으면 초점이 갈 곳으로 옮긴다', () => {
    const s: ConfirmState = { ...initialConfirmState(tipDraft()), focus: 'tip' }
    expect(confirmReducer(s, { type: 'set-masking', mode: 'off' }).focus).toBe('masking')
    const altM = key('KeyM', { key: 'm', altKey: true })
    const cycled = confirmReducer(
      { ...s, masking: 'remove' },
      keyToAction(altM, { ...s, masking: 'remove' })!
    )
    expect(cycled.masking).toBe('off')
    expect(cycled.focus).toBe('masking')
    expect(confirmReducer(s, { type: 'set-source', source: 'input' }).focus).toBe('input')
    // 숨은 안내로는 초점을 옮길 수 없다
    expect(
      confirmReducer({ ...s, focus: 'masking', masking: 'off' }, { type: 'focus', focus: 'tip' })
        .focus
    ).toBe('masking')
  })
})

it('찾은 항목을 분류별 개수로 요약한다', () => {
  const item = (k: string, category: MaskItem['category']): MaskItem => ({ key: k, category, original: '원문', replacement: '표시', count: 3, enabled: true })
  expect(maskingSummary([item('client:a', 'client'), item('path:c', 'path'), item('client:b', 'client'), item('ip:1', 'ip')])).toBe('고객사 2 · IP 1 · 경로 1')
  expect(maskingSummary([])).toBeNull()
})

it('화살표는 칩 값을 바꾸고, 입력칸에서는 커서 이동이라 무시한다', () => {
  const s = initialConfirmState(draft())
  expect(keyToAction(key('ArrowRight'), s)).toEqual({ type: 'next-value' })
  expect(keyToAction(key('ArrowLeft'), s)).toEqual({ type: 'prev-value' })
  expect(keyToAction(key('ArrowRight'), { ...s, source: 'input', focus: 'input' })).toBeNull()
})

it('미리 보기 글을 형광펜(넣은 글) 구간과 나머지로 나눈다', () => {
  expect(splitPreview('앞 가나 중간 가나', [[2, 4], [8, 10]], [])).toEqual([
    { text: '앞 ', mark: false, masked: false },
    { text: '가나', mark: true, masked: false },
    { text: ' 중간 ', mark: false, masked: false },
    { text: '가나', mark: true, masked: false }
  ])
  expect(splitPreview('본문', [], [])).toEqual([{ text: '본문', mark: false, masked: false }])
  expect(splitPreview('abc', [[0, 3]], [])).toEqual([{ text: 'abc', mark: true, masked: false }])
})

it('가린 표시는 형광펜과 겹쳐도 따로 알려 준다', () => {
  expect(splitPreview('앞 CLIENT_A의 글 끝', [[2, 13]], [[2, 10]])).toEqual([
    { text: '앞 ', mark: false, masked: false },
    { text: 'CLIENT_A', mark: true, masked: true },
    { text: '의 글', mark: true, masked: false },
    { text: ' 끝', mark: false, masked: false }
  ])
  // 머리말 안의 표시처럼 넣은 글 밖에 있어도 칠한다
  expect(splitPreview('IP_1 본문', [[5, 7]], [[0, 4]])).toEqual([
    { text: 'IP_1', mark: false, masked: true },
    { text: ' ', mark: false, masked: false },
    { text: '본문', mark: true, masked: false }
  ])
})

it('선택 글을 못 가져온 이유를 짧게 알려 준다', () => {
  expect(selectionNote(draft())).toBeNull()
  expect(selectionNote(draft({ selection: { length: 0, skipped: 'terminal' } }))).toBe('터미널에서는 가져오지 않아요')
  expect(selectionNote(draft({ selection: { length: 0, skipped: 'nothing-selected' } }))).toBe('선택한 글이 없어요')
  expect(selectionNote(draft({ selection: { length: 0, skipped: 'keys-held' } }))).toBe('키를 누르고 있어 가져오지 않았어요')
  expect(selectionNote(draft({ selection: { length: 0, skipped: 'focus-changed' } }))).toBe('가져오는 동안 다른 창으로 바뀌어 멈췄어요')
})
