import { expect, it } from 'vitest'
import type { Template } from '../../shared/template/types'
import type { CaptureResult } from '../../shared/types'
import { createSnippetRunner, SNIPPET_DEDUPE_MS, type SnippetRunnerDeps } from './snippet-runner'

const snippet = (id: string, body: string): Template => ({ id, name: id, aliases: [], kind: 'snippet', body, scope: 'builtin' })

function fake(over: { templates?: Template[]; hwnd?: string | null; refocus?: boolean; keys?: boolean; paste?: { ok: boolean; reason?: string }; capture?: CaptureResult } = {}) {
  const events: string[] = []
  const notes: string[] = []
  const logs: { event: string; data: Record<string, unknown> }[] = []
  const pasted: { hwnd: string; text: string }[] = []
  const copied: string[] = []
  let t = 1000
  const deps: SnippetRunnerDeps = {
    findTemplate: (id) => (over.templates ?? [snippet('sig', '감사합니다.\n{{date}}')]).find((x) => x.id === id) ?? null,
    waitKeysReleased: async () => {
      events.push('keys')
      return over.keys ?? true
    },
    hidePaletteAndRefocus: async () => {
      events.push('hide')
      return over.refocus ?? true
    },
    previousHwnd: () => (over.hwnd === undefined ? '100' : over.hwnd),
    capture: async () => {
      events.push('capture')
      return over.capture ?? { text: '선택한 글', method: 'ctrl-c', elapsedMs: 1, restored: true }
    },
    readClipboard: async () => '클립',
    fill: (body, input, clip) => ({ text: body.replace('{{selection}}', input).replace('{{clipboard}}', clip), warnings: [], notes: [], inputRanges: [] }),
    paste: async (hwnd, text) => {
      events.push('paste')
      pasted.push({ hwnd, text })
      return (over.paste ?? { ok: true }) as { ok: boolean; reason?: never }
    },
    writeClipboard: async (text) => {
      events.push('copy')
      copied.push(text)
    },
    notify: (m) => notes.push(m),
    log: (event, data) => logs.push({ event, data }),
    now: () => t
  }
  return { deps, events, notes, logs, pasted, copied, advance: (ms: number) => (t += ms) }
}

it('키를 뗀 뒤 팔레트를 숨기고 붙여넣는다', async () => {
  const f = fake()
  const r = await createSnippetRunner(f.deps).run('sig')
  expect(r.ok).toBe(true)
  expect(f.events).toEqual(['keys', 'hide', 'paste'])
  expect(f.pasted).toEqual([{ hwnd: '100', text: '감사합니다.\n{{date}}' }])
})

it('{{selection}}이 없으면 선택 글을 가져오지 않는다', async () => {
  const f = fake()
  await createSnippetRunner(f.deps).run('sig')
  expect(f.events).not.toContain('capture')
})

it('{{selection}}이 있으면 가져와 채운다(가명 처리 없음)', async () => {
  const f = fake({ templates: [snippet('q', '인용: {{selection}}')] })
  await createSnippetRunner(f.deps).run('q')
  expect(f.events).toEqual(['keys', 'hide', 'capture', 'paste'])
  expect(f.pasted[0].text).toBe('인용: 선택한 글')
})

it('붙여넣기 실패 까닭이 알림에 들어간다', async () => {
  const f = fake({ paste: { ok: false, reason: 'elevated' } })
  const r = await createSnippetRunner(f.deps).run('sig')
  expect(r.ok).toBe(false)
  expect(f.notes).toEqual(['붙여넣지 못해 복사만 했어요: 관리자 권한 창'])
})

it('직전 창이 없으면 복사만 한다', async () => {
  const f = fake({ hwnd: null })
  await createSnippetRunner(f.deps).run('sig')
  expect(f.events).toEqual(['keys', 'hide', 'copy'])
  expect(f.notes[0]).toContain('복사만 했어요')
})

it('키를 못 뗐으면 붙여넣지 않고 복사만 한다', async () => {
  const f = fake({ keys: false })
  await createSnippetRunner(f.deps).run('sig')
  expect(f.events).not.toContain('paste')
  expect(f.copied.length).toBe(1)
})

it('모르는 id는 아무것도 하지 않는다', async () => {
  const f = fake()
  const r = await createSnippetRunner(f.deps).run('none')
  expect(r.ok).toBe(false)
  expect(f.events).toEqual([])
})

it('같은 상용구를 300ms 안에 두 번 실행하지 않는다', async () => {
  const f = fake()
  const runner = createSnippetRunner(f.deps)
  await runner.run('sig')
  await runner.run('sig')
  expect(f.pasted.length).toBe(1)
  f.advance(SNIPPET_DEDUPE_MS + 1)
  await runner.run('sig')
  expect(f.pasted.length).toBe(2)
})

it('로그에는 id·길이·결과만 있고 본문이 없다', async () => {
  const f = fake({ templates: [snippet('q', '비밀본문 {{selection}}')] })
  await createSnippetRunner(f.deps).run('q')
  const json = JSON.stringify(f.logs)
  expect(json).not.toContain('비밀본문')
  expect(json).not.toContain('선택한 글')
  expect(f.logs[0].data).toMatchObject({ templateId: 'q', result: 'pasted' })
  expect(typeof f.logs[0].data.length).toBe('number')
})
