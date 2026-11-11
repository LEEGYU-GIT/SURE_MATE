import { expect, it } from 'vitest'
import type { PaletteItem } from '../../../shared/types'
import type { KeyInfo } from './confirm-state'
import { listKeyAction } from './list-keys'

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
