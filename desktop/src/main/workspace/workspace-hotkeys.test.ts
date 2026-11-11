import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WORKSPACE_NOTES } from '../../shared/workspace/messages'
import { testWorkspace } from '../../shared/workspace/test-workspaces'
import type { Workspace } from '../../shared/workspace/types'
import type { WorkspaceSource } from '../../shared/workspace/workspace-ipc'
import { globalTimers } from '../bar/test-timers'
import { createHotkeyChanger } from '../hotkeys/hotkey-change'
import { HotkeyManager, type ShortcutBackend } from '../hotkeys/hotkey-manager'
import { createWorkspaceHotkeys } from './workspace-hotkeys'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

// 시험 데이터는 가상 이름만
const ws = (id: string, name: string, hotkey: string | null = null): Workspace => testWorkspace({ id, name, aliases: [], hotkey })

/** 기다리는 Promise 처리를 돌린다(가짜 시계는 Promise를 멈추지 않는다) */
const flushPromises = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

/**
 * 팔레트(Alt+`)·용어 찾기(Ctrl+Alt+W)·조종(Ctrl+Alt+P)이 등록된 단축키 묶음, 메모리 워크스페이스 서비스, 설정 창의 단축키 바꾸기.
 * 다른 앱이 잡은 조합(taken)은 등록되지 않는다
 */
function setup(o: { taken?: string[]; list?: Workspace[]; beforeRun?: () => Promise<void> } = {}) {
  const taken = new Set(o.taken ?? ['Ctrl+Alt+9'])
  const registered = new Map<string, () => void>()
  let registers = 0
  const backend: ShortcutBackend = {
    register: (acc, cb) => {
      registers++
      if (taken.has(acc) || registered.has(acc)) return false
      registered.set(acc, cb)
      return true
    },
    unregister: (acc) => void registered.delete(acc)
  }
  const manager = new HotkeyManager(backend, () => Date.now())
  manager.bind('palette', 'Alt+`', () => {})
  manager.bind('lookup', 'Ctrl+Alt+W', () => {})
  manager.bind('pet-control', 'Ctrl+Alt+P', () => {})
  const state = { list: o.list ?? [ws('ws-1', 'QA 모드'), ws('ws-2', '가상자동차 보고', 'Ctrl+Alt+2')], saveFails: false }
  const runs: [string, WorkspaceSource][] = []
  const saved: [string, string | null][] = []
  const logs: [string, Record<string, unknown>][] = []
  const log = (event: string, data: Record<string, unknown>): void => void logs.push([event, data])
  const hotkeys = createWorkspaceHotkeys({
    manager,
    service: {
      list: async () => state.list,
      run: async (id, source) => {
        runs.push([id, source])
        return { ok: false, reason: 'cancelled' }
      },
      setHotkey: async (id, hotkey) => {
        if (state.saveFails || !state.list.some((w) => w.id === id)) return false
        saved.push([id, hotkey])
        state.list = state.list.map((w) => (w.id === id ? { ...w, hotkey } : w))
        return true
      }
    },
    beforeRun: o.beforeRun,
    log
  })
  const changer = createHotkeyChanger({
    manager,
    probe: (acc) => {
      if (!backend.register(acc, () => {})) return false
      backend.unregister(acc)
      return true
    },
    save: async () => {
      throw new Error('앱 단축키는 이 시험에서 바꾸지 않는다')
    },
    timers: globalTimers(),
    log,
    workspaces: hotkeys
  })
  return { manager, registered, hotkeys, changer, state, runs, saved, logs, registers: () => registers }
}

describe('sync: 워크스페이스 목록에 맞춰 단축키를 등록·해제한다', () => {
  it('단축키가 있는 워크스페이스를 등록하고, 다른 앱이 잡은 조합은 실패 목록으로 돌려준다', () => {
    const t = setup({ list: [ws('ws-1', 'QA 모드', 'Ctrl+Alt+1'), ws('ws-2', '가상자동차 보고', 'Ctrl+Alt+2'), ws('ws-3', 'XY방산 예산', 'Ctrl+Alt+9'), ws('ws-4', '메모')] })
    expect(t.hotkeys.sync(t.state.list)).toEqual({ failed: [{ id: 'ws-3', hotkey: 'Ctrl+Alt+9' }] })
    expect(t.manager.current('workspace:ws-1')).toBe('Ctrl+Alt+1')
    expect(t.manager.current('workspace:ws-2')).toBe('Ctrl+Alt+2')
    expect(t.manager.current('workspace:ws-3')).toBeUndefined()
    expect([...t.registered.keys()].sort()).toEqual(['Alt+`', 'Ctrl+Alt+1', 'Ctrl+Alt+2', 'Ctrl+Alt+P', 'Ctrl+Alt+W'])
  })

  it('누르면 그 워크스페이스를 단축키로 불러온다', () => {
    const t = setup({ list: [ws('ws-1', 'QA 모드', 'Ctrl+Alt+1'), ws('ws-2', '가상자동차 보고', 'Ctrl+Alt+2')] })
    t.hotkeys.sync(t.state.list)
    t.registered.get('Ctrl+Alt+2')?.()
    expect(t.runs).toEqual([['ws-2', 'hotkey']])
  })

  it('팔레트나 다른 워크스페이스가 이미 잡은 조합은 실패(앞의 것이 그대로 이긴다)', () => {
    const t = setup({ list: [ws('ws-1', 'QA 모드', 'Alt+`'), ws('ws-2', '가상자동차 보고', 'Ctrl+Alt+2'), ws('ws-3', 'XY방산 예산', 'Ctrl+Alt+2')] })
    expect(t.hotkeys.sync(t.state.list).failed).toEqual([
      { id: 'ws-1', hotkey: 'Alt+`' },
      { id: 'ws-3', hotkey: 'Ctrl+Alt+2' }
    ])
    expect(t.manager.current('palette')).toBe('Alt+`')
    t.registered.get('Ctrl+Alt+2')?.()
    expect(t.runs).toEqual([['ws-2', 'hotkey']])
  })

  it('지운 워크스페이스와 단축키를 비운 워크스페이스는 풀고, 그대로인 조합은 다시 등록하지 않는다', () => {
    const t = setup({ list: [ws('ws-1', 'QA 모드', 'Ctrl+Alt+1'), ws('ws-2', '가상자동차 보고', 'Ctrl+Alt+2'), ws('ws-3', 'XY방산 예산', 'Ctrl+Alt+3')] })
    t.hotkeys.sync(t.state.list)
    const before = t.registers()
    expect(t.hotkeys.sync(t.state.list)).toEqual({ failed: [] })
    expect(t.registers()).toBe(before)
    t.state.list = [ws('ws-1', 'QA 모드', 'Ctrl+Alt+1'), ws('ws-3', 'XY방산 예산')]
    expect(t.hotkeys.sync(t.state.list)).toEqual({ failed: [] })
    expect(t.registered.has('Ctrl+Alt+2')).toBe(false)
    expect(t.registered.has('Ctrl+Alt+3')).toBe(false)
    expect([...t.manager.ids()].sort()).toEqual(['lookup', 'palette', 'pet-control', 'workspace:ws-1'])
    expect(t.registers()).toBe(before)
  })

  it('두 워크스페이스가 조합을 맞바꿔도 둘 다 등록된다(먼저 모두 풀고 등록한다)', () => {
    const t = setup({ list: [ws('ws-1', 'QA 모드', 'Ctrl+Alt+1'), ws('ws-2', '가상자동차 보고', 'Ctrl+Alt+2')] })
    t.hotkeys.sync(t.state.list)
    t.state.list = [ws('ws-1', 'QA 모드', 'Ctrl+Alt+2'), ws('ws-2', '가상자동차 보고', 'Ctrl+Alt+1')]
    expect(t.hotkeys.sync(t.state.list)).toEqual({ failed: [] })
    t.registered.get('Ctrl+Alt+1')?.()
    expect(t.runs).toEqual([['ws-2', 'hotkey']])
  })

  it('(M6 최종 검토 I1) 말랑 메이트 조종을 먼저 끝내고 원래 창이 앞에 온 뒤 불러온다(조종 중 앞 창인 펫 창을 기억해 끝에 다시 앞으로 가져오지 않게)', async () => {
    const order: string[] = []
    let handedOff = (): void => {}
    const t = setup({
      list: [ws('ws-2', '가상자동차 보고', 'Ctrl+Alt+2')],
      beforeRun: () => {
        order.push('handoff')
        return new Promise<void>((resolve) => (handedOff = resolve))
      }
    })
    t.hotkeys.sync(t.state.list)
    t.registered.get('Ctrl+Alt+2')?.()
    expect(order).toEqual(['handoff'])
    // 원래 창이 앞에 오기 전(최대 80ms)에는 불러오지 않는다
    expect(t.runs).toEqual([])
    handedOff()
    await flushPromises()
    expect(t.runs).toEqual([['ws-2', 'hotkey']])
  })

  it('(I1) 조종 넘겨주기가 실패하면 불러오지 않고 id·오류만 기록한다(던지지 않는다)', async () => {
    const t = setup({
      list: [ws('ws-2', '가상자동차 보고', 'Ctrl+Alt+2')],
      beforeRun: async () => {
        throw new Error('handoff failed')
      }
    })
    t.hotkeys.sync(t.state.list)
    expect(() => t.registered.get('Ctrl+Alt+2')?.()).not.toThrow()
    await flushPromises()
    expect(t.runs).toEqual([])
    expect(t.logs).toContainEqual(['workspace.hotkeyError', { id: 'ws-2', error: 'handoff failed' }])
  })

  it('녹화로 단축키를 잠시 푼 동안 맞추면 바로 등록하지 않고, 녹화가 끝날 때 함께 등록한다', () => {
    const t = setup({ list: [ws('ws-1', 'QA 모드')] })
    t.hotkeys.sync(t.state.list)
    t.changer.startRecording()
    expect(t.registered.size).toBe(0)
    t.state.list = [ws('ws-1', 'QA 모드', 'Ctrl+Alt+1')]
    expect(t.hotkeys.sync(t.state.list)).toEqual({ failed: [] })
    expect(t.registered.size).toBe(0)
    t.changer.stopRecording()
    expect([...t.registered.keys()].sort()).toEqual(['Alt+`', 'Ctrl+Alt+1', 'Ctrl+Alt+P', 'Ctrl+Alt+W'])
  })
})

describe('설정 창에서 바꾸기(단축키 바꾸기 set, id workspace:<id>)', () => {
  it('바꾸면 등록하고 workspaces.json에 저장한다. 이전 조합은 풀고, 누르면 그 워크스페이스를 불러온다', async () => {
    const t = setup()
    t.hotkeys.sync(t.state.list)
    expect(await t.changer.set('workspace:ws-1', 'Ctrl+Alt+1')).toEqual({ ok: true, acc: 'Ctrl+Alt+1' })
    expect(await t.changer.set('workspace:ws-2', 'Ctrl+Shift+3')).toEqual({ ok: true, acc: 'Ctrl+Shift+3' })
    expect(t.saved).toEqual([
      ['ws-1', 'Ctrl+Alt+1'],
      ['ws-2', 'Ctrl+Shift+3']
    ])
    expect(t.registered.has('Ctrl+Alt+2')).toBe(false)
    t.registered.get('Ctrl+Alt+1')?.()
    t.registered.get('Ctrl+Shift+3')?.()
    expect(t.runs).toEqual([
      ['ws-1', 'hotkey'],
      ['ws-2', 'hotkey']
    ])
    // 저장 뒤 목록이 바뀌어 다시 맞춰도 다시 등록하지 않는다
    const before = t.registers()
    t.hotkeys.sync(t.state.list)
    expect(t.registers()).toBe(before)
  })

  it('경고 조합은 경고와 함께 바꾼다', async () => {
    const t = setup()
    t.hotkeys.sync(t.state.list)
    expect(await t.changer.set('workspace:ws-1', 'Ctrl+Space')).toMatchObject({ ok: true, acc: 'Ctrl+Space', warning: expect.stringContaining('IDE') })
  })

  it('다른 앱이 쓰는 조합이면 사용 중이라고 알리고, 이전 조합 그대로이며 저장하지 않는다', async () => {
    const t = setup()
    t.hotkeys.sync(t.state.list)
    expect(await t.changer.set('workspace:ws-1', 'Ctrl+Alt+9')).toEqual({ ok: false, reason: '다른 앱이 이 조합을 쓰고 있어요' })
    expect(await t.changer.set('workspace:ws-2', 'Ctrl+Alt+9')).toEqual({ ok: false, reason: '다른 앱이 이 조합을 쓰고 있어요' })
    expect(t.manager.current('workspace:ws-1')).toBeUndefined()
    expect(t.manager.current('workspace:ws-2')).toBe('Ctrl+Alt+2')
    expect(t.registered.has('Ctrl+Alt+2')).toBe(true)
    expect(t.saved).toEqual([])
  })

  it('막힌 조합(Alt+F12)·모르는 키는 등록해 보지도 않고 까닭을 알린다', async () => {
    const t = setup()
    t.hotkeys.sync(t.state.list)
    const before = t.registers()
    expect(await t.changer.set('workspace:ws-1', 'Alt+F12')).toMatchObject({ ok: false, reason: expect.stringContaining('F12') })
    expect(await t.changer.set('workspace:ws-1', 'Ctrl+Alt+MediaPlayPause')).toMatchObject({ ok: false, reason: expect.stringContaining('이 키는 단축키로 쓸 수 없어요') })
    expect(t.registers()).toBe(before)
    expect(t.saved).toEqual([])
  })

  it('팔레트·조종·다른 워크스페이스 단축키와 같은 조합이면 겹침이라고 어느 것인지 알린다(보조키 순서가 달라도)', async () => {
    const t = setup()
    t.hotkeys.sync(t.state.list)
    expect(await t.changer.set('workspace:ws-1', 'Alt+`')).toMatchObject({ ok: false, reason: expect.stringContaining('팔레트') })
    expect(await t.changer.set('workspace:ws-1', 'Alt+Ctrl+P')).toMatchObject({ ok: false, reason: expect.stringContaining('말랑 메이트 조종') })
    expect(await t.changer.set('workspace:ws-1', 'Alt+Ctrl+2')).toEqual({ ok: false, reason: '‘가상자동차 보고’ 워크스페이스 단축키와 같은 조합이에요' })
    expect(t.changer.check('workspace:ws-1', 'ctrl+alt+w').level).toBe('same-as-other')
    // 자기 조합으로 다시 정하는 것은 겹침이 아니다
    expect(t.changer.check('workspace:ws-2', 'Alt+Ctrl+2')).toEqual({ level: 'ok' })
    expect(t.manager.current('workspace:ws-1')).toBeUndefined()
    expect(t.saved).toEqual([])
  })

  it('팔레트·조종 단축키를 워크스페이스 조합으로 바꾸려 해도 겹침(워크스페이스 이름으로 알린다)', async () => {
    const t = setup()
    t.hotkeys.sync(t.state.list)
    expect(t.changer.check('palette', 'Ctrl+Alt+2')).toEqual({ level: 'same-as-other', reason: '‘가상자동차 보고’ 워크스페이스 단축키와 같은 조합이에요' })
    expect(await t.changer.set('pet-control', 'Alt+Ctrl+2')).toMatchObject({ ok: false, reason: expect.stringContaining('가상자동차 보고') })
    expect(t.manager.current('pet-control')).toBe('Ctrl+Alt+P')
    expect(t.manager.current('palette')).toBe('Alt+`')
  })

  it('비우면(null) 풀고 단축키 없음으로 저장한다. 처리기는 남아 다시 정할 수 있다', async () => {
    const t = setup()
    t.hotkeys.sync(t.state.list)
    expect(await t.changer.set('workspace:ws-2', null)).toEqual({ ok: true, acc: null })
    expect(t.registered.has('Ctrl+Alt+2')).toBe(false)
    expect(t.manager.current('workspace:ws-2')).toBeUndefined()
    expect(t.saved).toEqual([['ws-2', null]])
    t.hotkeys.sync(t.state.list)
    expect(await t.changer.set('workspace:ws-2', 'Ctrl+Alt+4')).toEqual({ ok: true, acc: 'Ctrl+Alt+4' })
    t.registered.get('Ctrl+Alt+4')?.()
    expect(t.runs).toEqual([['ws-2', 'hotkey']])
  })

  it('없는 워크스페이스면 찾지 못했다고 알리고 아무것도 바꾸지 않는다', async () => {
    const t = setup()
    t.hotkeys.sync(t.state.list)
    const before = t.registers()
    expect(await t.changer.set('workspace:ws-9', 'Ctrl+Alt+5')).toEqual({ ok: false, reason: WORKSPACE_NOTES.missing })
    expect(await t.changer.set('workspace:ws-9', null)).toEqual({ ok: false, reason: WORKSPACE_NOTES.missing })
    expect(t.registers()).toBe(before)
    expect(t.manager.current('workspace:ws-9')).toBeUndefined()
    expect(t.saved).toEqual([])
  })

  it('맞춘 뒤 파일에만 더해진 워크스페이스도 바꿀 수 있다(처리기를 먼저 붙인다)', async () => {
    const t = setup()
    t.hotkeys.sync(t.state.list)
    t.state.list = [...t.state.list, ws('ws-5', 'XY방산 예산')]
    expect(await t.changer.set('workspace:ws-5', 'Ctrl+Alt+5')).toEqual({ ok: true, acc: 'Ctrl+Alt+5' })
    t.registered.get('Ctrl+Alt+5')?.()
    expect(t.runs).toEqual([['ws-5', 'hotkey']])
    // 겹침 안내에도 그 이름을 쓴다
    expect(t.changer.check('workspace:ws-1', 'Ctrl+Alt+5').reason).toContain('XY방산 예산')
  })

  it('저장하지 못하면 등록을 바꾸기 전으로 되돌리고 알린다', async () => {
    const t = setup()
    t.hotkeys.sync(t.state.list)
    t.state.saveFails = true
    expect(await t.changer.set('workspace:ws-2', 'Ctrl+Alt+3')).toMatchObject({ ok: false, reason: expect.stringContaining('저장하지 못했어요') })
    expect(t.manager.current('workspace:ws-2')).toBe('Ctrl+Alt+2')
    expect(t.registered.has('Ctrl+Alt+2')).toBe(true)
    expect(t.registered.has('Ctrl+Alt+3')).toBe(false)
    expect((await t.changer.set('workspace:ws-1', 'Ctrl+Alt+1')).ok).toBe(false)
    expect(t.manager.current('workspace:ws-1')).toBeUndefined()
    expect(t.registered.has('Ctrl+Alt+1')).toBe(false)
    expect((await t.changer.set('workspace:ws-2', null)).ok).toBe(false)
    expect(t.registered.has('Ctrl+Alt+2')).toBe(true)
  })

  it('로그에는 워크스페이스 이름이 없다(id·결과·까닭만)', async () => {
    const t = setup({ list: [ws('ws-1', 'QA 모드'), ws('ws-2', '가상자동차 보고', 'Ctrl+Alt+2'), ws('ws-3', 'XY방산 예산', 'Ctrl+Alt+9')] })
    t.hotkeys.sync(t.state.list)
    await t.changer.set('workspace:ws-1', 'Ctrl+Alt+2')
    await t.changer.set('workspace:ws-1', 'Ctrl+Alt+9')
    await t.changer.set('workspace:ws-1', 'Ctrl+Alt+1')
    await t.changer.set('workspace:ws-9', 'Ctrl+Alt+5')
    await t.changer.set('palette', 'Ctrl+Alt+1')
    t.registered.get('Ctrl+Alt+1')?.()
    expect(t.logs).toContainEqual(['workspace.hotkey', { id: 'ws-3', ok: false, reason: 'in-use' }])
    expect(t.logs).toContainEqual(['hotkey.change', { id: 'workspace:ws-1', ok: false, reason: 'same-as-other' }])
    expect(t.logs).toContainEqual(['hotkey.change', { id: 'workspace:ws-9', ok: false, reason: 'missing' }])
    const text = JSON.stringify(t.logs)
    for (const name of ['QA 모드', '가상자동차', 'XY방산']) expect(text).not.toContain(name)
  })
})
