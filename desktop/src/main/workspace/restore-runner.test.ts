import { describe, expect, it } from 'vitest'
import type { Rect } from '../../shared/types'
import type { ReadyPlan, RestoreStep } from '../../shared/workspace/restore-plan'
import { chooseFocus, createRestoreRunner, type RestorePorts, unfocusableOwnWindow } from './restore-runner'

interface Win {
  minimized: boolean
  maximized: boolean
  hung: boolean
  frame: Rect
  gone?: boolean
  /** normalize(activate:false)가 풀지 못하는 창 */
  stubborn?: boolean
  /** 풀리지 않는 창 */
  stuck?: boolean
  /** 첫 이동만 이 만큼 어긋남 */
  firstOff?: number
  /** 항상 이 만큼 어긋남 */
  alwaysOff?: number
  /** 이동을 무시 */
  ignoreMove?: boolean
  rejectMove?: boolean
  moveCost?: number
  goneAfterNormalize?: boolean
  noMaximize?: boolean
  raiseThrows?: boolean
  moves: number
}

const R = (x: number, y = 0, w = 800, h = 600): Rect => ({ x, y, width: w, height: h })
const win = (o: Partial<Win> = {}): Win => ({ minimized: false, maximized: false, hung: false, frame: R(5, 5, 100, 100), moves: 0, ...o })

/**
 * 가짜 창 세계. fg는 시작 때 앞 창이고(기본 'fg'는 계획에 넣지 않으면 워크스페이스 밖의 다른 앱 창), 최대화(SW_SHOWMAXIMIZED)와
 * activate:true 복원(SW_RESTORE)은 실제처럼 그 창을 앞 창으로 만든다(activate:false 복원·이동·raise(SWP_NOACTIVATE)는 앞 창을 바꾸지 않는다).
 * notFocusable은 사라졌거나 숨었거나 포커스를 받지 않는 창, own은 Sure-Mate 자신의 창(설정 창 등)
 */
interface World {
  ports: RestorePorts
  calls: string[]
  clock(): number
  activate(h: string | null): void
}

function world(wins: Record<string, Win>, fg: string | null = 'fg', opts: { fgThrows?: boolean; notFocusable?: string[]; own?: string[] } = {}): World {
  const calls: string[] = []
  let clock = 0
  let front = fg
  // 가짜 sleep이 시계를 앞당기고 지정 시간 뒤 상태가 풀린다
  const pendingRelease = new Map<string, number>()
  const ports: RestorePorts = {
    state: (h) => {
      const w = wins[h]
      if (!w || w.gone) return null
      const at = pendingRelease.get(h)
      if (at !== undefined && clock >= at) {
        w.minimized = false
        w.maximized = false
        pendingRelease.delete(h)
      }
      calls.push(`state:${h}`)
      return { minimized: w.minimized, maximized: w.maximized, hung: w.hung, frame: { ...w.frame } }
    },
    normalize: (h, o) => {
      calls.push(`normalize:${h}:${o.activate}`)
      const w = wins[h]
      if (o.activate) front = h
      if (w.stuck) return
      if (w.stubborn && !o.activate) return
      if (w.goneAfterNormalize) w.gone = true
      pendingRelease.set(h, clock + 150)
    },
    move: async (h, r) => {
      calls.push(`move:${h}`)
      const w = wins[h]
      w.moves++
      clock += w.moveCost ?? 0
      if (w.rejectMove) throw new Error('denied')
      if (w.ignoreMove) return
      const off = w.alwaysOff ?? (w.moves === 1 ? (w.firstOff ?? 0) : 0)
      w.frame = { ...r, width: r.width + off }
    },
    maximize: (h) => {
      calls.push(`maximize:${h}`)
      front = h
      if (!wins[h].noMaximize) wins[h].maximized = true
    },
    raise: (h) => {
      calls.push(`raise:${h}`)
      if (wins[h]?.raiseThrows) throw new Error('raise')
    },
    toPhysical: (d) => d,
    foreground: () => front,
    focusable: (h) => !(opts.notFocusable ?? []).includes(h),
    own: (h) => (opts.own ?? []).includes(h),
    setForeground: (h) => {
      calls.push(`fg:${h}`)
      if (opts.fgThrows) throw new Error('fg')
      front = h
      return true
    },
    sleep: async (ms) => {
      calls.push(`sleep:${ms}`)
      clock += ms
    },
    now: () => clock
  }
  return {
    ports,
    calls,
    clock: () => clock,
    /** 다른 창이 스스로 앞으로 나왔다(실행하는 동안 앞 창이 바뀜) */
    activate: (h: string | null) => void (front = h)
  }
}

const step = (id: string, extra: Partial<RestoreStep> = {}): RestoreStep => ({
  ruleId: id,
  app: id.toUpperCase(),
  hwnd: id,
  target: R(100, 100),
  dpi: 96,
  state: 'normal',
  elevated: false,
  ...extra
})
const plan = (steps: RestoreStep[], extra: Partial<ReadyPlan> = {}): ReadyPlan => ({
  kind: 'ready',
  steps,
  skipped: [],
  total: steps.length,
  gathered: false,
  ...extra
})
const only = (calls: string[], re: RegExp): string[] => calls.filter((c) => re.test(c))

describe('createRestoreRunner', () => {
  it('보통 창: state → move → state → raise(끝에 맨 위 복원 창을 한 번 더 맨 위로)', async () => {
    const w = world({ a: win() })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
    expect(only(w.calls, /^(state|move|raise)/)).toEqual(['state:a', 'state:a', 'move:a', 'state:a', 'raise:a', 'raise:a'])
    expect(rep.outcomes[0]).toMatchObject({ result: 'placed', diff: 0 })
    expect(rep.placed).toBe(1)
  })

  it('최소화 창: normalize(activate:false) 먼저, 풀린 뒤 move', async () => {
    const w = world({ a: win({ minimized: true }) })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
    const i = w.calls.indexOf('normalize:a:false')
    expect(i).toBeGreaterThan(-1)
    expect(w.calls.indexOf('sleep:120')).toBeGreaterThan(i)
    expect(w.calls.indexOf('move:a')).toBeGreaterThan(w.calls.indexOf('sleep:120'))
    expect(w.calls).not.toContain('normalize:a:true')
    expect(rep.outcomes[0].result).toBe('placed')
  })

  it('SHOWNOACTIVATE로 안 풀리는 최대화 창은 activate:true로 한 번 더', async () => {
    const w = world({ a: win({ maximized: true, stubborn: true }) })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
    expect(only(w.calls, /^normalize/)).toEqual(['normalize:a:false', 'normalize:a:true'])
    expect(w.calls).toContain('move:a')
    expect(rep.outcomes[0].result).toBe('placed')
  })

  it('끝까지 안 풀리면 failed이고 move 없음', async () => {
    const w = world({ a: win({ minimized: true, stuck: true }) })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
    expect(rep.outcomes[0].result).toBe('failed')
    expect(w.calls.some((c) => c.startsWith('move'))).toBe(false)
  })

  it('최소화 해제 뒤 사라진 창은 gone', async () => {
    const w = world({ a: win({ minimized: true, goneAfterNormalize: true }) })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
    expect(rep.outcomes[0].result).toBe('gone')
    expect(w.calls.some((c) => c.startsWith('move'))).toBe(false)
  })

  it('최대화 목표: move 뒤 maximize, 확인되면 placed', async () => {
    const w = world({ a: win() })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a', { state: 'maximized' })]))
    expect(w.calls.indexOf('maximize:a')).toBeGreaterThan(w.calls.indexOf('move:a'))
    expect(rep.outcomes[0].result).toBe('placed')
  })

  it('최대화 확인 실패는 off', async () => {
    const w = world({ a: win({ noMaximize: true }) })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a', { state: 'maximized' })]))
    expect(rep.outcomes[0].result).toBe('off')
    expect(w.calls).toContain('raise:a')
  })

  it('첫 이동이 30px 어긋나면 200ms 뒤 다시 이동해 placed', async () => {
    const w = world({ a: win({ firstOff: 30 }) })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
    expect(only(w.calls, /^move/)).toHaveLength(2)
    expect(w.calls).toContain('sleep:200')
    expect(rep.outcomes[0]).toMatchObject({ result: 'placed', diff: 0 })
  })

  it('두 번 다 25px 어긋나면 off, diff와 maxDiff 기록', async () => {
    const w = world({ a: win({ alwaysOff: 25 }) })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
    expect(rep.outcomes[0]).toMatchObject({ result: 'off', diff: 25 })
    expect(rep.maxDiff).toBe(25)
    expect(rep.placed).toBe(0)
  })

  it('frame이 그대로면 blocked(raise 없음)', async () => {
    const w = world({ a: win({ ignoreMove: true }) })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
    expect(rep.outcomes[0].result).toBe('blocked')
    expect(w.calls).not.toContain('raise:a')
  })

  it('state null은 gone, hung은 hung이고 move 없음', async () => {
    const w = world({ a: win({ gone: true }), b: win({ hung: true }) })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a'), step('b')]))
    expect(rep.outcomes.map((o) => o.result)).toEqual(['gone', 'hung'])
    expect(w.calls.some((c) => c.startsWith('move'))).toBe(false)
  })

  it('move 거부는 failed이고 다음 창은 계속', async () => {
    const w = world({ a: win({ rejectMove: true }), b: win() })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a'), step('b')]))
    expect(rep.outcomes.map((o) => o.result)).toEqual(['failed', 'placed'])
  })

  it('창마다 move가 6초 걸리면 세 번째 창부터 timeout', async () => {
    const w = world({ a: win({ moveCost: 6000 }), b: win({ moveCost: 6000 }), c: win({ moveCost: 6000 }) })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a'), step('b'), step('c')]))
    expect(rep.outcomes.map((o) => o.result)).toEqual(['placed', 'placed', 'timeout'])
    expect(w.calls).not.toContain('move:c')
  })

  it('계획의 missing·elevated 포함, total은 계획 값, 끝에 포커스는 한 번(시작 때 앞 창이 워크스페이스 밖이라 맨 위 복원 창에)', async () => {
    const w = world({ a: win() })
    const p = plan([step('a', { state: 'maximized' })], {
      total: 3,
      skipped: [
        { ruleId: 'x', app: 'Excel', reason: 'missing' },
        { ruleId: 'y', app: 'Visual Studio', reason: 'elevated' }
      ]
    })
    const rep = await createRestoreRunner(w.ports).run(p)
    expect(rep.total).toBe(3)
    expect(rep.outcomes.map((o) => o.result)).toEqual(['missing', 'elevated', 'placed'])
    expect(only(w.calls, /^fg:/)).toEqual(['fg:a'])
    expect(w.calls[w.calls.length - 1]).toBe('fg:a')
    expect(rep.restoredFocus).toBe(true)
  })

  it('raise는 placed·off에만, steps 순서(끝에 맨 위 복원 창을 한 번 더 맨 위로)', async () => {
    const w = world({ a: win(), b: win({ alwaysOff: 25 }), c: win({ hung: true }), d: win() })
    await createRestoreRunner(w.ports).run(plan([step('a'), step('b'), step('c'), step('d')]))
    expect(only(w.calls, /^raise/)).toEqual(['raise:a', 'raise:b', 'raise:d', 'raise:d'])
  })

  it('첫 이동이 30px 어긋났다 고쳐져도 maxDiff는 30', async () => {
    const w = world({ a: win({ firstOff: 30 }) })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
    expect(rep.outcomes[0].diff).toBe(0)
    expect(rep.maxDiff).toBe(30)
  })

  it('raise가 던지면 그 창만 failed로 기록하고 run은 끝까지 간다(끝의 포커스까지)', async () => {
    const w = world({ a: win({ raiseThrows: true }), b: win() })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a'), step('b', { state: 'maximized' })]))
    expect(rep.outcomes.map((o) => o.result)).toEqual(['failed', 'placed'])
    expect(only(w.calls, /^fg:/)).toEqual(['fg:b'])
  })

  it('setForeground가 던져도 report를 돌려준다', async () => {
    const w = world({ a: win() }, 'fg', { fgThrows: true })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a', { state: 'maximized' })]))
    expect(rep).toMatchObject({ focusTarget: 'workspace', restoredFocus: false, placed: 1 })
  })

  describe('끝의 포커스(2026-11-12 판정): 시작 때 앞 창이 이번에 올린 워크스페이스 창·Sure-Mate 자신의 창이면 그 창, 아니면 맨 위 복원 창', () => {
    it('시작 때 앞 창이 이번에 올린 워크스페이스 창이면 포커스를 지킨다: 복원한 창들 위로 올리기만(SWP_NOACTIVATE, SetForegroundWindow 없음)', async () => {
      const w = world({ a: win({ minimized: true }), fg: win(), b: win() })
      const rep = await createRestoreRunner(w.ports).run(plan([step('a'), step('fg'), step('b')]))
      expect(only(w.calls, /^fg:/)).toEqual([])
      // 복원한 창(z-순서대로 올림) 다음에 시작 때 창 하나만 맨 위로(그 창만 저장한 z-순서에서 벗어난다)
      expect(only(w.calls, /^raise/)).toEqual(['raise:a', 'raise:fg', 'raise:b', 'raise:fg'])
      expect(w.calls[w.calls.length - 1]).toBe('raise:fg')
      expect(rep).toMatchObject({ focusTarget: 'start', restoredFocus: true })
    })

    it('그 창이 앞 창이 아니게 됐으면(최대화·SW_RESTORE·스스로 나온 창) 맨 위로 올린 뒤 포커스를 한 번 준다', async () => {
      const w = world({ fg: win(), a: win(), b: win() })
      const ports = { ...w.ports, raise: (h: string) => (w.ports.raise(h), h === 'a' ? w.activate('popup') : undefined) }
      const rep = await createRestoreRunner(ports).run(plan([step('fg'), step('a'), step('b')]))
      expect(only(w.calls, /^fg:/)).toEqual(['fg:fg'])
      expect(w.calls.slice(-2)).toEqual(['raise:fg', 'fg:fg'])
      expect(rep).toMatchObject({ focusTarget: 'start', restoredFocus: true })
    })

    it('끝에 앞 창을 읽지 못하면(던짐) 앞 창이 아닌 것으로 보고 포커스도 준다', async () => {
      const w = world({ fg: win(), a: win() })
      let reads = 0
      const ports = { ...w.ports, foreground: () => (++reads > 1 ? (() => { throw new Error('fg') })() : w.ports.foreground()) }
      const rep = await createRestoreRunner(ports).run(plan([step('fg'), step('a')]))
      expect(w.calls.slice(-2)).toEqual(['raise:fg', 'fg:fg'])
      expect(rep).toMatchObject({ focusTarget: 'start', restoredFocus: true })
    })

    it('시작 때 앞 창이 Sure-Mate 자신의 설정 창이면 포커스를 지킨다(가려지면 Enter·Space가 가려진 불러오기를 다시 누른다)', async () => {
      const w = world({ a: win(), b: win() }, 'settings', { own: ['settings'] })
      const rep = await createRestoreRunner(w.ports).run(plan([step('a'), step('b', { state: 'maximized' })]))
      // 최대화가 b를 앞 창으로 만들었으므로 설정 창을 맨 위로 올리고 포커스를 돌려준다
      expect(only(w.calls, /^fg:/)).toEqual(['fg:settings'])
      expect(w.calls.slice(-2)).toEqual(['raise:settings', 'fg:settings'])
      expect(rep).toMatchObject({ focusTarget: 'start', restoredFocus: true })
    })

    it('시작 때 앞 창이 워크스페이스 밖의 다른 앱 창이면 맨 위 복원 창(마지막에 올린 창)에 포커스를 주고 시작 때 창은 올리지 않는다', async () => {
      const w = world({ a: win(), b: win() }, 'messenger')
      const rep = await createRestoreRunner(w.ports).run(plan([step('a'), step('b')]))
      expect(only(w.calls, /^(raise|fg):/)).toEqual(['raise:a', 'raise:b', 'raise:b', 'fg:b'])
      expect(w.ports.foreground()).toBe('b')
      expect(rep).toMatchObject({ focusTarget: 'workspace', restoredFocus: true })
    })

    it('시작 때 앞 창이 없으면(null) 맨 위 복원 창에 포커스를 준다', async () => {
      const w = world({ a: win(), b: win() }, null)
      const rep = await createRestoreRunner(w.ports).run(plan([step('a'), step('b')]))
      expect(w.calls.slice(-2)).toEqual(['raise:b', 'fg:b'])
      expect(rep).toMatchObject({ focusTarget: 'workspace', restoredFocus: true })
    })

    it('시작 때 앞 창이 사라졌거나 숨었거나 포커스를 받지 않는 Sure-Mate 창(숨은 팔레트·조종이 끝난 펫)이면 그 창은 올리지 않고 맨 위 복원 창에 포커스를 준다', async () => {
      const w = world({ a: win({ maximized: true }) }, 'fg', { notFocusable: ['fg'], own: ['fg'] })
      const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
      expect(only(w.calls, /^(raise|fg):fg/)).toEqual([])
      expect(w.calls.slice(-2)).toEqual(['raise:a', 'fg:a'])
      expect(rep).toMatchObject({ focusTarget: 'workspace', restoredFocus: true })
    })

    it('시작 때 앞 창이 워크스페이스 창이어도 이번에 올리지 못했으면(옮겨지지 않음) 맨 위 복원 창에 포커스를 준다', async () => {
      const w = world({ a: win(), fg: win({ ignoreMove: true }) })
      const rep = await createRestoreRunner(w.ports).run(plan([step('a'), step('fg')]))
      expect(rep.outcomes.map((o) => o.result)).toEqual(['placed', 'blocked'])
      expect(only(w.calls, /^(raise|fg):/)).toEqual(['raise:a', 'raise:a', 'fg:a'])
      expect(rep).toMatchObject({ focusTarget: 'workspace', restoredFocus: true })
    })

    it('올린 창이 없으면(모두 사라짐·옮겨지지 않음·실패) 예전처럼 시작 때 앞 창을 맨 위로 올린다', async () => {
      const w = world({ a: win({ gone: true }), b: win({ ignoreMove: true }), c: win({ rejectMove: true }) }, 'messenger')
      const rep = await createRestoreRunner(w.ports).run(plan([step('a'), step('b'), step('c')]))
      expect(rep.outcomes.map((o) => o.result)).toEqual(['gone', 'blocked', 'failed'])
      // 앞 창이 그대로라 올리기만 한다
      expect(only(w.calls, /^(raise|fg):/)).toEqual(['raise:messenger'])
      expect(rep).toMatchObject({ focusTarget: 'start', restoredFocus: true })
    })

    it('올린 창이 없는데 다른 창이 앞으로 나왔으면(SW_RESTORE) 시작 때 앞 창을 올리고 포커스를 돌려준다', async () => {
      const w = world({ a: win({ minimized: true, stuck: true }) }, 'messenger')
      const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
      expect(rep.outcomes[0].result).toBe('failed')
      expect(only(w.calls, /^(raise|fg):/)).toEqual(['raise:messenger', 'fg:messenger'])
      expect(rep).toMatchObject({ focusTarget: 'start', restoredFocus: true })
    })

    it('화면 감추기가 내린 시작 창(hidden)은 돌려줄 창이 아니다: 올린 창이 있으면 맨 위 복원 창, 없으면 아무 창도 올리지 않는다(최소화된 창에 포커스를 주지 않게)', async () => {
      const w = world({ a: win(), b: win() }, 'messenger')
      const rep = await createRestoreRunner(w.ports).run(plan([step('a'), step('b')]), { hidden: new Set(['messenger']) })
      expect(only(w.calls, /^(raise|fg):/)).toEqual(['raise:a', 'raise:b', 'raise:b', 'fg:b'])
      expect(rep).toMatchObject({ focusTarget: 'workspace', restoredFocus: true })

      const none = world({ a: win({ gone: true }) }, 'messenger')
      const rep2 = await createRestoreRunner(none.ports).run(plan([step('a')]), { hidden: new Set(['messenger']) })
      expect(only(none.calls, /^(raise|fg):/)).toEqual([])
      expect(rep2).toMatchObject({ focusTarget: null, restoredFocus: false })
    })

    it('올린 창도 없고 시작 때 앞 창도 돌려줄 수 없으면(없음·포커스를 받지 않음) 아무 창도 올리지 않는다(focusTarget null)', async () => {
      const hidden = world({ a: win({ gone: true }) }, 'fg', { notFocusable: ['fg'] })
      const none = world({ a: win({ gone: true }) }, null)
      for (const w of [hidden, none]) {
        const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
        expect(only(w.calls, /^(raise|fg):/)).toEqual([])
        expect(rep).toMatchObject({ focusTarget: null, restoredFocus: false })
      }
    })

    it('앞 창 그대로인데 올리기가 던지면 restoredFocus false(가려졌을 수 있다)', async () => {
      const w = world({ a: win() }, 'settings', { own: ['settings'] })
      const ports = { ...w.ports, raise: (h: string) => (h === 'settings' ? (() => { throw new Error('raise') })() : w.ports.raise(h)) }
      const rep = await createRestoreRunner(ports).run(plan([step('a')]))
      expect(rep).toMatchObject({ focusTarget: 'start', restoredFocus: false, placed: 1 })
    })

    it('자신의 창인지 읽지 못하면(던짐) 다른 앱 창으로 보고 맨 위 복원 창에 포커스를 준다', async () => {
      const w = world({ a: win() }, 'settings', { own: ['settings'] })
      const ports = { ...w.ports, own: (): boolean => { throw new Error('own') } }
      const rep = await createRestoreRunner(ports).run(plan([step('a')]))
      expect(w.calls.slice(-2)).toEqual(['raise:a', 'fg:a'])
      expect(rep.focusTarget).toBe('workspace')
    })

    it('판단 표(chooseFocus): 올린 워크스페이스 창·자신의 창이면 start, 그 밖은 맨 위 복원 창(workspace), 올린 창이 없으면 예전 규칙', () => {
      const base = { remembered: 'm', focusable: true, own: false, raised: ['x', 'y'], foreground: 'm' }
      // 1. 이번에 올린 워크스페이스 창: 아직 앞 창이면 올리기만(raise), 아니거나 읽지 못하면(null) 올리고 포커스(focus)
      expect(chooseFocus({ ...base, remembered: 'x', foreground: 'x' })).toEqual({ target: 'start', hwnd: 'x', action: 'raise' })
      expect(chooseFocus({ ...base, remembered: 'x', foreground: 'y' })).toEqual({ target: 'start', hwnd: 'x', action: 'focus' })
      expect(chooseFocus({ ...base, remembered: 'x', foreground: null })).toEqual({ target: 'start', hwnd: 'x', action: 'focus' })
      // 1. 포커스를 받을 수 있는 Sure-Mate 자신의 창(설정·첫 실행 안내 창)
      expect(chooseFocus({ ...base, own: true })).toEqual({ target: 'start', hwnd: 'm', action: 'raise' })
      // 2. 워크스페이스 밖의 다른 앱 창, 시작 때 앞 창 없음, 돌려줄 수 없는 창(자신의 창·올린 창이어도): 마지막에 올린 창에 포커스.
      //    그 창이 이미 앞 창이어도 포커스를 준다
      expect(chooseFocus(base)).toEqual({ target: 'workspace', hwnd: 'y', action: 'focus' })
      expect(chooseFocus({ ...base, remembered: null })).toEqual({ target: 'workspace', hwnd: 'y', action: 'focus' })
      expect(chooseFocus({ ...base, focusable: false, own: true })).toEqual({ target: 'workspace', hwnd: 'y', action: 'focus' })
      expect(chooseFocus({ ...base, remembered: 'x', focusable: false })).toEqual({ target: 'workspace', hwnd: 'y', action: 'focus' })
      expect(chooseFocus({ ...base, foreground: 'y' })).toEqual({ target: 'workspace', hwnd: 'y', action: 'focus' })
      // 3. 올린 창이 없으면 예전 규칙: 돌려줄 수 있으면 시작 때 앞 창, 없으면 아무것도 하지 않는다
      expect(chooseFocus({ ...base, raised: [] })).toEqual({ target: 'start', hwnd: 'm', action: 'raise' })
      expect(chooseFocus({ ...base, raised: [], foreground: null })).toEqual({ target: 'start', hwnd: 'm', action: 'focus' })
      expect(chooseFocus({ ...base, raised: [], focusable: false })).toEqual({ target: null })
      expect(chooseFocus({ ...base, raised: [], remembered: null })).toEqual({ target: null })
    })
  })

  it('Sure-Mate 자신의 숨은 창·포커스를 받지 않는 창(바·펼침 창, 조종이 끝난 펫)에는 포커스를 돌려주지 않는다', () => {
    const own = [
      { hwnd: '1', visible: false, focusable: true },
      { hwnd: '2', visible: true, focusable: false },
      { hwnd: '3', visible: true, focusable: true }
    ]
    expect(unfocusableOwnWindow('1', own)).toBe(true)
    expect(unfocusableOwnWindow('2', own)).toBe(true)
    // 보이는 설정 창, 다른 앱 창
    expect(unfocusableOwnWindow('3', own)).toBe(false)
    expect(unfocusableOwnWindow('99', own)).toBe(false)
  })

  it('옮겨지지 않은 창(blocked)은 계획의 관리자 권한 여부를 결과에 싣는다(알림이 까닭을 고른다, A-M3)', async () => {
    const w = world({ a: win({ ignoreMove: true }), b: win({ ignoreMove: true }) })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a', { elevated: null }), step('b', { elevated: false })]))
    expect(rep.outcomes.map((o) => [o.result, o.elevated])).toEqual([
      ['blocked', null],
      ['blocked', false]
    ])
  })
})
