import { describe, expect, it } from 'vitest'
import {
  defaultHideHotkey,
  HIDE_DEFAULT_HOTKEY,
  HIDE_WORKSPACE_ALIASES,
  HIDE_WORKSPACE_ID,
  HIDE_WORKSPACE_NAME,
  hideFirst,
  isHideWorkspace,
  withHideWorkspace
} from './builtin'
import { testWorkspace } from './test-workspaces'
import { WORKSPACE_LIMITS } from './types'
import { parseWorkspaceId } from './workspace-ipc'

const NOW = new Date('2026-11-12T09:00:00.000Z')

describe('기본 워크스페이스 화면 감추기(2026-11-12 사용자 결정)', () => {
  it('고정 id는 workspaces.json·IPC의 id 규칙을 지킨다', () => {
    expect(parseWorkspaceId(HIDE_WORKSPACE_ID)).toBe(HIDE_WORKSPACE_ID)
    expect(isHideWorkspace(HIDE_WORKSPACE_ID)).toBe(true)
    expect(isHideWorkspace('ws-qa')).toBe(false)
  })

  it('별칭은 감추기·숨기기·가리기를 포함하고 별칭 제한(10개, 하나에 40자) 안이다', () => {
    expect(HIDE_WORKSPACE_ALIASES).toEqual(expect.arrayContaining(['감추기', '숨기기', '가리기']))
    expect(HIDE_WORKSPACE_ALIASES.length).toBeLessThanOrEqual(WORKSPACE_LIMITS.aliases)
    for (const a of HIDE_WORKSPACE_ALIASES) expect(a.length).toBeLessThanOrEqual(WORKSPACE_LIMITS.alias)
  })

  it('없으면 맨 앞에 만든다: 고정 id·이름·별칭, 배치는 비어 있고(저장 전에는 모든 창을 내린다) 단축키는 넘긴 값', () => {
    const qa = testWorkspace()
    const r = withHideWorkspace([qa], { now: NOW, hotkey: HIDE_DEFAULT_HOTKEY })
    expect(r.added).toBe(true)
    expect(r.list).toHaveLength(2)
    expect(r.list[1]).toBe(qa)
    expect(r.list[0]).toEqual({
      id: HIDE_WORKSPACE_ID,
      name: HIDE_WORKSPACE_NAME,
      aliases: [...HIDE_WORKSPACE_ALIASES],
      hotkey: 'Ctrl+Alt+H',
      layouts: {},
      updatedAt: NOW.toISOString()
    })
    expect(withHideWorkspace([], { now: NOW, hotkey: null }).list[0].hotkey).toBeNull()
  })

  it('이미 있으면 그대로 둔다(이름·별칭·단축키·배치를 사용자가 바꿨어도)', () => {
    const mine = { ...testWorkspace({ id: HIDE_WORKSPACE_ID, name: '딴짓 숨기기', aliases: [], hotkey: null }) }
    const list = [testWorkspace(), mine]
    const r = withHideWorkspace(list, { now: NOW, hotkey: HIDE_DEFAULT_HOTKEY })
    expect(r.added).toBe(false)
    expect(r.list).toBe(list)
  })

  it("다른 워크스페이스가 이미 '화면 감추기'(공백·대소문자만 다른 이름 포함)를 쓰면 '화면 감추기 (기본)'으로 만든다", () => {
    const taken = testWorkspace({ id: 'ws-mine', name: '화면감추기' })
    expect(withHideWorkspace([taken], { now: NOW, hotkey: null }).list[0].name).toBe('화면 감추기 (기본)')
  })

  it('기본 워크스페이스는 30개 제한에 들지 않는다: 30개가 있어도 만든다', () => {
    const full = Array.from({ length: WORKSPACE_LIMITS.workspaces }, (_, i) => testWorkspace({ id: `ws-${i}`, name: `배치 ${i + 1}` }))
    const r = withHideWorkspace(full, { now: NOW, hotkey: null })
    expect(r.added).toBe(true)
    expect(r.list).toHaveLength(WORKSPACE_LIMITS.workspaces + 1)
  })
})

describe('기본 단축키 Ctrl+Alt+H(만들 때 한 번, 단축키 바꾸기 검사가 ok일 때만)', () => {
  it('비어 있으면(ok) Ctrl+Alt+H', () => {
    expect(defaultHideHotkey('ok')).toBe('Ctrl+Alt+H')
  })
  it('다른 앱이 쓰거나(in-use) 다른 단축키와 같거나(same-as-other) 막힌 조합(block)·경고 조합(warn)이면 없음', () => {
    for (const level of ['in-use', 'same-as-other', 'block', 'warn'] as const) expect(defaultHideHotkey(level), level).toBeNull()
  })
  it('검사할 수 없으면(단축키 관리자가 없음) 없음', () => {
    expect(defaultHideHotkey(null)).toBeNull()
  })
})

describe('목록 차례: 기본 워크스페이스를 맨 앞에(나머지 차례는 그대로)', () => {
  it('어디에 있든 맨 앞으로, 나머지는 받은 차례', () => {
    const ids = ['ws-b', HIDE_WORKSPACE_ID, 'ws-a', 'ws-c']
    expect(hideFirst(ids, (x) => x)).toEqual([HIDE_WORKSPACE_ID, 'ws-b', 'ws-a', 'ws-c'])
  })
  it('없으면 그대로(새 배열)', () => {
    const ids = ['ws-b', 'ws-a']
    const out = hideFirst(ids, (x) => x)
    expect(out).toEqual(ids)
    expect(out).not.toBe(ids)
  })
})
