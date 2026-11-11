import { expect, it } from 'vitest'
import { createPetCommands, petCommandItems } from './pet-commands'

function fake(over: { visible?: boolean; keysHeld?: boolean; setFails?: boolean } = {}): { run: (id: string) => Promise<boolean>; calls: string[]; notes: string[] } {
  const calls: string[] = []
  const notes: string[] = []
  let visible = over.visible ?? true
  const c = createPetCommands({
    isVisible: () => visible,
    setVisible: async (v) => {
      if (over.setFails) throw new Error('disk')
      visible = v
      calls.push(`set:${v}`)
    },
    startControl: () => calls.push('control'),
    waitKeysReleased: async () => {
      calls.push('wait')
      return !over.keysHeld
    },
    hidePalette: (restore) => calls.push(`hide:${restore}`),
    notify: (m) => notes.push(m),
    log: (e) => calls.push(`log:${e}`)
  })
  return { run: c.run, calls, notes }
}

it('항목: 보이면 숨기기와 조종하기, 숨겼으면 보이기만', () => {
  const shown = petCommandItems({ visible: true })
  expect(shown.map((i) => i.id)).toEqual(['cmd.pet-visible', 'cmd.pet-control'])
  expect(shown[0]).toMatchObject({ group: 'command', title: '말랑 메이트 숨기기' })
  expect(shown[0].keywords).toEqual(expect.arrayContaining(['pet', '펫', '말랑', '메이트', '숨기기', '보이기']))
  expect(shown[1]).toMatchObject({ title: '말랑 메이트 조종하기', subtitle: '←→ 걷기 · Space 뛰기 · ↑↓ 바 오르내리기 · Esc 끝' })
  const hidden = petCommandItems({ visible: false })
  expect(hidden.map((i) => [i.id, i.title])).toEqual([['cmd.pet-visible', '말랑 메이트 보이기']])
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

it('조종: 팔레트를 숨긴 뒤 시작한다', async () => {
  const f = fake()
  expect(await f.run('cmd.pet-control')).toBe(true)
  expect(f.calls.slice(0, 3)).toEqual(['wait', 'hide:true', 'control'])
  expect(f.notes).toEqual([])
})

it('조종: 키를 떼지 않았으면 시작하지 않고 알림 한 번', async () => {
  const f = fake({ keysHeld: true })
  expect(await f.run('cmd.pet-control')).toBe(true)
  expect(f.calls).not.toContain('control')
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
