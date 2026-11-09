import { expect, it } from 'vitest'
import type { BarShape } from '../../shared/bar/bar-settings'
import { barCommandItems, createBarCommands } from './bar-commands'

function fake(over: { shape?: BarShape; keysHeld?: boolean; setFails?: boolean } = {}): { run: (id: string) => Promise<boolean>; calls: string[]; notes: string[] } {
  const calls: string[] = []
  const notes: string[] = []
  let shape: BarShape = over.shape ?? 'edge'
  const c = createBarCommands({
    getShape: () => shape,
    setShape: async (s) => {
      if (over.setFails) throw new Error('disk')
      shape = s
      calls.push(`set:${s}`)
    },
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

it('항목: 지금 모양과 누르면 바뀔 모양을 부제로', () => {
  expect(barCommandItems('edge')).toMatchObject([{ id: 'cmd.bar-shape', group: 'command', title: 'Sure-Mate 바 모양 바꾸기', subtitle: '지금: 가장자리 띠 · 누르면 떠 있는 캡슐' }])
  expect(barCommandItems('off')[0].subtitle).toBe('지금: 끔 · 누르면 가장자리 띠')
  expect(barCommandItems('edge')[0].keywords).toEqual(['bar', '바', '사이드바', '모양', '숨기기'])
})

it('실행: 키를 뗀 것을 확인하고 팔레트를 숨긴 뒤 다음 모양으로 바꾼다', async () => {
  const f = fake()
  expect(await f.run('cmd.bar-shape')).toBe(true)
  expect(f.calls.slice(0, 3)).toEqual(['wait', 'hide:true', 'set:capsule'])
  expect(f.calls.filter((c) => c.startsWith('hide:'))).toHaveLength(1)
  expect(f.calls.filter((c) => c.startsWith('set:'))).toHaveLength(1)
  expect(f.notes).toEqual(['Sure-Mate 바: 떠 있는 캡슐'])
})

it('끔으로 바꾸면 다시 켜는 곳을 알린다', async () => {
  const f = fake({ shape: 'capsule' })
  await f.run('cmd.bar-shape')
  expect(f.notes).toEqual(['Sure-Mate 바: 끔 — 트레이 아이콘에서 다시 켤 수 있어요'])
})

it('키를 떼지 않았으면 숨기지 않지만 모양은 바꾼다', async () => {
  const f = fake({ keysHeld: true })
  expect(await f.run('cmd.bar-shape')).toBe(true)
  expect(f.calls.filter((c) => c.startsWith('hide:'))).toHaveLength(0)
  expect(f.calls.filter((c) => c.startsWith('set:'))).toEqual(['set:capsule'])
})

it('다른 id는 false, 저장이 실패해도 true로 알린다', async () => {
  expect(await fake().run('cmd.unmask')).toBe(false)
  const f = fake({ setFails: true })
  expect(await f.run('cmd.bar-shape')).toBe(true)
  expect(f.notes).toHaveLength(1)
})

it('저장이 실패해도 키를 뗐으면 팔레트는 숨기고 알린다', async () => {
  const f = fake({ setFails: true })
  await f.run('cmd.bar-shape')
  expect(f.calls.filter((c) => c === 'hide:true')).toHaveLength(1)
  expect(f.notes).toEqual(['처리하지 못했어요. 다시 해 보고, 계속 안 되면 앱을 다시 켜 주세요.'])
})
