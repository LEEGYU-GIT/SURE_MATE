import { describe, expect, it } from 'vitest'
import { HIDE_WORKSPACE_ALIASES, HIDE_WORKSPACE_ID, HIDE_WORKSPACE_NAME, withHideWorkspace } from '../../shared/workspace/builtin'
import { monitorFingerprint } from '../../shared/workspace/monitors'
import { L, P } from '../../shared/workspace/test-monitors'
import { testWorkspace } from '../../shared/workspace/test-workspaces'
import type { WorkspaceRunResult, WorkspaceSaveResult } from '../../shared/workspace/workspace-ipc'
import { createWorkspaceCommands, WORKSPACE_MENU_MAX, WORKSPACE_SAVE_ID, workspaceMenuContent, workspacePaletteItems } from './workspace-items'

const FP = monitorFingerprint([P, L])

describe('workspacePaletteItems', () => {
  it('맨 앞은 지금 배치 저장 명령(워크스페이스 구역이라 @ 범위에서도 보인다)', () => {
    expect(WORKSPACE_SAVE_ID).toBe('cmd.workspace-save')
    expect(workspacePaletteItems([], FP)).toEqual([
      {
        id: 'cmd.workspace-save',
        group: 'workspace',
        title: '지금 배치 저장',
        subtitle: '지금 열린 창 위치를 새 워크스페이스로 저장해요',
        keywords: ['save', 'workspace', 'layout', '워크스페이스', '레이아웃', '창 배치', '배치 저장']
      }
    ])
  })

  it('워크스페이스마다 제목은 이름, 부제는 창 수(+ 단축키, 다른 구성), 키워드는 별칭', () => {
    const [save, qa] = workspacePaletteItems([testWorkspace()], FP)
    expect(save.id).toBe(WORKSPACE_SAVE_ID)
    expect(qa).toEqual({ id: 'workspace:ws-qa', group: 'workspace', title: 'QA 모드', subtitle: '창 3개', keywords: ['qa'] })
    expect(workspacePaletteItems([testWorkspace({ hotkey: 'Ctrl+Alt+1' })], FP)[1].subtitle).toBe('창 3개 · Ctrl+Alt+1')
    const other = monitorFingerprint([P])
    expect(workspacePaletteItems([testWorkspace()], other)[1].subtitle).toMatch(/ · 다른 모니터 구성$/)
    expect(workspacePaletteItems([testWorkspace({ hotkey: 'Ctrl+Alt+1' })], other)[1].subtitle).toBe('창 3개 · Ctrl+Alt+1 · 다른 모니터 구성')
  })

  it('창 수는 포함한(켜진) 창만 센다', () => {
    const ws = testWorkspace()
    ws.layouts[FP] = { ...ws.layouts[FP], windows: ws.layouts[FP].windows.map((x, i) => (i === 0 ? { ...x, enabled: false } : x)) }
    expect(workspacePaletteItems([ws], FP)[1].subtitle).toBe('창 2개')
  })

  it('화면 감추기(기본)는 지금 배치 저장 바로 다음에 고정(@ 다음 Enter는 그대로 저장), 별칭은 키워드', () => {
    const hide = withHideWorkspace([], { now: new Date('2020-01-01T00:00:00.000Z'), hotkey: 'Ctrl+Alt+H' }).list[0]
    const items = workspacePaletteItems([testWorkspace({ updatedAt: '2026-11-11T00:00:00.000Z' }), hide], FP)
    expect(items.map((i) => i.id)).toEqual([WORKSPACE_SAVE_ID, `workspace:${HIDE_WORKSPACE_ID}`, 'workspace:ws-qa'])
    expect(items[1]).toEqual({
      id: `workspace:${HIDE_WORKSPACE_ID}`,
      group: 'workspace',
      title: HIDE_WORKSPACE_NAME,
      subtitle: '열린 창을 모두 내려요 · Ctrl+Alt+H',
      keywords: [...HIDE_WORKSPACE_ALIASES]
    })
  })

  it('화면 감추기 부제: 저장한 창이 있으면 그 창만 남긴다고, 되돌릴 창이 있으면 다시 누르면 되돌린다고(다른 구성은 배치가 있을 때만)', () => {
    const saved = testWorkspace({ id: HIDE_WORKSPACE_ID, name: HIDE_WORKSPACE_NAME })
    expect(workspacePaletteItems([saved], FP)[1].subtitle).toBe('창 3개만 남기고 나머지 창은 내려요')
    expect(workspacePaletteItems([saved], monitorFingerprint([P]))[1].subtitle).toBe('창 3개만 남기고 나머지 창은 내려요 · 다른 모니터 구성')
    expect(workspacePaletteItems([saved], FP, { restorable: 7 })[1].subtitle).toBe('다시 누르면 내렸던 창 7개를 되돌려요')
  })

  it('updatedAt 내림차순(최근에 바꾼 것 먼저), 받은 목록은 고치지 않는다', () => {
    const list = Object.freeze([
      testWorkspace({ id: 'a', name: '가상 A', updatedAt: '2026-11-09T00:00:00.000Z' }),
      testWorkspace({ id: 'b', name: '가상 B', updatedAt: '2026-11-11T00:00:00.000Z' }),
      testWorkspace({ id: 'c', name: '가상 C', updatedAt: '2026-11-10T00:00:00.000Z' })
    ])
    expect(workspacePaletteItems(list, FP).map((i) => i.id)).toEqual([WORKSPACE_SAVE_ID, 'workspace:b', 'workspace:c', 'workspace:a'])
  })
})

describe('팔레트 명령(createWorkspaceCommands)', () => {
  const saved: WorkspaceSaveResult = { ok: true, id: 'ws-1', name: '배치 1', windows: 3, skipped: { minimized: 0, excluded: 0, offscreen: 0, overLimit: 0 } }
  const failed: WorkspaceSaveResult = { ok: false, reason: 'no-windows', message: '저장할 창이 없어요.' }

  function setup(o: { released?: boolean; save?: WorkspaceSaveResult } = {}): { calls: string[]; commands: ReturnType<typeof createWorkspaceCommands> } {
    const calls: string[] = []
    const commands = createWorkspaceCommands({
      service: {
        saveNew: async (x) => {
          calls.push(`saveNew:${x.source}${x.quiet ? ':quiet' : ''}`)
          return o.save ?? saved
        },
        saveAs: async (name, source) => {
          calls.push(`saveAs:${name}:${source}`)
          return o.save ?? saved
        },
        run: async (id, source): Promise<WorkspaceRunResult> => {
          calls.push(`run:${id}:${source}`)
          return { ok: false, reason: 'missing' }
        }
      },
      waitKeysReleased: async () => {
        calls.push('wait')
        return o.released ?? true
      },
      hidePalette: (restoreFocus) => void calls.push(`hide:${restoreFocus}`),
      openEditor: (id) => void calls.push(`editor:${id}`),
      notify: (message) => void calls.push(`notify:${message}`)
    })
    return { calls, commands }
  }

  it('지금 배치 저장: 키를 뗐는지 보고 알림 없이 저장한 뒤, 설정 창 워크스페이스 탭에서 새 워크스페이스를 연다(이름을 바로 바꾸게)', async () => {
    const { calls, commands } = setup()
    expect(await commands.run(WORKSPACE_SAVE_ID)).toBe(true)
    // 설정 창이 포커스를 가져가므로 원래 창으로 돌아가지 않는다
    expect(calls).toEqual(['wait', 'saveNew:palette:quiet', 'hide:false', 'editor:ws-1'])
  })

  it('지금 배치 저장: 키를 떼지 않았으면 숨기지 않고 연다(팔레트는 포커스를 잃으면 숨는다)', async () => {
    const held = setup({ released: false })
    await held.commands.run(WORKSPACE_SAVE_ID)
    expect(held.calls).toEqual(['wait', 'saveNew:palette:quiet', 'editor:ws-1'])
  })

  it('지금 배치 저장: 저장하지 못했으면 팔레트를 두고 까닭을 알린다(설정 창은 열지 않는다)', async () => {
    const bad = setup({ save: failed })
    expect(await bad.commands.run(WORKSPACE_SAVE_ID)).toBe(true)
    expect(bad.calls).toEqual(['wait', 'saveNew:palette:quiet', 'notify:저장할 창이 없어요.'])
  })

  it('workspace-edit:<id>(워크스페이스 행의 Ctrl+Enter·→): 키를 뗐으면 숨기고, 설정 창 워크스페이스 탭에서 그 워크스페이스를 연다', async () => {
    const a = setup()
    expect(await a.commands.run('workspace-edit:ws-qa')).toBe(true)
    expect(a.calls).toEqual(['wait', 'hide:false', 'editor:ws-qa'])
    const b = setup({ released: false })
    await b.commands.run('workspace-edit:ws-qa')
    expect(b.calls).toEqual(['wait', 'editor:ws-qa'])
    // 형식이 틀린 id는 맡되 아무것도 하지 않는다
    const c = setup()
    expect(await c.commands.run('workspace-edit:a/b')).toBe(true)
    expect(c.calls).toEqual([])
  })

  it('workspace:<id>: 키를 뗐으면 팔레트를 숨기고(원래 창으로) 불러오고, 떼지 않았으면 팔레트를 둔 채 불러온다', async () => {
    const a = setup()
    expect(await a.commands.run('workspace:ws-qa')).toBe(true)
    expect(a.calls).toEqual(['wait', 'hide:true', 'run:ws-qa:palette'])
    const b = setup({ released: false })
    expect(await b.commands.run('workspace:ws-qa')).toBe(true)
    expect(b.calls).toEqual(['wait', 'run:ws-qa:palette'])
  })

  it('다른 항목은 맡지 않고(false), 형식이 틀린 워크스페이스 id는 불러오지 않는다', async () => {
    const { calls, commands } = setup()
    expect(await commands.run('prompt:meeting-notes')).toBe(false)
    expect(await commands.run('workspace-save-as')).toBe(false)
    expect(await commands.run('workspace:a/b')).toBe(true)
    expect(calls).toEqual([])
  })

  it('다른 이름으로 저장: 키 확인 → 저장 → 성공이고 뗐으면 숨김, 결과를 돌려준다', async () => {
    const a = setup()
    expect(await a.commands.saveAs('QA 모드')).toBe(saved)
    expect(a.calls).toEqual(['wait', 'saveAs:QA 모드:palette', 'hide:true'])
    const b = setup({ released: false })
    await b.commands.saveAs('QA 모드')
    expect(b.calls).toEqual(['wait', 'saveAs:QA 모드:palette'])
    const c = setup({ save: failed })
    expect(await c.commands.saveAs('QA 모드')).toBe(failed)
    expect(c.calls).toEqual(['wait', 'saveAs:QA 모드:palette'])
  })
})

describe('workspaceMenuContent: 바 펼침 창 메뉴 내용', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => testWorkspace({ id: `ws-${i}`, name: `배치 ${i}`, updatedAt: new Date(Date.UTC(2026, 10, 1 + i)).toISOString() }))

  it('10개 중 최근에 바꾼 8개만, 나머지 수는 more', () => {
    expect(WORKSPACE_MENU_MAX).toBe(8)
    const c = workspaceMenuContent(many(10), FP, true)
    expect(c.kind).toBe('workspace-menu')
    expect(c.workspaces).toHaveLength(8)
    expect(c.workspaces.map((w) => w.id)).toEqual(['ws-9', 'ws-8', 'ws-7', 'ws-6', 'ws-5', 'ws-4', 'ws-3', 'ws-2'])
    expect(c.more).toBe(2)
    expect(c.canSave).toBe(true)
  })

  it('8개 이하면 more 0, 받은 목록은 고치지 않는다', () => {
    const list = many(3)
    const ids = list.map((w) => w.id)
    expect(workspaceMenuContent(list, FP, false)).toMatchObject({ more: 0, canSave: false })
    expect(list.map((w) => w.id)).toEqual(ids)
  })

  it('(13b) 카드가 쓸 수 있는 높이에 들어가는 행만 보이고 나머지는 more로 센다(저장·모두 보기 행이 잘리지 않게)', () => {
    // 저장할 수 없으면 저장 행이 두 줄 설명으로 커져 560에 7개
    expect(workspaceMenuContent(many(10), FP, false)).toMatchObject({ more: 3 })
    expect(workspaceMenuContent(many(10), FP, false).workspaces.map((w) => w.id)).toEqual(['ws-9', 'ws-8', 'ws-7', 'ws-6', 'ws-5', 'ws-4', 'ws-3'])
    // 1280×720 125%(카드 최대 512)
    const small = workspaceMenuContent(many(8), FP, true, 512)
    expect(small.workspaces).toHaveLength(7)
    expect(small.more).toBe(1)
    expect(workspaceMenuContent(many(3), FP, true, 512)).toMatchObject({ more: 0 })
    // 행이 하나도 들어가지 않으면 모두 more(빈 목록과 다르다)
    expect(workspaceMenuContent(many(2), FP, true, 150)).toMatchObject({ workspaces: [], more: 2 })
  })

  it('화면 감추기(기본)는 최근에 바꾼 순서와 상관없이 첫 행이고 한 행을 차지한다. 되돌릴 창 수를 함께 싣는다', () => {
    const hide = { ...withHideWorkspace([], { now: new Date('2020-01-01T00:00:00.000Z'), hotkey: null }).list[0] }
    const c = workspaceMenuContent([...many(10), hide], FP, true, undefined, 4)
    expect(c.workspaces[0]).toEqual({ id: HIDE_WORKSPACE_ID, name: HIDE_WORKSPACE_NAME, windows: 0, otherConfig: false, hide: true, restorable: 4 })
    expect(c.workspaces.slice(1).map((w) => w.id)).toEqual(['ws-9', 'ws-8', 'ws-7', 'ws-6', 'ws-5', 'ws-4', 'ws-3'])
    expect(c.more).toBe(3)
    // 되돌릴 창이 없으면 restorable을 싣지 않는다
    expect(workspaceMenuContent([hide], FP, true).workspaces[0]).toEqual({ id: HIDE_WORKSPACE_ID, name: HIDE_WORKSPACE_NAME, windows: 0, otherConfig: false, hide: true })
  })

  it('창 수는 켜진 창만, otherConfig는 지금 지문의 배치가 없을 때', () => {
    const ws = testWorkspace()
    expect(workspaceMenuContent([ws], FP, true).workspaces).toEqual([{ id: 'ws-qa', name: 'QA 모드', windows: 3, otherConfig: false }])
    expect(workspaceMenuContent([ws], monitorFingerprint([P]), true).workspaces[0]).toMatchObject({ windows: 3, otherConfig: true })
  })
})
