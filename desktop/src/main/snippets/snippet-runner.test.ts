import { expect, it } from 'vitest'
import type { Template } from '../../shared/template/types'
import type { CaptureResult } from '../../shared/types'
import { createSnippetRunner, SNIPPET_DEDUPE_MS, type SnippetRunnerDeps } from './snippet-runner'

const snippet = (id: string, body: string): Template => ({ id, name: id, aliases: [], kind: 'snippet', body, scope: 'builtin' })

function fake(
  over: { templates?: Template[]; hwnd?: string | null; refocus?: boolean; keys?: boolean; paste?: { ok: boolean; reason?: string }; capture?: CaptureResult; native?: boolean } = {}
) {
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
    nativeOk: () => over.native ?? true,
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
  // 붙여넣기가 이미 클립보드에 썼으므로 다시 쓰지 않는다
  expect(f.copied).toEqual([])
})

it('다른 복사 작업과 겹쳐(busy) 붙여넣기를 시작하지 못하면 아무것도 쓰이지 않았으니, 클립보드 줄을 기다려 복사해 두고 알린다', async () => {
  const f = fake({ paste: { ok: false, reason: 'busy' } })
  const r = await createSnippetRunner(f.deps).run('sig')
  expect(r).toEqual({ ok: false, result: 'copied' })
  expect(f.events).toEqual(['keys', 'hide', 'paste', 'copy'])
  expect(f.copied).toEqual(['감사합니다.\n{{date}}'])
  expect(f.notes).toEqual(['붙여넣지 못해 복사만 했어요: 다른 복사 작업과 겹쳤어요'])
  expect(f.logs.at(-1)?.data).toMatchObject({ templateId: 'sig', result: 'copied', reason: 'busy' })
})

it('Win32를 불러오지 못했으면(보안 프로그램) 창이 없어졌다고 하지 않고 키 입력을 보낼 수 없다고 알린다', async () => {
  const f = fake({ hwnd: null, native: false })
  await createSnippetRunner(f.deps).run('sig')
  expect(f.copied).toHaveLength(1)
  expect(f.notes).toEqual(['붙여넣지 못해 복사만 했어요: 이 PC에서는 키 입력을 보낼 수 없어요'])
  expect(f.logs.at(-1)?.data).toMatchObject({ result: 'copied', reason: 'native-unavailable' })
  // Win32는 되는데 직전 창이 없으면 그대로 '창이 없어졌어요'
  const g = fake({ hwnd: null })
  await createSnippetRunner(g.deps).run('sig')
  expect(g.notes).toEqual(['붙여넣지 못해 복사만 했어요: 붙여넣을 창이 없어졌어요'])
  expect(g.logs.at(-1)?.data).toMatchObject({ result: 'copied', reason: 'target-gone' })
})

it('직전 창이 없으면 복사만 한다', async () => {
  const f = fake({ hwnd: null })
  await createSnippetRunner(f.deps).run('sig')
  expect(f.events).toEqual(['keys', 'hide', 'copy'])
  expect(f.notes[0]).toContain('복사만 했어요')
})

it('키를 못 뗐으면 붙여넣지 않고 복사만 한다(로그에는 알림 글 대신 까닭 코드)', async () => {
  const f = fake({ keys: false })
  await createSnippetRunner(f.deps).run('sig')
  expect(f.events).not.toContain('paste')
  expect(f.copied.length).toBe(1)
  expect(f.logs.at(-1)?.data).toMatchObject({ result: 'copied', reason: 'modifiers-held' })
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
