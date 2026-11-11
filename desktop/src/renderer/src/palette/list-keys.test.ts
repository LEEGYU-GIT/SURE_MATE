import { describe, expect, it, vi } from 'vitest'
import type { PaletteItem } from '../../../shared/types'
import type { KeyInfo } from './confirm-state'
import { WIKI_ADD_ID, WORKSPACE_SAVE_AS_ID } from './filter-items'
import { laggingEnterAction, listKeyAction } from './list-keys'

type ListKey = KeyInfo & { caretAtEnd: boolean }
const enter = (o: Partial<ListKey> = {}): ListKey => ({
  code: 'Enter',
  key: 'Enter',
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  isComposing: false,
  repeat: false,
  caretAtEnd: true,
  ...o
})
const right = (o: Partial<ListKey> = {}): ListKey => enter({ code: 'ArrowRight', key: 'ArrowRight', ...o })
const prompt: Pick<PaletteItem, 'id' | 'group'> = { id: 'prompt:weekly-report', group: 'prompt' }
const workspace: Pick<PaletteItem, 'id' | 'group'> = { id: 'workspace:ws-report', group: 'workspace' }

it("Shift+Enter는 기억하기 안내가 있을 때만 'remember'(한글 모드의 key 'Process'여도 code로)", () => {
  expect(listKeyAction(enter({ shiftKey: true }), workspace, { remember: true })).toBe('remember')
  expect(listKeyAction(enter({ shiftKey: true, code: 'NumpadEnter' }), workspace, { remember: true })).toBe('remember')
  expect(listKeyAction(enter({ shiftKey: true, key: 'Process' }), prompt, { remember: true })).toBe('remember')
  // 안내가 없으면 cmdk 기본 Enter(그냥 실행)에 맡긴다
  expect(listKeyAction(enter({ shiftKey: true }), workspace, { remember: false })).toBeNull()
  expect(listKeyAction(enter({ shiftKey: true }), workspace)).toBeNull()
  expect(listKeyAction(enter({ shiftKey: true }), null, { remember: true })).toBeNull()
})

it('그냥 Enter와 다른 보조키 조합은 기억하지 않는다', () => {
  expect(listKeyAction(enter(), prompt, { remember: true })).toBeNull()
  expect(listKeyAction(enter({ shiftKey: true, ctrlKey: true }), prompt, { remember: true })).toBeNull()
  expect(listKeyAction(enter({ shiftKey: true, altKey: true }), prompt, { remember: true })).toBeNull()
  expect(listKeyAction(enter({ ctrlKey: true }), prompt, { remember: true })).toBeNull()
})

it('한글 조합 중이거나 누르고 있어 자동 반복된 키로는 아무것도 하지 않는다', () => {
  expect(listKeyAction(enter({ shiftKey: true, isComposing: true }), workspace, { remember: true })).toBeNull()
  expect(listKeyAction(enter({ shiftKey: true, repeat: true }), workspace, { remember: true })).toBeNull()
  expect(listKeyAction(enter({ ctrlKey: true, isComposing: true }), workspace)).toBeNull()
  expect(listKeyAction(enter({ ctrlKey: true, repeat: true }), workspace)).toBeNull()
  expect(listKeyAction(right({ isComposing: true }), workspace)).toBeNull()
  expect(listKeyAction(right({ repeat: true }), workspace)).toBeNull()
})

it("워크스페이스 행의 보조 동작(설정 창에서 편집): Ctrl+Enter는 어디서나, →는 @ 범위에서 커서가 끝일 때 'secondary'", () => {
  const scoped = { remember: false, workspaceScope: true }
  expect(listKeyAction(enter({ ctrlKey: true }), workspace)).toBe('secondary')
  expect(listKeyAction(enter({ ctrlKey: true, code: 'NumpadEnter' }), workspace)).toBe('secondary')
  expect(listKeyAction(enter({ ctrlKey: true }), workspace, { remember: true })).toBe('secondary')
  expect(listKeyAction(enter({ ctrlKey: true }), workspace, scoped)).toBe('secondary')
  expect(listKeyAction(right(), workspace, scoped)).toBe('secondary')
  // 커서가 끝이 아니면 →는 입력칸의 커서 이동
  expect(listKeyAction(right({ caretAtEnd: false }), workspace, scoped)).toBeNull()
  expect(listKeyAction(right({ shiftKey: true }), workspace, scoped)).toBeNull()
  expect(listKeyAction(enter({ ctrlKey: true, altKey: true }), workspace)).toBeNull()
  // 워크스페이스가 아닌 행, 저장 명령과 '@이름' 저장 줄(같은 구역이지만 저장한 배치가 아님)
  expect(listKeyAction(enter({ ctrlKey: true }), prompt)).toBeNull()
  expect(listKeyAction(right(), prompt)).toBeNull()
  expect(listKeyAction(enter({ ctrlKey: true }), { id: 'cmd.workspace-save', group: 'workspace' })).toBeNull()
  expect(listKeyAction(enter({ ctrlKey: true }), { id: 'workspace-save-as', group: 'workspace' })).toBeNull()
  expect(listKeyAction(enter({ ctrlKey: true }), null)).toBeNull()
})

it('→는 @ 범위에서만: 말하듯 입력의 맨 위가 워크스페이스여도 →로 팔레트를 닫고 설정 창을 열지 않는다', () => {
  // '보고서 모드로 바꿔줘'처럼 접두어 없이 친 글의 끝에서 →는 그냥 커서 키(입력칸이 처리)
  expect(listKeyAction(right(), workspace)).toBeNull()
  expect(listKeyAction(right(), workspace, { remember: false, workspaceScope: false })).toBeNull()
  expect(listKeyAction(right(), workspace, { remember: true, workspaceScope: false })).toBeNull()
  // Ctrl+Enter는 범위와 상관없이 보조 동작
  expect(listKeyAction(enter({ ctrlKey: true }), workspace, { remember: false, workspaceScope: false })).toBe('secondary')
  // @ 범위여도 워크스페이스 행이 아니면 아무것도 하지 않는다
  expect(listKeyAction(right(), prompt, { remember: false, workspaceScope: true })).toBeNull()
})

it('목록 이동·다른 키는 cmdk와 입력칸에 맡긴다', () => {
  for (const code of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'Tab', 'Space', 'KeyA', 'Escape']) {
    expect(listKeyAction(enter({ code, key: code, shiftKey: true }), workspace, { remember: true }), code).toBeNull()
  }
})

describe('목록이 검색어를 못 따라온 동안의 Enter: 지금 검색어의 맨 위 줄에 같은 보조키로 판단한다', () => {
  const top = (item: Pick<PaletteItem, 'id' | 'group'> | null) => (): Pick<PaletteItem, 'id' | 'group'> | null => item

  it('그냥 Enter는 맨 위 줄을 실행한다(워크스페이스면 불러오기, 직접 추가하기·이름으로 저장 줄 포함)', () => {
    expect(laggingEnterAction(enter(), top(prompt))).toEqual({ type: 'run', id: 'prompt:weekly-report' })
    expect(laggingEnterAction(enter({ code: 'NumpadEnter' }), top(workspace))).toEqual({ type: 'run', id: 'workspace:ws-report' })
    expect(laggingEnterAction(enter({ key: 'Process' }), top({ id: WIKI_ADD_ID, group: 'wiki' }))).toEqual({ type: 'run', id: WIKI_ADD_ID })
    expect(laggingEnterAction(enter(), top({ id: WORKSPACE_SAVE_AS_ID, group: 'workspace' }), { workspaceScope: true })).toEqual({
      type: 'run',
      id: WORKSPACE_SAVE_AS_ID
    })
  })

  it('맨 위 줄이 저장한 워크스페이스면 Ctrl+Enter는 편집(보조 동작)이고 불러오지 않는다', () => {
    expect(laggingEnterAction(enter({ ctrlKey: true }), top(workspace))).toEqual({ type: 'secondary', id: 'workspace:ws-report' })
    expect(laggingEnterAction(enter({ ctrlKey: true, code: 'NumpadEnter' }), top(workspace), { workspaceScope: true })).toEqual({
      type: 'secondary',
      id: 'workspace:ws-report'
    })
  })

  it('보조키를 누른 Enter인데 맨 위 줄에 맞는 동작이 없으면 실행하지 않고 삼킨다', () => {
    // 워크스페이스가 아닌 줄에서 Ctrl+Enter, 저장 명령·이름으로 저장 줄에서 Ctrl+Enter
    expect(laggingEnterAction(enter({ ctrlKey: true }), top(prompt))).toEqual({ type: 'none' })
    expect(laggingEnterAction(enter({ ctrlKey: true }), top({ id: 'cmd.workspace-save', group: 'workspace' }))).toEqual({ type: 'none' })
    expect(laggingEnterAction(enter({ ctrlKey: true }), top({ id: WIKI_ADD_ID, group: 'wiki' }))).toEqual({ type: 'none' })
    // 지난 목록의 기억하기 안내는 지금 검색어의 것이 아니므로 Shift+Enter로 기억하지도 실행하지도 않는다
    expect(laggingEnterAction(enter({ shiftKey: true }), top(prompt))).toEqual({ type: 'none' })
    expect(laggingEnterAction(enter({ shiftKey: true }), top(workspace))).toEqual({ type: 'none' })
    expect(laggingEnterAction(enter({ altKey: true }), top(prompt))).toEqual({ type: 'none' })
    expect(laggingEnterAction(enter({ ctrlKey: true, altKey: true }), top(workspace))).toEqual({ type: 'none' })
  })

  it('맨 위 줄이 없거나 자동 반복된 Enter는 삼킨다', () => {
    expect(laggingEnterAction(enter(), top(null))).toEqual({ type: 'none' })
    expect(laggingEnterAction(enter({ repeat: true }), top(prompt))).toEqual({ type: 'none' })
  })

  it('Enter가 아니거나 한글 조합 중이면 처리하지 않고(null) 맨 위 줄도 만들지 않는다', () => {
    const topRow = vi.fn(top(workspace))
    for (const code of ['ArrowDown', 'ArrowUp', 'ArrowRight', 'Tab', 'Escape']) {
      expect(laggingEnterAction(enter({ code, key: code, ctrlKey: true }), topRow, { workspaceScope: true }), code).toBeNull()
    }
    expect(laggingEnterAction(enter({ isComposing: true }), topRow)).toBeNull()
    expect(laggingEnterAction(enter({ ctrlKey: true, isComposing: true }), topRow)).toBeNull()
    expect(topRow).not.toHaveBeenCalled()
  })
})
