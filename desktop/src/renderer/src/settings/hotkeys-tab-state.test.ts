import { describe, expect, it } from 'vitest'
import { testWorkspace } from '../../../shared/workspace/test-workspaces'
import type { WorkspaceView } from '../../../shared/workspace/workspace-ipc'
import { changeLabel, clearedNotice, doneNotice, HOTKEYS_COPY, workspaceHotkeyRows } from './hotkeys-tab-state'

const view = (id: string, name: string, hotkey: string | null, hotkeyRegistered = hotkey !== null): WorkspaceView => ({
  workspace: testWorkspace({ id, name, hotkey }),
  sameConfig: true,
  hotkeyRegistered
})

describe('워크스페이스 단축키 구역', () => {
  it('단축키가 있는 워크스페이스만 받은 순서(워크스페이스 탭과 같은 최근 순서) 그대로, 없는 것은 수만', () => {
    const items = [view('ws-b', '보고서', 'Ctrl+Alt+2'), view('ws-a', 'QA 모드', null), view('ws-c', '회의', 'Ctrl+Alt+1', false), view('ws-d', '배치 4', null)]
    const r = workspaceHotkeyRows(items)
    expect(r.rows.map((v) => v.workspace.id)).toEqual(['ws-b', 'ws-c'])
    expect(r.without).toBe(2)
    expect(workspaceHotkeyRows([])).toEqual({ rows: [], without: 0 })
  })

  it('단축키가 없는 워크스페이스 안내 줄', () => {
    expect(HOTKEYS_COPY.withoutHotkey(2)).toBe('단축키가 없는 워크스페이스 2개 · 워크스페이스 탭에서 정해요')
  })
})

describe('바꾸기 단추 이름(조합·등록 상태는 단추 밖 글자라 이름에 함께 읽힌다)', () => {
  it('지금 조합과 등록 못 함, 조합이 없으면 정하기', () => {
    expect(changeLabel('팔레트 열기', 'Alt+`', true)).toBe('팔레트 열기 단축키 바꾸기, 지금 Alt+`')
    expect(changeLabel('‘QA 모드’', 'Ctrl+Alt+1', false)).toBe('‘QA 모드’ 단축키 바꾸기, 지금 Ctrl+Alt+1, 등록 못 함')
    expect(changeLabel('말랑 메이트 조종하기', null, false)).toBe('말랑 메이트 조종하기 단축키 정하기, 지금 없음')
  })
})

describe('결과 줄', () => {
  it('바꾼 뒤: 팔레트·용어 찾기는 바꾼 조합(으로/로), 조종은 조종해요, 워크스페이스는 불러와요', () => {
    expect(doneNotice('palette', { acc: 'Ctrl+Alt+Space' })).toEqual({ tone: 'ok', text: 'Ctrl+Alt+Space로 바꿨어요' })
    expect(doneNotice('lookup', { acc: 'Ctrl+Alt+M' })).toEqual({ tone: 'ok', text: 'Ctrl+Alt+M으로 바꿨어요' })
    expect(doneNotice('lookup', { acc: 'Ctrl+Alt+1' })).toEqual({ tone: 'ok', text: 'Ctrl+Alt+1로 바꿨어요' })
    expect(doneNotice('palette', { acc: 'Alt+`' })).toEqual({ tone: 'ok', text: 'Alt+`로 바꿨어요' })
    expect(doneNotice('pet-control', { acc: 'Ctrl+Alt+P' })).toEqual({ tone: 'ok', text: '이제 Ctrl+Alt+P를 누르면 조종해요' })
    expect(doneNotice('workspace:ws-1', { acc: 'Ctrl+Alt+3' })).toEqual({ tone: 'ok', text: '이제 Ctrl+Alt+3을 누르면 불러와요' })
  })

  it('경고가 있으면 함께 보이고 주황(warn)', () => {
    expect(doneNotice('workspace:ws-1', { acc: 'Ctrl+G', warning: '다른 앱의 Ctrl+G 기능(찾기·이동 등)을 가로채요' })).toEqual({
      tone: 'warn',
      text: '이제 Ctrl+G를 누르면 불러와요 · 다른 앱의 Ctrl+G 기능(찾기·이동 등)을 가로채요'
    })
  })

  it('워크스페이스 단축키를 지운 뒤: 그 줄이 목록에서 빠지므로 이름으로 알린다', () => {
    expect(clearedNotice('QA 모드')).toEqual({ tone: 'ok', text: '‘QA 모드’ 단축키를 지웠어요' })
  })
})
