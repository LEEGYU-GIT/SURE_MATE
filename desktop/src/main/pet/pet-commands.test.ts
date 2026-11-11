import { describe, expect, it, vi } from 'vitest'
import { PET_HIDDEN_NOTICE } from '../../shared/pet/pet-copy'
import { HotkeyManager, type ShortcutBackend } from '../hotkeys/hotkey-manager'
import { createPetCommands, createPetControlHotkey, petCommandItems } from './pet-commands'

function fake(
  over: { visible?: boolean; keysHeld?: boolean; setFails?: boolean; refocus?: () => Promise<boolean>; sleepOk?: boolean; wakeOk?: boolean } = {}
): {
  run: (id: string) => Promise<boolean>
  calls: string[]
  notes: string[]
  logs: [string, Record<string, unknown>][]
} {
  const calls: string[] = []
  const notes: string[] = []
  const logs: [string, Record<string, unknown>][] = []
  let visible = over.visible ?? true
  const c = createPetCommands({
    isVisible: () => visible,
    setVisible: async (v) => {
      if (over.setFails) throw new Error('disk')
      visible = v
      calls.push(`set:${v}`)
    },
    toggleControl: () => calls.push('control'),
    putToSleep: () => {
      calls.push('sleep')
      return over.sleepOk ?? true
    },
    wakeUp: () => {
      calls.push('wake')
      return over.wakeOk ?? true
    },
    waitKeysReleased: async () => {
      calls.push('wait')
      return !over.keysHeld
    },
    hidePalette: (restore) => calls.push(`hide:${restore}`),
    hidePaletteAndRefocus: async () => {
      calls.push('refocus')
      return over.refocus ? over.refocus() : true
    },
    notify: (m) => notes.push(m),
    log: (e, data) => {
      calls.push(`log:${e}`)
      logs.push([e, data])
    }
  })
  return { run: c.run, calls, notes, logs }
}

it('항목: 보이면 숨기기·조종하기·재우기, 숨겼으면 보이기만', () => {
  const shown = petCommandItems({ visible: true, sleeping: false })
  expect(shown.map((i) => i.id)).toEqual(['cmd.pet-visible', 'cmd.pet-control', 'cmd.pet-sleep'])
  expect(shown[0]).toMatchObject({ group: 'command', title: '말랑 메이트 숨기기' })
  expect(shown[0].keywords).toEqual(expect.arrayContaining(['pet', '펫', '말랑', '메이트', '숨기기', '보이기']))
  expect(shown[1]).toMatchObject({ title: '말랑 메이트 조종하기', subtitle: '←→ 걷기 · Space 뛰기 · ↑↓ 바 오르내리기 · Esc 끝' })
  expect(shown[2]).toMatchObject({ group: 'command', title: '말랑 메이트 재우기' })
  const hidden = petCommandItems({ visible: false, sleeping: false })
  expect(hidden.map((i) => [i.id, i.title])).toEqual([['cmd.pet-visible', '말랑 메이트 보이기']])
})

it('(M4) 항목: 재우기·깨우기는 지금 상태를 따른다(졸고 있으면 깨우기). 영문으로도 찾는다', () => {
  const asleep = petCommandItems({ visible: true, sleeping: true })
  expect(asleep.map((i) => [i.id, i.title])).toEqual([
    ['cmd.pet-visible', '말랑 메이트 숨기기'],
    ['cmd.pet-control', '말랑 메이트 조종하기'],
    ['cmd.pet-wake', '말랑 메이트 깨우기']
  ])
  for (const item of [asleep[2], petCommandItems({ visible: true, sleeping: false })[2]]) {
    expect(item.keywords).toEqual(expect.arrayContaining(['pet', '펫', '말랑', '메이트', '재우기', '깨우기', 'sleep', 'wake']))
  }
})

it('(M4) 재우기·깨우기: 키를 뗀 것을 확인하고 팔레트를 숨긴 뒤 펫을 재우거나 깨운다(알림 없음, 기록은 결과만)', async () => {
  const f = fake()
  expect(await f.run('cmd.pet-sleep')).toBe(true)
  expect(f.calls.slice(0, 3)).toEqual(['wait', 'hide:true', 'sleep'])
  const w = fake()
  expect(await w.run('cmd.pet-wake')).toBe(true)
  expect(w.calls.slice(0, 3)).toEqual(['wait', 'hide:true', 'wake'])
  expect([...f.notes, ...w.notes]).toEqual([])
  expect([...f.logs, ...w.logs]).toEqual([
    ['pet.sleepCommand', { sleep: true, ok: true }],
    ['pet.sleepCommand', { sleep: false, ok: true }]
  ])
})

it('(M4) 재우기·깨우기: 키를 떼지 않았으면 팔레트는 남기고(자동 반복 Enter가 원래 앱으로 가지 않게) 상태는 바꾼다', async () => {
  const f = fake({ keysHeld: true })
  await f.run('cmd.pet-sleep')
  expect(f.calls.filter((c) => c.startsWith('hide:'))).toHaveLength(0)
  expect(f.calls).toContain('sleep')
})

it('(M4) 움직이는 중·숨은 펫이라 재우거나 깨우지 못하면 한 번 알린다', async () => {
  const f = fake({ sleepOk: false })
  await f.run('cmd.pet-sleep')
  expect(f.notes).toEqual(['지금은 재울 수 없어요. 말랑 메이트가 바닥이나 바 위에 있을 때 다시 해 주세요.'])
  const w = fake({ wakeOk: false })
  await w.run('cmd.pet-wake')
  expect(w.notes).toEqual(['지금은 깨울 수 없어요. 말랑 메이트가 보일 때 다시 해 주세요.'])
})

it('숨기기: 키를 뗀 것을 확인하고 팔레트를 숨긴 뒤 저장한다', async () => {
  const f = fake()
  expect(await f.run('cmd.pet-visible')).toBe(true)
  expect(f.calls.slice(0, 3)).toEqual(['wait', 'hide:true', 'set:false'])
  expect(f.notes).toEqual(['말랑 메이트를 숨겼어요. 바의 펫 단추나 트레이에서 다시 불러요.'])
})

it('보이기: 알림은 나왔다는 말', async () => {
  const f = fake({ visible: false })
  await f.run('cmd.pet-visible')
  expect(f.calls.slice(0, 3)).toEqual(['wait', 'hide:true', 'set:true'])
  expect(f.notes).toEqual(['말랑 메이트가 나왔어요.'])
})

it('키를 떼지 않았으면 숨기지 않지만 값은 바꾼다', async () => {
  const f = fake({ keysHeld: true })
  expect(await f.run('cmd.pet-visible')).toBe(true)
  expect(f.calls.filter((c) => c.startsWith('hide:'))).toHaveLength(0)
  expect(f.calls.filter((c) => c.startsWith('set:'))).toEqual(['set:false'])
})

it('(I1) 조종: 팔레트를 숨기고 원래 창이 앞에 올 때까지(최대 80ms) 기다린 뒤 시작한다(조종이 팔레트를 돌아갈 창으로 기억하지 않게)', async () => {
  let landed: (ok: boolean) => void = () => {}
  const f = fake({ refocus: () => new Promise<boolean>((r) => (landed = r)) })
  const running = f.run('cmd.pet-control')
  await Promise.resolve()
  await Promise.resolve()
  expect(f.calls).toEqual(['wait', 'refocus'])
  landed(true)
  expect(await running).toBe(true)
  expect(f.calls.slice(0, 3)).toEqual(['wait', 'refocus', 'control'])
  expect(f.calls.filter((c) => c.startsWith('hide:'))).toHaveLength(0)
  expect(f.notes).toEqual([])
})

it('(I1) 조종: 원래 창이 80ms 안에 앞에 오지 않아도 시작한다(조종은 숨은 팔레트 대신 팔레트가 돌아갈 창을 기억한다)', async () => {
  const f = fake({ refocus: async () => false })
  await f.run('cmd.pet-control')
  expect(f.calls.slice(0, 3)).toEqual(['wait', 'refocus', 'control'])
})

it('(M5) 조종: 명령은 켜고 끄기다(이미 조종 중이면 끝낸다: 포커스를 받지 못해 남은 조종도 키보드로 끝낼 수 있다)', async () => {
  const f = fake()
  await f.run('cmd.pet-control')
  await f.run('cmd.pet-control')
  expect(f.calls.filter((c) => c === 'control')).toHaveLength(2)
})

it('조종: 키를 떼지 않았으면 시작하지 않고 알림 한 번', async () => {
  const f = fake({ keysHeld: true })
  expect(await f.run('cmd.pet-control')).toBe(true)
  expect(f.calls).not.toContain('control')
  expect(f.calls).not.toContain('refocus')
  expect(f.calls.filter((c) => c.startsWith('hide:'))).toHaveLength(0)
  expect(f.notes).toEqual(['키를 뗀 뒤 다시 실행해 주세요.'])
})

it('조종: 펫을 숨긴 상태면 시작하지 않는다', async () => {
  const f = fake({ visible: false })
  expect(await f.run('cmd.pet-control')).toBe(true)
  expect(f.calls).not.toContain('control')
})

it('다른 id는 false, 저장이 실패해도 true로 알린다', async () => {
  expect(await fake().run('cmd.unmask')).toBe(false)
  const f = fake({ setFails: true })
  expect(await f.run('cmd.pet-visible')).toBe(true)
  expect(f.notes).toHaveLength(1)
})

describe('조종 단축키(설계 §14-2): 숨긴 펫은 조종하지 않고 다시 부르는 곳을 알린다', () => {
  function hotkey(visible: boolean) {
    const calls: string[] = []
    const notes: string[] = []
    const logs: [string, Record<string, unknown>][] = []
    const state = { visible }
    const press = createPetControlHotkey({
      isVisible: () => state.visible,
      toggleControl: () => calls.push('toggle'),
      notify: (m) => notes.push(m),
      log: (e, d) => void logs.push([e, d])
    })
    return { press, calls, notes, logs, state }
  }

  it('알림 문구', () => {
    expect(PET_HIDDEN_NOTICE).toBe('말랑 메이트가 숨어 있어요. 트레이나 바의 펫 단추로 불러 주세요.')
  })

  it('보이면 조종을 켜고 끈다(알림 없음)', () => {
    const h = hotkey(true)
    h.press()
    h.press()
    expect(h.calls).toEqual(['toggle', 'toggle'])
    expect(h.notes).toEqual([])
  })

  it('숨겼으면 조종을 시작하지 않고 누를 때마다 한 번 알린다(로그는 숨김 여부만)', () => {
    const h = hotkey(false)
    h.press()
    expect(h.calls).toEqual([])
    expect(h.notes).toEqual([PET_HIDDEN_NOTICE])
    h.press()
    expect(h.notes).toEqual([PET_HIDDEN_NOTICE, PET_HIDDEN_NOTICE])
    expect(h.logs).toEqual([
      ['pet.controlHotkey', { hidden: true }],
      ['pet.controlHotkey', { hidden: true }]
    ])
    // 다시 보이면 조종한다
    h.state.visible = true
    h.press()
    expect(h.calls).toEqual(['toggle'])
  })

  it('누르고 있는 동안의 자동 반복에는 한 번만 알린다(단축키 관리자가 반복을 거른다)', () => {
    vi.useFakeTimers()
    try {
      const registered = new Map<string, () => void>()
      const backend: ShortcutBackend = {
        register: (acc, cb) => {
          registered.set(acc, cb)
          return true
        },
        unregister: (acc) => void registered.delete(acc)
      }
      let held = true
      const manager = new HotkeyManager(backend, () => Date.now(), () => held)
      const h = hotkey(false)
      manager.bind('pet-control', 'Ctrl+Alt+P', h.press)
      const fire = (): void => registered.get('Ctrl+Alt+P')?.()
      fire()
      vi.advanceTimersByTime(500)
      for (let i = 0; i < 20; i++) {
        fire()
        vi.advanceTimersByTime(33)
      }
      expect(h.notes).toHaveLength(1)
      held = false
      vi.advanceTimersByTime(300)
      held = true
      fire()
      expect(h.notes).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
