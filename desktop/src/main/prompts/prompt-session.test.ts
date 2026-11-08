import { expect, it } from 'vitest'
import { BUILTIN_AI_TARGETS } from '../../shared/ai-targets'
import type { PromptDraft } from '../../shared/ipc-channels'
import { fillTemplate } from '../../shared/template/fill'
import type { Template } from '../../shared/template/types'
import type { CaptureResult } from '../../shared/types'
import { createPromptSession, type PromptSessionDeps } from './prompt-session'

const template: Template = {
  id: 'meeting-notes',
  name: '회의록 정리',
  aliases: [],
  kind: 'prompt',
  group: '회의',
  body: '정리해 주세요.\n{{selection}}',
  scope: 'builtin'
}

const SELECTED = '선택한 회의 메모'

function fake(over: { capture?: CaptureResult; clipboard?: string; refocused?: boolean; defaultId?: string } = {}) {
  const calls = {
    captures: 0,
    writes: [] as string[],
    opened: [] as string[],
    notes: [] as string[],
    logs: [] as Record<string, unknown>[],
    drafts: [] as PromptDraft[]
  }
  let t = 0
  const deps: PromptSessionDeps = {
    findTemplate: (id) => (id === template.id ? template : null),
    hidePaletteAndRefocus: async () => over.refocused ?? true,
    capture: async () => {
      calls.captures++
      return over.capture ?? { text: SELECTED, method: 'ctrl-insert', elapsedMs: 50, restored: true }
    },
    readClipboard: async () => over.clipboard ?? '',
    showConfirm: (d) => calls.drafts.push(d),
    fill: (tpl, input, clipboard) =>
      fillTemplate(tpl.body, { input, clipboard, now: new Date(2026, 10, 8), terms: () => [], reference: () => null }),
    writeClipboard: async (text) => {
      calls.writes.push(text)
    },
    openUrl: async (url) => {
      calls.opened.push(url)
    },
    notify: (m) => calls.notes.push(m),
    log: (_event, data) => calls.logs.push(data),
    targets: () => ({ list: [...BUILTIN_AI_TARGETS], defaultId: over.defaultId ?? 'claude' }),
    now: () => t
  }
  return { deps, calls, advance: (ms: number) => (t += ms) }
}

it('선택 글을 가져오면 기본 출처는 선택 글이고, 확인 화면에는 길이만 보낸다', async () => {
  const f = fake()
  await createPromptSession(f.deps).prepare('meeting-notes')
  const d = f.calls.drafts[0]
  expect(d).toMatchObject({ templateId: 'meeting-notes', name: '회의록 정리', group: '회의', defaultSource: 'selection', selection: { length: 9 }, target: 'claude' })
  expect(d.targets.map((t) => t.id)).toEqual(['claude', 'chatgpt', 'gemini', 'copy'])
  expect(JSON.stringify(d)).not.toContain(SELECTED)
})

it('직전 창이 없으면 가져오기를 부르지 않고, 클립보드가 있으면 기본 출처는 클립보드', async () => {
  const f = fake({ refocused: false, clipboard: '클립 글' })
  await createPromptSession(f.deps).prepare('meeting-notes')
  expect(f.calls.captures).toBe(0)
  expect(f.calls.drafts[0]).toMatchObject({ selection: { length: 0, skipped: 'no-foreground' }, defaultSource: 'clipboard', clipboardLength: 4 })
})

it('터미널이라 건너뛰고 클립보드도 비었으면 직접 입력', async () => {
  const f = fake({ capture: { text: null, method: 'none', elapsedMs: 0, restored: false, skipped: 'terminal' } })
  await createPromptSession(f.deps).prepare('meeting-notes')
  expect(f.calls.drafts[0]).toMatchObject({ selection: { length: 0, skipped: 'terminal' }, defaultSource: 'input' })
})

it('선택한 글이 없으면 nothing-selected', async () => {
  const f = fake({ capture: { text: null, method: 'none', elapsedMs: 800, restored: false } })
  await createPromptSession(f.deps).prepare('meeting-notes')
  expect(f.calls.drafts[0].selection).toEqual({ length: 0, skipped: 'nothing-selected' })
})

it('미리 보기는 고른 출처로 채우고, 2만 자 넘으면 경고하며 앞 4,000자만 보낸다', async () => {
  const f = fake({ capture: { text: '가'.repeat(25000), method: 'ctrl-insert', elapsedMs: 50, restored: true } })
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  const p = s.preview({ source: 'selection', target: 'claude' })
  expect(p.truncated).toBe(true)
  expect(p.text).toHaveLength(4000)
  expect(p.inputLength).toBe(25000)
  expect(p.warnings.some((w) => w.startsWith('입력이 2만 자를 넘어요(25,000자)'))).toBe(true)
  expect(s.preview({ source: 'input', input: '직접 쓴 글', target: 'claude' }).text).toBe('정리해 주세요.\n직접 쓴 글')
})

it('미리 보기는 넣은 글 자리를 알려 주고, 잘린 미리 보기에서는 자리도 4,000자에서 자른다', async () => {
  const f = fake()
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  const p = s.preview({ source: 'selection', target: 'claude' })
  expect(p.text.slice(p.highlights[0][0], p.highlights[0][1])).toBe(SELECTED)

  const long = fake({ capture: { text: '가'.repeat(25000), method: 'ctrl-insert', elapsedMs: 50, restored: true } })
  const s2 = createPromptSession(long.deps)
  await s2.prepare('meeting-notes')
  const p2 = s2.preview({ source: 'selection', target: 'claude' })
  expect(p2.highlights).toEqual([[9, 4000]])
})

it('실행하면 전체 프롬프트를 복사하고 Claude를 연다', async () => {
  const f = fake()
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  expect(await s.run({ source: 'selection', target: 'claude' })).toEqual({ ok: true, message: '복사했어요 · Claude를 열었어요. Ctrl+V로 붙여넣으세요.' })
  expect(f.calls.writes).toEqual([`정리해 주세요.\n${SELECTED}`])
  expect(f.calls.opened).toEqual(['https://claude.ai'])
  expect(f.calls.notes).toEqual(['복사했어요 · Claude를 열었어요. Ctrl+V로 붙여넣으세요.'])
})

it('복사만이면 열지 않는다', async () => {
  const f = fake()
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  expect(await s.run({ source: 'selection', target: 'copy' })).toEqual({ ok: true, message: '복사했어요. 붙여넣을 곳에서 Ctrl+V를 누르세요.' })
  expect(f.calls.opened).toEqual([])
})

it('로그에는 길이·id·출처·대상만 남고 글은 남지 않는다', async () => {
  const f = fake()
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  await s.run({ source: 'selection', target: 'claude' })
  const logged = JSON.stringify(f.calls.logs)
  expect(logged).not.toContain(SELECTED)
  expect(logged).not.toContain('정리해 주세요')
  expect(f.calls.logs.at(-1)).toMatchObject({ templateId: 'meeting-notes', source: 'selection', inputLength: 9, target: 'claude' })
})

it('연달아 두 번 실행하면 두 번째는 실패하고 복사는 한 번', async () => {
  const f = fake()
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  const [a, b] = await Promise.all([s.run({ source: 'selection', target: 'claude' }), s.run({ source: 'selection', target: 'claude' })])
  expect([a.ok, b.ok]).toEqual([true, false])
  expect(f.calls.writes).toHaveLength(1)
})

it('넣을 글이 없으면 실행하지 않는다', async () => {
  const f = fake({ capture: { text: null, method: 'none', elapsedMs: 800, restored: false } })
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  expect(await s.run({ source: 'input', input: '  ', target: 'claude' })).toEqual({
    ok: false,
    message: '넣을 글이 없어요. 글을 선택하거나 직접 입력해 주세요.'
  })
  expect(f.calls.writes).toEqual([])
})

it('세션은 10분 뒤 사라진다', async () => {
  const f = fake()
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  f.advance(10 * 60 * 1000 + 1)
  expect((await s.run({ source: 'selection', target: 'claude' })).ok).toBe(false)
  expect(f.calls.writes).toEqual([])
})
