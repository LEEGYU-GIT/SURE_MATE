import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { globalTimers } from '../bar/test-timers'
import { createHotkeyChanger, hotkeyName, RECORD_TIMEOUT_MS } from './hotkey-change'
import { type HotkeyId, HotkeyManager, type ShortcutBackend } from './hotkey-manager'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** 다른 앱이 잡은 조합(taken)은 등록되지 않는 가짜 등록부. pet은 말랑 메이트 조종 단축키(기본 없음) */
function make(taken: string[] = ['Ctrl+Alt+Space'], o: { pet?: string | null } = {}) {
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
  const pressed = { pet: 0 }
  manager.bind('pet-control', o.pet ?? null, () => void pressed.pet++)
  const saved: [string, string | null][] = []
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
  return { manager, changer, registered, saved, logs, pressed }
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

describe('말랑 메이트 조종 단축키(pet-control): 다른 단축키처럼 바꾸고, null이면 단축키 없음', () => {
  it('팔레트·용어 찾기와 같은 조합은 겹침(어느 단축키와 겹치는지 알린다), 팔레트·용어 찾기도 조종 단축키와 겹치면 겹침', () => {
    const t = make(['Ctrl+Alt+Space'], { pet: 'Ctrl+Alt+P' })
    const palette = t.changer.check('pet-control', 'alt+`')
    expect(palette.level).toBe('same-as-other')
    expect(palette.reason).toContain('팔레트')
    const lookup = t.changer.check('pet-control', 'Ctrl+Alt+W')
    expect(lookup.level).toBe('same-as-other')
    expect(lookup.reason).toContain('용어 찾기')
    const pet = t.changer.check('palette', 'Ctrl+Alt+P')
    expect(pet.level).toBe('same-as-other')
    expect(pet.reason).toContain('말랑 메이트')
    expect(t.changer.check('pet-control', 'Ctrl+Alt+P')).toEqual({ level: 'ok' })
    expect(t.changer.check('pet-control', 'Ctrl+Alt+Space').level).toBe('in-use')
  })

  it('팔레트와 같은 조합으로 바꾸려 하면 거절하고 등록·저장하지 않는다', async () => {
    const t = make(['Ctrl+Alt+Space'], { pet: 'Ctrl+Alt+P' })
    const r = await t.changer.set('pet-control', 'Alt+`')
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining('팔레트') })
    expect(t.manager.current('pet-control')).toBe('Ctrl+Alt+P')
    expect(t.manager.current('palette')).toBe('Alt+`')
    expect(t.saved).toEqual([])
  })

  it('녹화하면 조종 단축키까지 모두 잠시 풀고, 바꾸면 다른 단축키를 되살린 뒤 새 조합을 등록·저장한다', async () => {
    const t = make(['Ctrl+Alt+Space'], { pet: 'Ctrl+Alt+P' })
    t.changer.startRecording()
    expect(t.registered.size).toBe(0)
    expect(await t.changer.set('pet-control', 'Ctrl+Shift+P')).toEqual({ ok: true, acc: 'Ctrl+Shift+P' })
    expect([...t.registered.keys()].sort()).toEqual(['Alt+`', 'Ctrl+Alt+W', 'Ctrl+Shift+P'])
    expect(t.saved).toEqual([['pet-control', 'Ctrl+Shift+P']])
    t.registered.get('Ctrl+Shift+P')?.()
    expect(t.pressed.pet).toBe(1)
    // 녹화 시간이 지나도 두 번 되살리지 않는다
    vi.advanceTimersByTime(RECORD_TIMEOUT_MS)
    expect(t.registered.size).toBe(3)
  })

  it('등록에 실패하면 이전 조합이 그대로 등록돼 있고 저장하지 않는다(로그는 id·결과·까닭)', async () => {
    const t = make(['Ctrl+Alt+Space'], { pet: 'Ctrl+Alt+P' })
    const r = await t.changer.set('pet-control', 'Ctrl+Alt+Space')
    expect(r.ok).toBe(false)
    expect(t.manager.current('pet-control')).toBe('Ctrl+Alt+P')
    expect(t.registered.has('Ctrl+Alt+P')).toBe(true)
    t.registered.get('Ctrl+Alt+P')?.()
    expect(t.pressed.pet).toBe(1)
    expect(t.saved).toEqual([])
    expect(t.logs).toContainEqual(['hotkey.change', { id: 'pet-control', ok: false, reason: 'in-use' }])
  })

  it('null로 바꾸면 조합을 풀고 단축키 없음으로 저장한다', async () => {
    const t = make(['Ctrl+Alt+Space'], { pet: 'Ctrl+Alt+P' })
    expect(await t.changer.set('pet-control', null)).toEqual({ ok: true, acc: null })
    expect(t.manager.current('pet-control')).toBeUndefined()
    expect(t.registered.has('Ctrl+Alt+P')).toBe(false)
    expect(t.saved).toEqual([['pet-control', null]])
    expect(t.logs).toContainEqual(['hotkey.change', { id: 'pet-control', ok: true, acc: null }])
  })

  it('녹화 중에 비워도 다른 단축키는 되살린다', async () => {
    const t = make(['Ctrl+Alt+Space'], { pet: 'Ctrl+Alt+P' })
    t.changer.startRecording()
    await t.changer.set('pet-control', null)
    expect([...t.registered.keys()].sort()).toEqual(['Alt+`', 'Ctrl+Alt+W'])
  })

  it('단축키가 없던 조종에 새 조합을 정하면 등록되고 누르면 조종 처리기가 불린다', async () => {
    const t = make()
    expect(t.manager.current('pet-control')).toBeUndefined()
    expect(await t.changer.set('pet-control', 'Ctrl+Alt+P')).toEqual({ ok: true, acc: 'Ctrl+Alt+P' })
    t.registered.get('Ctrl+Alt+P')?.()
    expect(t.pressed.pet).toBe(1)
    expect(t.saved).toEqual([['pet-control', 'Ctrl+Alt+P']])
  })

  it('팔레트·용어 찾기는 비울 수 없다(거절하고 그대로 둔다)', async () => {
    const t = make()
    for (const id of ['palette', 'lookup'] as const) {
      const r = await t.changer.set(id, null)
      expect(r.ok).toBe(false)
    }
    expect(t.manager.current('palette')).toBe('Alt+`')
    expect(t.manager.current('lookup')).toBe('Ctrl+Alt+W')
    expect(t.saved).toEqual([])
  })
})

describe('녹화와 트레이 "단축키 일시 중지"는 따로 기록한다(M7)', () => {
  /** 일시 중지·되살리기 횟수를 세는 가짜 manager. resumeAll이 실패하면 팔레트·워크스페이스 하나를 돌려준다 */
  function rec(o: { failResume?: boolean } = {}) {
    const calls = { suspend: 0, resume: 0 }
    const warns: string[] = []
    const logs: [string, Record<string, unknown>][] = []
    const state = { userSuspended: false }
    const failed: HotkeyId[] = o.failResume ? ['palette', 'workspace:ws-1'] : []
    const changer = createHotkeyChanger({
      manager: {
        rebind: () => ({ ok: true }),
        unbind: () => {},
        suspendAll: () => void calls.suspend++,
        resumeAll: () => {
          calls.resume++
          return { failed }
        },
        current: () => undefined,
        ids: () => []
      },
      probe: () => true,
      save: async () => {},
      timers: globalTimers(),
      log: (e, d) => void logs.push([e, d]),
      userSuspended: () => state.userSuspended,
      warn: (m) => void warns.push(m),
      workspaces: { prepare: async () => true, save: async () => true, name: (id) => (id === 'ws-1' ? 'QA 모드' : null) }
    })
    return { changer, calls, warns, logs, state }
  }

  it('녹화를 시작하면 한 번만 모두 풀고(다시 시작해도 그대로), 멈추면 한 번 되살린다', () => {
    const t = rec()
    t.changer.startRecording()
    t.changer.startRecording()
    expect(t.calls.suspend).toBe(1)
    expect(t.changer.recording()).toBe(true)
    t.changer.stopRecording()
    t.changer.stopRecording()
    expect(t.calls.resume).toBe(1)
    expect(t.changer.recording()).toBe(false)
  })

  it('트레이에서 일시 중지했으면 녹화가 끝나도(멈춤·바꾸기·30초) 되살리지 않는다', async () => {
    const t = rec()
    t.state.userSuspended = true
    t.changer.startRecording()
    t.changer.stopRecording()
    t.changer.startRecording()
    await t.changer.set('palette', 'Ctrl+Shift+K')
    t.changer.startRecording()
    vi.advanceTimersByTime(RECORD_TIMEOUT_MS)
    expect(t.changer.recording()).toBe(false)
    expect(t.calls.resume).toBe(0)
    // 일시 중지를 끈 뒤의 녹화는 끝날 때 되살린다
    t.state.userSuspended = false
    t.changer.startRecording()
    t.changer.stopRecording()
    expect(t.calls.resume).toBe(1)
  })

  it('멈추지 않아도 30초가 지나면 한 번 되살리고 녹화가 끝난다', () => {
    const t = rec()
    t.changer.startRecording()
    vi.advanceTimersByTime(RECORD_TIMEOUT_MS - 1)
    expect(t.calls.resume).toBe(0)
    vi.advanceTimersByTime(1)
    expect(t.calls.resume).toBe(1)
    expect(t.changer.recording()).toBe(false)
    vi.advanceTimersByTime(RECORD_TIMEOUT_MS)
    expect(t.calls.resume).toBe(1)
  })

  it('(A-M6) 되살린 뒤에는(멈춤·바꾸기·30초) 설정 창이 등록 상태를 다시 그리게 알린다. 되살리지 않았으면(트레이 일시 중지) 알리지 않는다', async () => {
    const resumed: HotkeyId[][] = []
    const t = rec({ failResume: true })
    const changer = createHotkeyChanger({
      manager: { rebind: () => ({ ok: true }), unbind: () => {}, suspendAll: () => {}, resumeAll: () => ({ failed: ['workspace:ws-1'] }), current: () => undefined, ids: () => [] },
      probe: () => true,
      save: async () => {},
      timers: globalTimers(),
      log: () => {},
      userSuspended: () => t.state.userSuspended,
      resumed: (failed) => void resumed.push(failed)
    })
    changer.startRecording()
    changer.stopRecording()
    changer.startRecording()
    await changer.set('palette', 'Ctrl+Shift+K')
    changer.startRecording()
    vi.advanceTimersByTime(RECORD_TIMEOUT_MS)
    expect(resumed).toEqual([['workspace:ws-1'], ['workspace:ws-1'], ['workspace:ws-1']])
    t.state.userSuspended = true
    changer.startRecording()
    changer.stopRecording()
    expect(resumed).toHaveLength(3)
  })

  it('(13b) main이 30초가 지나 녹화를 끝내면 녹화 칸을 닫으라고 알린다(트레이 일시 중지 중이어도). 설정 창이 끝낸 녹화(멈춤·바꾸기)는 알리지 않는다', async () => {
    const state = { userSuspended: false }
    let ended = 0
    const changer = createHotkeyChanger({
      manager: { rebind: () => ({ ok: true }), unbind: () => {}, suspendAll: () => {}, resumeAll: () => ({ failed: [] }), current: () => undefined, ids: () => [] },
      probe: () => true,
      save: async () => {},
      timers: globalTimers(),
      log: () => {},
      userSuspended: () => state.userSuspended,
      recordingEnded: () => void ended++
    })
    changer.startRecording()
    changer.stopRecording()
    changer.startRecording()
    await changer.set('palette', 'Ctrl+Shift+K')
    expect(ended).toBe(0)
    changer.startRecording()
    vi.advanceTimersByTime(RECORD_TIMEOUT_MS)
    expect(ended).toBe(1)
    expect(changer.recording()).toBe(false)
    state.userSuspended = true
    changer.startRecording()
    vi.advanceTimersByTime(RECORD_TIMEOUT_MS)
    expect(ended).toBe(2)
    // dispose(앱 끝내기)는 알리지 않는다
    changer.startRecording()
    changer.dispose()
    expect(ended).toBe(2)
  })

  it('되살리지 못한 단축키가 있으면 이름으로 한 번 알리고, 로그에는 id만 남긴다', () => {
    const t = rec({ failResume: true })
    t.changer.startRecording()
    t.changer.stopRecording()
    expect(t.warns).toEqual(['다시 등록하지 못한 단축키가 있어요: 팔레트, ‘QA 모드’ 워크스페이스'])
    expect(t.logs).toContainEqual(['hotkey.resume.failed', { ids: ['palette', 'workspace:ws-1'] }])
    expect(JSON.stringify(t.logs)).not.toContain('QA 모드')
  })
})

describe('단축키 이름(안내 문구용)', () => {
  it('앱 단축키는 고정 이름, 워크스페이스는 그 이름(모르면 워크스페이스)', () => {
    expect(hotkeyName('palette')).toBe('팔레트')
    expect(hotkeyName('pet-control')).toBe('말랑 메이트 조종')
    expect(hotkeyName('workspace:ws-1', (id) => (id === 'ws-1' ? 'QA 모드' : null))).toBe('‘QA 모드’ 워크스페이스')
    expect(hotkeyName('workspace:ws-9', () => null)).toBe('워크스페이스')
    expect(hotkeyName('workspace:ws-9')).toBe('워크스페이스')
  })
})
