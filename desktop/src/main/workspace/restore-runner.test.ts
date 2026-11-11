import { describe, expect, it } from 'vitest'
import type { Rect } from '../../shared/types'
import type { ReadyPlan, RestoreStep } from '../../shared/workspace/restore-plan'
import { createRestoreRunner, focusReturn, type RestorePorts, unfocusableOwnWindow } from './restore-runner'

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
 * 가짜 창 세계. fg는 시작 때 앞 창이고, 최대화(SW_SHOWMAXIMIZED)와 activate:true 복원(SW_RESTORE)은 실제처럼 그 창을 앞 창으로 만든다
 * (activate:false 복원·이동·raise(SWP_NOACTIVATE)는 앞 창을 바꾸지 않는다). notFocusable은 사라졌거나 숨었거나 포커스를 받지 않는 창
 */
interface World {
  ports: RestorePorts
  calls: string[]
  clock(): number
  activate(h: string | null): void
}

function world(wins: Record<string, Win>, fg: string | null = 'fg', opts: { fgThrows?: boolean; notFocusable?: string[] } = {}): World {
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
  it('보통 창: state → move → state → raise(끝에 시작 때 앞 창을 맨 위로)', async () => {
    const w = world({ a: win() })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
    expect(only(w.calls, /^(state|move|raise)/)).toEqual(['state:a', 'state:a', 'move:a', 'state:a', 'raise:a', 'raise:fg'])
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

  it('계획의 missing·elevated 포함, total은 계획 값, 최대화가 앞 창을 바꿨으면 끝에 포커스 복귀 한 번', async () => {
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
    expect(only(w.calls, /^fg:/)).toEqual(['fg:fg'])
    expect(w.calls[w.calls.length - 1]).toBe('fg:fg')
    expect(rep.restoredFocus).toBe(true)
  })

  it('foreground가 null이면 setForeground 호출 없음', async () => {
    const w = world({ a: win() }, null)
    const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
    expect(only(w.calls, /^fg:/)).toEqual([])
    expect(rep.restoredFocus).toBe(false)
  })

  it('raise는 placed·off에만, steps 순서(끝에 시작 때 앞 창을 한 번 더 맨 위로)', async () => {
    const w = world({ a: win(), b: win({ alwaysOff: 25 }), c: win({ hung: true }), d: win() })
    await createRestoreRunner(w.ports).run(plan([step('a'), step('b'), step('c'), step('d')]))
    expect(only(w.calls, /^raise/)).toEqual(['raise:a', 'raise:b', 'raise:d', 'raise:fg'])
  })

  it('첫 이동이 30px 어긋났다 고쳐져도 maxDiff는 30', async () => {
    const w = world({ a: win({ firstOff: 30 }) })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
    expect(rep.outcomes[0].diff).toBe(0)
    expect(rep.maxDiff).toBe(30)
  })

  it('raise가 던지면 그 창만 failed로 기록하고 run은 끝까지 간다(포커스 복귀까지)', async () => {
    const w = world({ a: win({ raiseThrows: true }), b: win() })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a'), step('b', { state: 'maximized' })]))
    expect(rep.outcomes.map((o) => o.result)).toEqual(['failed', 'placed'])
    expect(only(w.calls, /^fg:/)).toEqual(['fg:fg'])
  })

  it('setForeground가 던져도 report를 돌려준다', async () => {
    const w = world({ a: win() }, 'fg', { fgThrows: true })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a', { state: 'maximized' })]))
    expect(rep.restoredFocus).toBe(false)
    expect(rep.placed).toBe(1)
  })

  describe('끝의 포커스 복귀(2026-11-11 판정): 시작 때 앞 창을 맨 위로 올리고 앞 창이 아니면 포커스를 준다', () => {
    it('앞 창이 그대로여도 복원한 창들 위로 올린다(SWP_NOACTIVATE, SetForegroundWindow 없음). restoredFocus true', async () => {
      const w = world({ a: win({ minimized: true }), b: win() })
      const rep = await createRestoreRunner(w.ports).run(plan([step('a'), step('b')]))
      expect(only(w.calls, /^fg:/)).toEqual([])
      // 복원한 창(z-순서대로 올림) 다음에 시작 때 창 하나만 맨 위로
      expect(only(w.calls, /^raise/)).toEqual(['raise:a', 'raise:b', 'raise:fg'])
      expect(w.calls[w.calls.length - 1]).toBe('raise:fg')
      expect(rep.restoredFocus).toBe(true)
    })

    it('다른 창이 앞으로 나왔으면(최대화·SW_RESTORE·스스로 나온 창) 맨 위로 올린 뒤 포커스를 한 번 준다', async () => {
      const w = world({ a: win(), b: win() })
      const ports = { ...w.ports, raise: (h: string) => (w.ports.raise(h), h === 'a' ? w.activate('popup') : undefined) }
      const rep = await createRestoreRunner(ports).run(plan([step('a'), step('b')]))
      expect(only(w.calls, /^fg:/)).toEqual(['fg:fg'])
      expect(w.calls.slice(-2)).toEqual(['raise:fg', 'fg:fg'])
      expect(rep.restoredFocus).toBe(true)
    })

    it('끝에 앞 창을 읽지 못하면(던짐) 앞 창이 아닌 것으로 보고 포커스도 준다', async () => {
      const w = world({ a: win() })
      let reads = 0
      const ports = { ...w.ports, foreground: () => (++reads > 1 ? (() => { throw new Error('fg') })() : w.ports.foreground()) }
      const rep = await createRestoreRunner(ports).run(plan([step('a')]))
      expect(w.calls.slice(-2)).toEqual(['raise:fg', 'fg:fg'])
      expect(rep.restoredFocus).toBe(true)
    })

    it('시작 때 앞 창이 사라졌거나 숨었거나 포커스를 받지 않는 Sure-Mate 창이면 올리지도 포커스를 주지도 않는다(restoredFocus false)', async () => {
      const w = world({ a: win({ maximized: true }) }, 'fg', { notFocusable: ['fg'] })
      const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
      expect(only(w.calls, /^(raise|fg):fg/)).toEqual([])
      expect(rep.restoredFocus).toBe(false)
    })

    it('앞 창 그대로인데 올리기가 던지면 restoredFocus false(가려졌을 수 있다)', async () => {
      const w = world({ a: win() })
      const ports = { ...w.ports, raise: (h: string) => (h === 'fg' ? (() => { throw new Error('raise') })() : w.ports.raise(h)) }
      const rep = await createRestoreRunner(ports).run(plan([step('a')]))
      expect(rep.restoredFocus).toBe(false)
      expect(rep.placed).toBe(1)
    })

    it('판단 표: 시작 때 앞 창이 없거나 돌려줄 수 없으면 none, 아직 앞 창이면 raise(올리기만), 아니거나 읽지 못하면(null) focus(올리고 포커스)', () => {
      expect(focusReturn({ remembered: null, focusable: true, foreground: 'a' })).toBe('none')
      expect(focusReturn({ remembered: 'a', focusable: false, foreground: 'a' })).toBe('none')
      expect(focusReturn({ remembered: 'a', focusable: true, foreground: 'a' })).toBe('raise')
      expect(focusReturn({ remembered: 'a', focusable: true, foreground: 'b' })).toBe('focus')
      expect(focusReturn({ remembered: 'a', focusable: true, foreground: null })).toBe('focus')
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
