import { expect, it } from 'vitest'
import type { ShownPayload } from '../../shared/ipc-channels'
import { createBarActions } from './bar-actions'

function fake(o: { known?: (id: string) => boolean; runPrompt?: () => Promise<unknown> } = {}) {
  const calls: string[] = []
  const logs: { event: string; data: Record<string, unknown> }[] = []
  let t = 0
  const actions = createBarActions(
    {
      isKnown: o.known ?? (() => true),
      togglePalette: () => calls.push('togglePalette'),
      openPalette: (p: ShownPayload) => calls.push(`openPalette:${JSON.stringify(p)}`),
      toggleMenu: (kind, itemId) => calls.push(`toggleMenu:${kind}:${itemId}`),
      runPrompt: async (templateId) => {
        calls.push(`runPrompt:${templateId}`)
        return (o.runPrompt ?? (async () => 'ran'))()
      },
      setBusy: (id) => calls.push(`setBusy:${id}`),
      togglePet: async () => {
        calls.push('togglePet')
      },
      openSettings: async () => {
        calls.push('openSettings')
      },
      log: (event, data) => logs.push({ event, data })
    },
    () => t
  )
  return { actions, calls, logs, advance: (ms: number) => (t += ms) }
}

it('바 단추마다 맞는 동작을 부른다', async () => {
  const f = fake()
  for (const id of ['logo', 'masking', 'workspace', 'glossary', 'pet', 'settings']) {
    await f.actions.run(id)
    f.advance(1000)
  }
  expect(f.calls).toEqual([
    'togglePalette',
    'toggleMenu:masking-menu:masking',
    'toggleMenu:workspace-menu:workspace',
    `openPalette:${JSON.stringify({ mode: 'search', query: '?' })}`,
    'togglePet',
    'openSettings'
  ])
})

it('고정 프롬프트는 바쁨 표시 → 실행 → 바쁨 해제(실행이 실패해도)', async () => {
  const ok = fake()
  await ok.actions.run('prompt:meeting-notes')
  expect(ok.calls).toEqual(['setBusy:prompt:meeting-notes', 'runPrompt:meeting-notes', 'setBusy:null'])
  const failing = fake({ runPrompt: () => Promise.reject(new Error('가져오기 실패')) })
  await failing.actions.run('prompt:meeting-notes')
  expect(failing.calls.at(-1)).toBe('setBusy:null')
})

it('(Review Focus 3) 같은 단추를 300ms 안에 두 번 누르면 한 번만', async () => {
  const f = fake()
  await f.actions.run('prompt:meeting-notes')
  f.advance(200)
  await f.actions.run('prompt:meeting-notes')
  expect(f.calls.filter((c) => c.startsWith('runPrompt'))).toHaveLength(1)
  f.advance(400)
  await f.actions.run('prompt:meeting-notes')
  expect(f.calls.filter((c) => c.startsWith('runPrompt'))).toHaveLength(2)
})

it('바에 없는 id는 아무것도 하지 않고 길이만 기록한다', async () => {
  const f = fake({ known: () => false })
  await f.actions.run('prompt:없는-프롬프트')
  expect(f.calls).toEqual([])
  expect(f.logs).toEqual([{ event: 'bar.action.unknown', data: { length: 'prompt:없는-프롬프트'.length } }])
})
