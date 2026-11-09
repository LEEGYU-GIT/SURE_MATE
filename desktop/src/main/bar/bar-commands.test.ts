import { expect, it } from 'vitest'
import type { BarShape } from '../../shared/bar/bar-settings'
import { barCommandItems, createBarCommands } from './bar-commands'

function fake(o: { shape?: BarShape; keysReleased?: boolean } = {}) {
  const calls: string[] = []
  const notes: string[] = []
  let shape: BarShape = o.shape ?? 'edge'
  const commands = createBarCommands({
    getShape: () => shape,
    setShape: async (s) => {
      calls.push(`setShape:${s}`)
      shape = s
    },
    waitKeysReleased: async () => {
      calls.push('keys')
      return o.keysReleased ?? true
    },
    hidePalette: (restoreFocus) => calls.push(`hide:${restoreFocus}`),
    notify: (m) => notes.push(m),
    log: () => {}
  })
  return { commands, calls, notes }
}

it('팔레트 명령의 부제는 지금 모양과 누르면 바뀔 모양', () => {
  expect(barCommandItems('edge')[0]).toMatchObject({ id: 'cmd.bar-shape', group: 'command', title: 'Sure-Mate 바 모양 바꾸기', subtitle: '지금: 가장자리 띠 · 누르면 떠 있는 캡슐' })
  expect(barCommandItems('off')[0].subtitle).toBe('지금: 끔 · 누르면 가장자리 띠')
  expect(barCommandItems('edge')[0].keywords).toEqual(expect.arrayContaining(['bar', '바', '사이드바']))
})

it('누른 키를 뗀 뒤 팔레트를 숨기고(원래 창으로) 다음 모양으로 바꾼다', async () => {
  const f = fake()
  expect(await f.commands.run('cmd.bar-shape')).toBe(true)
  expect(f.calls).toEqual(['keys', 'hide:true', 'setShape:capsule'])
  expect(f.notes[0]).toBe('Sure-Mate 바: 떠 있는 캡슐')
})

it('끄면 다시 켤 곳을 알려 주고, 키를 떼지 않으면 숨기지 않지만 모양은 바꾼다(가명 처리 명령과 같은 규칙)', async () => {
  const off = fake({ shape: 'capsule' })
  await off.commands.run('cmd.bar-shape')
  expect(off.notes[0]).toBe('Sure-Mate 바: 끔 — 트레이 아이콘에서 다시 켤 수 있어요')
  const held = fake({ keysReleased: false })
  await held.commands.run('cmd.bar-shape')
  expect(held.calls).toEqual(['keys', 'setShape:capsule'])
})

it('바 모양 명령이 아니면 false', async () => {
  expect(await fake().commands.run('cmd.masking-mode')).toBe(false)
})
