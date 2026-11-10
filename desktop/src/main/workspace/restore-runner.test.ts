import { describe, expect, it } from 'vitest'
import type { Rect } from '../../shared/types'
import type { ReadyPlan, RestoreStep } from '../../shared/workspace/restore-plan'
import { createRestoreRunner, type RestorePorts } from './restore-runner'

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

function world(wins: Record<string, Win>, fg: string | null = 'fg', opts: { fgThrows?: boolean } = {}) {
  const calls: string[] = []
  let clock = 0
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
      if (!wins[h].noMaximize) wins[h].maximized = true
    },
    raise: (h) => {
      calls.push(`raise:${h}`)
      if (wins[h].raiseThrows) throw new Error('raise')
    },
    toPhysical: (d) => d,
    foreground: () => fg,
    setForeground: (h) => {
      calls.push(`fg:${h}`)
      if (opts.fgThrows) throw new Error('fg')
      return true
    },
    sleep: async (ms) => {
      calls.push(`sleep:${ms}`)
      clock += ms
    },
    now: () => clock
  }
  return { ports, calls, clock: () => clock }
}

const step = (id: string, extra: Partial<RestoreStep> = {}): RestoreStep => ({
  ruleId: id,
  app: id.toUpperCase(),
  hwnd: id,
  target: R(100, 100),
  dpi: 96,
  state: 'normal',
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
  it('보통 창: state → move → state → raise', async () => {
    const w = world({ a: win() })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
    expect(only(w.calls, /^(state|move|raise)/)).toEqual(['state:a', 'state:a', 'move:a', 'state:a', 'raise:a'])
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

  it('계획의 missing·elevated 포함, total은 계획 값, 포커스 복귀 한 번', async () => {
    const w = world({ a: win() })
    const p = plan([step('a')], {
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

  it('raise는 placed·off에만, steps 순서', async () => {
    const w = world({ a: win(), b: win({ alwaysOff: 25 }), c: win({ hung: true }), d: win() })
    await createRestoreRunner(w.ports).run(plan([step('a'), step('b'), step('c'), step('d')]))
    expect(only(w.calls, /^raise/)).toEqual(['raise:a', 'raise:b', 'raise:d'])
  })

  it('첫 이동이 30px 어긋났다 고쳐져도 maxDiff는 30', async () => {
    const w = world({ a: win({ firstOff: 30 }) })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
    expect(rep.outcomes[0].diff).toBe(0)
    expect(rep.maxDiff).toBe(30)
  })

  it('raise가 던지면 그 창만 failed로 기록하고 run은 끝까지 간다', async () => {
    const w = world({ a: win({ raiseThrows: true }), b: win() })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a'), step('b')]))
    expect(rep.outcomes.map((o) => o.result)).toEqual(['failed', 'placed'])
    expect(only(w.calls, /^fg:/)).toEqual(['fg:fg'])
  })

  it('setForeground가 던져도 report를 돌려준다', async () => {
    const w = world({ a: win() }, 'fg', { fgThrows: true })
    const rep = await createRestoreRunner(w.ports).run(plan([step('a')]))
    expect(rep.restoredFocus).toBe(false)
    expect(rep.placed).toBe(1)
  })
})
