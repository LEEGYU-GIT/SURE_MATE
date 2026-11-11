import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { globalTimers } from '../bar/test-timers'
import { createHotkeyChanger, RECORD_TIMEOUT_MS } from './hotkey-change'
import { HotkeyManager, type ShortcutBackend } from './hotkey-manager'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** 다른 앱이 잡은 조합(taken)은 등록되지 않는 가짜 등록부 */
function make(taken: string[] = ['Ctrl+Alt+Space']) {
  const registered = new Map<string, () => void>()
  const backend: ShortcutBackend = {
    register: (acc, cb) => {
      if (taken.includes(acc) || registered.has(acc)) return false
      registered.set(acc, cb)
      return true
    },
    unregister: (acc) => void registered.delete(acc)
  }
  const manager = new HotkeyManager(backend, () => Date.now())
  manager.bind('palette', 'Alt+`', () => {})
  manager.bind('lookup', 'Ctrl+Alt+W', () => {})
  const saved: [string, string][] = []
  const logs: [string, Record<string, unknown>][] = []
  const changer = createHotkeyChanger({
    manager,
    probe: (acc) => {
      if (!backend.register(acc, () => {})) return false
      backend.unregister(acc)
      return true
    },
    save: async (id, acc) => void saved.push([id, acc]),
    timers: globalTimers(),
    log: (e, d) => void logs.push([e, d])
  })
  return { manager, changer, registered, saved, logs }
}

describe('check', () => {
  it('Win 조합·F12는 막고, IDE 자동완성 조합은 경고, 다른 앱이 쓰면 사용 중, 다른 단축키와 같으면 겹침', () => {
    const t = make()
    expect(t.changer.check('palette', 'Super+Space').level).toBe('block')
    expect(t.changer.check('palette', 'F12').level).toBe('block')
    expect(t.changer.check('palette', 'Ctrl+Space').level).toBe('warn')
    expect(t.changer.check('palette', 'Ctrl+Alt+Space').level).toBe('in-use')
    expect(t.changer.check('palette', 'ctrl+alt+w').level).toBe('same-as-other')
    expect(t.changer.check('palette', 'Alt+`')).toEqual({ level: 'ok' })
    expect(t.changer.check('palette', 'Ctrl+Shift+K')).toEqual({ level: 'ok' })
  })
})

describe('녹화(Review Focus 1)', () => {
  it('녹화를 시작하면 모든 단축키를 잠시 풀고, 멈추면 되살린다(두 번 시작해도 한 번)', () => {
    const t = make()
    t.changer.startRecording()
    t.changer.startRecording()
    expect(t.registered.size).toBe(0)
    t.changer.stopRecording()
    expect([...t.registered.keys()].sort()).toEqual(['Alt+`', 'Ctrl+Alt+W'])
    t.changer.stopRecording()
    expect(t.registered.size).toBe(2)
  })

  it('30초 동안 멈추지 않으면 저절로 되살리고, dispose도 되살린다', () => {
    const t = make()
    t.changer.startRecording()
    vi.advanceTimersByTime(RECORD_TIMEOUT_MS - 1)
    expect(t.registered.size).toBe(0)
    vi.advanceTimersByTime(1)
    expect(t.registered.size).toBe(2)
    t.changer.startRecording()
    t.changer.dispose()
    expect(t.registered.size).toBe(2)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('set', () => {
  it('바꾸면 새 조합으로 등록하고 저장한다(경고 조합이면 경고를 함께)', async () => {
    const t = make()
    expect(await t.changer.set('palette', 'Ctrl+Shift+K')).toEqual({ ok: true, acc: 'Ctrl+Shift+K' })
    expect(t.registered.has('Ctrl+Shift+K')).toBe(true)
    expect(t.registered.has('Alt+`')).toBe(false)
    expect(t.saved).toEqual([['palette', 'Ctrl+Shift+K']])
    const warned = await t.changer.set('palette', 'Ctrl+Space')
    expect(warned).toMatchObject({ ok: true, acc: 'Ctrl+Space', warning: expect.stringContaining('IDE') })
  })

  it('다른 앱이 쓰는 조합이면 이전 조합이 그대로이고 저장하지 않는다', async () => {
    const t = make()
    const r = await t.changer.set('palette', 'Ctrl+Alt+Space')
    expect(r.ok).toBe(false)
    expect(t.registered.has('Alt+`')).toBe(true)
    expect(t.manager.current('palette')).toBe('Alt+`')
    expect(t.saved).toEqual([])
  })

  it('막힌 조합·다른 단축키와 같은 조합은 등록해 보지도 않는다', async () => {
    const t = make()
    expect((await t.changer.set('palette', 'Super+K')).ok).toBe(false)
    expect((await t.changer.set('palette', 'Ctrl+Alt+W')).ok).toBe(false)
    expect(t.manager.current('palette')).toBe('Alt+`')
  })

  it('녹화 중에 바꾸면 먼저 다른 단축키를 되살린 뒤 바꾼다', async () => {
    const t = make()
    t.changer.startRecording()
    await t.changer.set('palette', 'Ctrl+Shift+K')
    expect([...t.registered.keys()].sort()).toEqual(['Ctrl+Alt+W', 'Ctrl+Shift+K'])
    vi.advanceTimersByTime(RECORD_TIMEOUT_MS)
    expect(t.registered.size).toBe(2)
  })

  it('로그에는 단축키 id·결과·까닭', async () => {
    const t = make()
    await t.changer.set('palette', 'Ctrl+Alt+Space')
    expect(t.logs).toContainEqual(['hotkey.change', { id: 'palette', ok: false, reason: 'in-use' }])
  })
})

describe('온보딩 후보', () => {
  it('Alt+Space는 비어 있을 때만, 제안은 Ctrl+Alt+Space(쓰는 중이면 Alt+`)', () => {
    const t = make(['Ctrl+Alt+Space'])
    expect(t.changer.candidates()).toEqual([
      { acc: 'Alt+Space', available: true, suggested: false },
      { acc: 'Ctrl+Alt+Space', available: false, suggested: false },
      { acc: 'Alt+`', available: true, suggested: true }
    ])
    const free = make([])
    expect(free.changer.candidates().find((c) => c.suggested)?.acc).toBe('Ctrl+Alt+Space')
    const altSpaceTaken = make(['Alt+Space'])
    expect(altSpaceTaken.changer.candidates().map((c) => c.acc)).toEqual(['Ctrl+Alt+Space', 'Alt+`'])
  })
})
