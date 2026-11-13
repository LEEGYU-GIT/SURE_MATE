import { describe, expect, it } from 'vitest'
import { HIDE_SESSION_MS, type HideTarget } from '../../shared/workspace/hide'
import { createHideController, HIDE_TIMING, type HidePorts } from './hide-runner'

interface Win {
  minimized: boolean
  maximized: boolean
  hung?: boolean
  gone?: boolean
  topmost?: boolean
  /** 최소화 요청을 무시한다(관리자 권한 창: UIPI) */
  ignoreMinimize?: boolean
}

/** 가짜 창 세계: 최소화·되돌리기는 다음 sleep 뒤에 적용된다(ShowWindowAsync처럼). fg는 앞 창(맨 위 소유 창) */
function world(wins: Record<string, Win>, o: { fg?: string | null; own?: string[] } = {}) {
  const calls: string[] = []
  const logs: [string, Record<string, unknown>][] = []
  let clock = 1_000_000
  let fg = o.fg ?? null
  const pending: (() => void)[] = []
  const timers: { ms: number; fn: () => void; stopped: boolean }[] = []
  const ports: HidePorts = {
    foreground: () => fg,
    state: (h) => {
      const w = wins[h]
      return !w || w.gone ? null : { minimized: w.minimized, maximized: w.maximized, hung: w.hung === true }
    },
    minimize: (h) => {
      calls.push(`min:${h}`)
      const w = wins[h]
      if (!w.ignoreMinimize) pending.push(() => void (w.minimized = true))
      return true
    },
    unminimize: (h, max) => {
      calls.push(`show:${h}:${max ? 'max' : 'normal'}`)
      pending.push(() => {
        wins[h].minimized = false
        wins[h].maximized = max
      })
    },
    raise: (h) => void calls.push(`raise:${h}`),
    setForeground: (h) => {
      calls.push(`fg:${h}`)
      fg = h
      return true
    },
    focusDesktop: () => {
      calls.push('desktop')
      return true
    },
    topmost: (h) => wins[h]?.topmost === true,
    pin: (h) => void calls.push(`pin:${h}`),
    unpin: (h) => void calls.push(`unpin:${h}`),
    foregroundRoot: () => (fg === null ? null : { hwnd: fg, own: (o.own ?? []).includes(fg) }),
    sleep: async (ms) => {
      clock += ms
      while (pending.length) pending.shift()!()
    },
    now: () => clock,
    every: (ms, fn) => {
      const t = { ms, fn, stopped: false }
      timers.push(t)
      return () => void (t.stopped = true)
    },
    log: (event, data) => void logs.push([event, data])
  }
  return {
    ports,
    calls,
    logs,
    timers,
    advance: (ms: number) => void (clock += ms),
    setFg: (h: string | null) => void (fg = h),
    /** 살피기 타이머를 한 번 돌린다 */
    tick: () => timers.filter((t) => !t.stopped).forEach((t) => t.fn())
  }
}

const target = (hwnd: string, o: Partial<HideTarget> = {}): HideTarget => ({ hwnd, maximized: false, elevated: false, ...o })
const only = (calls: string[], re: RegExp): string[] => calls.filter((c) => re.test(c))

describe('내리기(hide): 활성화 없이 내리고 내려간 것을 확인해 센다', () => {
  it('대상 창을 차례로 내리고, 내려간 창만 기록한다. 응답 없는 창은 건너뛰고 사라진 창은 세지 않는다', async () => {
    const w = world({ a: { minimized: false, maximized: false }, b: { minimized: false, maximized: true }, hung: { minimized: false, maximized: false, hung: true }, gone: { minimized: false, maximized: false, gone: true } })
    const c = createHideController(w.ports)
    const r = await c.hide({ targets: [target('a'), target('hung'), target('gone'), target('b', { maximized: true })], front: 'a', carry: [] })
    expect(only(w.calls, /^min:/)).toEqual(['min:a', 'min:b'])
    expect(r).toEqual({ minimized: 2, elevated: 0, hung: 1, failed: 0, hidden: new Set(['a', 'b']) })
    // 다시 누르면 되돌린다(최대화였던 b는 최대화로)
    expect(c.decide()).toEqual({
      kind: 'restore',
      windows: [
        { hwnd: 'b', maximized: true },
        { hwnd: 'a', maximized: false }
      ],
      focus: 'a'
    })
    expect(c.restorable()).toBe(2)
  })

  it('내려가지 않은 창: 관리자 권한인지 모르면(null) 관리자 권한 창(UIPI)으로, 아니면 failed로 센다', async () => {
    const w = world({ x: { minimized: false, maximized: false, ignoreMinimize: true }, y: { minimized: false, maximized: false, ignoreMinimize: true } })
    const r = await createHideController(w.ports).hide({ targets: [target('x', { elevated: null }), target('y')], front: null, carry: [] })
    expect(r).toMatchObject({ minimized: 0, elevated: 1, failed: 1 })
  })

  it('이어서 기억할 창(carry)은 다음 누름이 함께 되돌린다', async () => {
    const w = world({ a: { minimized: false, maximized: false }, old: { minimized: true, maximized: false } })
    const c = createHideController(w.ports)
    await c.hide({ targets: [target('a')], front: 'a', carry: [{ hwnd: 'old', maximized: false }] })
    expect(c.decide()).toMatchObject({ kind: 'restore', windows: [{ hwnd: 'old' }, { hwnd: 'a' }] })
  })
})

describe('되돌리기(unhide): 아래에서 위 차례로 되살리고 올린 뒤 감추기 직전 앞 창에 포커스', () => {
  it('최소화를 풀고(최대화였으면 최대화로) 아래에서 위로 올린 다음 앞 창을 올리고 포커스를 준다. 기록은 지운다', async () => {
    const w = world({ a: { minimized: false, maximized: false }, b: { minimized: false, maximized: true }, ws: { minimized: false, maximized: false } })
    const c = createHideController(w.ports)
    await c.hide({ targets: [target('a'), target('b', { maximized: true })], front: 'a', carry: [] })
    w.calls.length = 0
    const d = c.decide()
    if (d.kind !== 'restore') throw new Error('restore expected')
    const r = await c.unhide(d)
    expect(w.calls).toEqual(['show:b:max', 'show:a:normal', 'raise:b', 'raise:a', 'raise:a', 'fg:a'])
    expect(r).toEqual({ restored: 2, skipped: 0, focused: true })
    expect(c.decide()).toEqual({ kind: 'hide', why: 'first', carry: [] })
  })

  it('응답 없는 창은 되돌리지 않고 세며, 앞 창이 사라졌으면 맨 위로 되돌린 창에 포커스', async () => {
    const wins: Record<string, Win> = { a: { minimized: false, maximized: false }, b: { minimized: false, maximized: false } }
    const w = world(wins)
    const c = createHideController(w.ports)
    await c.hide({ targets: [target('a'), target('b')], front: 'a', carry: [] })
    wins.a.hung = true
    w.calls.length = 0
    const d = c.decide()
    if (d.kind !== 'restore') throw new Error('restore expected')
    const r = await c.unhide(d)
    expect(only(w.calls, /^(show|fg):/)).toEqual(['show:b:normal', 'fg:a'])
    expect(r).toMatchObject({ restored: 1, skipped: 1 })
  })
})

describe('감춘 동안 업무 창을 항상 위에 두기(옵션)', () => {
  async function pinned(o: { fg?: string | null; own?: string[] } = {}) {
    const w = world(
      { ws1: { minimized: false, maximized: false }, ws2: { minimized: false, maximized: false }, top: { minimized: false, maximized: false, topmost: true }, chat: { minimized: false, maximized: false } },
      o
    )
    const c = createHideController(w.ports)
    await c.hide({ targets: [target('chat')], front: 'chat', carry: [] })
    expect(c.pin(['ws1', 'ws2'], ['ws1', 'ws2', 'top'])).toBe(2)
    return { w, c }
  }

  it('고정한 창만 HWND_TOPMOST로 올리고 0.5초마다 살핀다', async () => {
    const { w } = await pinned({ fg: 'ws2' })
    expect(only(w.calls, /^pin:/)).toEqual(['pin:ws1', 'pin:ws2'])
    expect(w.timers.map((t) => t.ms)).toEqual([HIDE_TIMING.pinCheckMs])
    expect(w.logs).toContainEqual(['workspace.pin', { pinned: 2 }])
  })

  it('다시 누르면(press) 고정한 창만 풀고 살피기를 멈춘다(원래 항상 위였던 창은 건드리지 않는다)', async () => {
    const { w, c } = await pinned({ fg: 'ws2' })
    c.release('press')
    expect(only(w.calls, /^unpin:/)).toEqual(['unpin:ws1', 'unpin:ws2'])
    expect(w.timers.every((t) => t.stopped)).toBe(true)
    expect(w.logs).toContainEqual(['workspace.unpin', { released: 2, dropped: 0, trigger: 'press' }])
    c.release('press')
    expect(only(w.calls, /^unpin:/)).toHaveLength(2)
  })

  it('업무 창·Sure-Mate 창이 앞이면 그대로, 사용자가 다른 창으로 옮기면(switched) 풀고 그 창을 다시 올린다', async () => {
    const { w } = await pinned({ fg: 'ws1', own: ['palette'] })
    w.tick()
    w.setFg('top')
    w.tick()
    w.setFg('palette')
    w.tick()
    expect(only(w.calls, /^unpin:/)).toEqual([])
    w.setFg('chat')
    w.tick()
    expect(only(w.calls, /^unpin:/)).toEqual(['unpin:ws1', 'unpin:ws2'])
    await w.ports.sleep(HIDE_TIMING.switchRaiseDelayMs)
    expect(w.calls.at(-1)).toBe('raise:chat')
    expect(w.logs).toContainEqual(['workspace.unpin', { released: 2, dropped: 0, trigger: 'switched' }])
  })

  it('감춘 지 10분이 지나면(expired) 풀린다', async () => {
    const { w } = await pinned({ fg: 'ws1' })
    w.advance(HIDE_SESSION_MS)
    w.tick()
    expect(only(w.calls, /^unpin:/)).toEqual(['unpin:ws1', 'unpin:ws2'])
    expect(w.logs.at(-1)).toEqual(['workspace.unpin', { released: 2, dropped: 0, trigger: 'expired' }])
  })

  it('사라진 고정 창은 버리고(풀지 않는다), 모두 사라지면 살피기를 멈춘다(gone)', async () => {
    const { w, c } = await pinned({ fg: 'ws1' })
    // ws2를 닫는다
    const state = w.ports.state
    w.ports.state = (h) => (h === 'ws2' ? null : state(h))
    w.tick()
    expect(only(w.calls, /^unpin:/)).toEqual([])
    c.release('quit')
    expect(only(w.calls, /^unpin:/)).toEqual(['unpin:ws1'])
    expect(w.logs.at(-1)).toEqual(['workspace.unpin', { released: 1, dropped: 1, trigger: 'quit' }])

    const again = await pinned({ fg: 'ws1' })
    again.w.ports.state = () => null
    again.w.tick()
    expect(again.w.timers.every((t) => t.stopped)).toBe(true)
    expect(again.w.logs.at(-1)).toEqual(['workspace.unpin', { released: 0, dropped: 2, trigger: 'gone' }])
  })

  it('고정할 창이 없으면 살피지 않는다', async () => {
    const w = world({ a: { minimized: false, maximized: false } })
    const c = createHideController(w.ports)
    await c.hide({ targets: [target('a')], front: null, carry: [] })
    expect(c.pin([], [])).toBe(0)
    expect(w.timers).toEqual([])
  })
})
