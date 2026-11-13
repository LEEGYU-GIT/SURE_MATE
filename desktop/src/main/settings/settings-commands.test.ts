import { expect, it, vi } from 'vitest'
import { createSettingsCommands, settingsCommandItems } from './settings-commands'

const deps = (released = true) => {
  const calls: string[] = []
  return {
    calls,
    d: {
      waitKeysReleased: vi.fn(async () => {
        calls.push('wait')
        return released
      }),
      hidePalette: vi.fn((restoreFocus: boolean) => calls.push(`hide:${restoreFocus}`)),
      openSettings: vi.fn(() => calls.push('open')),
      openTry: vi.fn(() => calls.push('try')),
      log: vi.fn()
    }
  }
}

it('팔레트 명령 "설정 열기"와 "따라 해 보기 (30초)"는 명령 구역에 있고, 설정·튜토리얼·연습·사용법으로 찾힌다', () => {
  expect(settingsCommandItems()).toEqual([
    expect.objectContaining({
      id: 'cmd.open-settings',
      group: 'command',
      title: '설정 열기',
      keywords: expect.arrayContaining(['settings', '설정'])
    }),
    expect.objectContaining({
      id: 'cmd.open-try',
      group: 'command',
      title: '따라 해 보기 (30초)',
      keywords: expect.arrayContaining(['튜토리얼', '연습', '사용법'])
    })
  ])
})

it('따라 해 보기: 고른 키를 뗀 뒤 팔레트를 숨기고(원래 창으로 돌아가지 않음) 따라 해 보기 화면을 연다. 떼지 않아도 연다', async () => {
  const { calls, d } = deps()
  await expect(createSettingsCommands(d).run('cmd.open-try')).resolves.toBe(true)
  expect(calls).toEqual(['wait', 'hide:false', 'try'])
  expect(d.log).toHaveBeenCalledWith('try.openCommand', {})
  const held = deps(false)
  await createSettingsCommands(held.d).run('cmd.open-try')
  expect(held.calls).toEqual(['wait', 'try'])
})

it('설정 열기: 고른 키를 뗀 뒤 팔레트를 숨기고(원래 창으로 돌아가지 않음) 설정 창을 연다', async () => {
  const { calls, d } = deps()
  await expect(createSettingsCommands(d).run('cmd.open-settings')).resolves.toBe(true)
  expect(calls).toEqual(['wait', 'hide:false', 'open'])
})

it('키를 떼지 않아도 설정 창은 연다(팔레트는 그대로 두고 설정 창이 앞으로 온다)', async () => {
  const { calls, d } = deps(false)
  await createSettingsCommands(d).run('cmd.open-settings')
  expect(calls).toEqual(['wait', 'open'])
})

it('다른 명령은 처리하지 않는다(Object 원형의 이름도)', async () => {
  const { calls, d } = deps()
  for (const id of ['cmd.bar-shape', 'toString', '__proto__', 'constructor'])
    await expect(createSettingsCommands(d).run(id), id).resolves.toBe(false)
  expect(calls).toEqual([])
})
