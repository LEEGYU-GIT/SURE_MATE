import { expect, it } from 'vitest'
import { BUILTIN_AI_TARGETS } from '../../shared/ai-targets'
import { termsFor } from '../../shared/glossary/find-terms'
import type { GlossaryEntry } from '../../shared/glossary/types'
import type { PromptDraft } from '../../shared/ipc-channels'
import { ALL_CATEGORIES, type MaskCategory, type MaskItem } from '../../shared/masking/types'
import { fillTemplate } from '../../shared/template/fill'
import type { Template } from '../../shared/template/types'
import type { CaptureResult, MaskingMode } from '../../shared/types'
import { createMaskingService } from '../masking/masking-service'
import { createPromptSession, type PromptMaskResult, type PromptSessionDeps } from './prompt-session'

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

type MaskCall = { mode: MaskingMode; disabledKeys: string[]; dryRun: boolean }
const identityMask = async (text: string): Promise<PromptMaskResult> => ({ text, ranges: [], preamble: null, items: [], warnings: [], notes: [], partial: false, mapRanges: (r) => r })

function fake(
  over: {
    capture?: CaptureResult
    clipboard?: string
    refocused?: boolean
    keysReleased?: boolean
    defaultId?: string
    template?: Template
    defaultMasking?: MaskingMode
    mask?: (text: string, o: MaskCall) => Promise<PromptMaskResult>
    paletteVisible?: boolean
    captureGate?: Promise<void>
  } = {}
) {
  const calls = {
    order: [] as string[],
    captures: 0,
    writes: [] as { text: string; excludeFromHistory: boolean }[],
    opened: [] as string[],
    notes: [] as string[],
    logs: [] as Record<string, unknown>[],
    drafts: [] as PromptDraft[],
    masks: [] as MaskCall[]
  }
  let t = 0
  const tpl = over.template ?? template
  const deps: PromptSessionDeps = {
    findTemplate: (id) => (id === tpl.id ? tpl : null),
    waitKeysReleased: async () => {
      calls.order.push('keys')
      return over.keysReleased ?? true
    },
    hidePaletteAndRefocus: async () => {
      calls.order.push('hide')
      return over.refocused ?? true
    },
    paletteVisible: () => over.paletteVisible ?? false,
    capture: async () => {
      calls.order.push('capture')
      calls.captures++
      if (over.captureGate) await over.captureGate
      return over.capture ?? { text: SELECTED, method: 'ctrl-insert', elapsedMs: 50, restored: true }
    },
    readClipboard: async () => over.clipboard ?? '',
    showConfirm: (d) => calls.drafts.push(d),
    fill: (t2, input, clipboard) => fillTemplate(t2.body, { input, clipboard, now: new Date(2026, 10, 8), terms: () => [], reference: () => null }),
    mask: async (text, o) => {
      calls.masks.push(o)
      return (over.mask ?? identityMask)(text, o)
    },
    defaultMasking: () => over.defaultMasking ?? 'restore',
    writeClipboard: async (text, o) => {
      calls.writes.push({ text, excludeFromHistory: o.excludeFromHistory })
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

/** 회의를 "X"로 바꾸고 머리말을 붙이는 가짜 가리기 */
const fakeMask = async (text: string, o: MaskCall): Promise<PromptMaskResult> => {
  const item: MaskItem = { key: 'client:m', category: 'client', original: '회의', replacement: 'CLIENT_A', count: 1, enabled: !o.disabledKeys.includes('client:m') }
  if (o.mode === 'off') return { text, ranges: [], preamble: null, items: [{ ...item, replacement: null, enabled: false }], warnings: [], notes: [], partial: false, mapRanges: (r) => r }
  const masked = item.enabled ? text.replaceAll('회의', 'CLIENT_A') : text
  return { text: `[머리말]\n\n${masked}`, ranges: [], preamble: '[머리말]', items: [item], warnings: [], notes: [], partial: false, mapRanges: (r) => r.map(([a, b]) => [a + 7, b + 7]) }
}

it('선택 글을 가져오면 기본 출처는 선택 글이고, 확인 화면에는 길이만 보낸다', async () => {
  const f = fake()
  await createPromptSession(f.deps).prepare('meeting-notes')
  const d = f.calls.drafts[0]
  expect(d).toMatchObject({ templateId: 'meeting-notes', name: '회의록 정리', group: '회의', defaultSource: 'selection', selection: { length: 9 }, target: 'claude', masking: 'restore' })
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

it('Enter·보조키를 뗀 것을 확인한 뒤에 팔레트를 숨기고 가져온다', async () => {
  const f = fake()
  await createPromptSession(f.deps).prepare('meeting-notes')
  expect(f.calls.order).toEqual(['keys', 'hide', 'capture'])
})

it('Enter를 계속 누르고 있으면 팔레트를 숨기지 않고 가져오지도 않는다(눌린 키가 원래 앱에 들어가지 않게)', async () => {
  const f = fake({ keysReleased: false, clipboard: '클립 글' })
  await createPromptSession(f.deps).prepare('meeting-notes')
  expect(f.calls.order).toEqual(['keys'])
  expect(f.calls.drafts[0]).toMatchObject({ selection: { length: 0, skipped: 'keys-held' }, defaultSource: 'clipboard' })
})

it('선택한 글이 없으면 nothing-selected', async () => {
  const f = fake({ capture: { text: null, method: 'none', elapsedMs: 800, restored: false } })
  await createPromptSession(f.deps).prepare('meeting-notes')
  expect(f.calls.drafts[0].selection).toEqual({ length: 0, skipped: 'nothing-selected' })
})

it('설정에서 끈 분류가 있으면(실명이 남을 수 있음) Win+V 기록에서 뺀다', async () => {
  const f = fake({ mask: async (text) => ({ ...(await identityMask(text)), partial: true }) })
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  await s.run({ source: 'selection', target: 'copy' })
  expect(f.calls.writes[0].excludeFromHistory).toBe(true)
})

it('가명 처리가 낸 경고·안내(사전 오류 등)를 미리 보기에 함께 보낸다', async () => {
  const f = fake({ mask: async (text) => ({ ...(await identityMask(text)), warnings: ['가명 사전 경고'], notes: ['가명 사전 안내'] }) })
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  const p = await s.preview({ source: 'selection', target: 'claude' })
  expect(p.warnings).toContain('가명 사전 경고')
  expect(p.notes).toContain('가명 사전 안내')
})

it('미리 보기는 고른 출처로 채우고, 2만 자 넘으면 경고하며 앞 4,000자만 보낸다', async () => {
  const f = fake({ capture: { text: '가'.repeat(25000), method: 'ctrl-insert', elapsedMs: 50, restored: true } })
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  const p = await s.preview({ source: 'selection', target: 'claude' })
  expect(p.truncated).toBe(true)
  expect(p.text).toHaveLength(4000)
  expect(p.inputLength).toBe(25000)
  expect(p.warnings.some((w) => w.startsWith('입력이 2만 자를 넘어요(25,000자)'))).toBe(true)
  expect((await s.preview({ source: 'input', input: '직접 쓴 글', target: 'claude' })).text).toBe('정리해 주세요.\n직접 쓴 글')
})

it('미리 보기는 넣은 글 자리를 알려 주고, 잘린 미리 보기에서는 자리도 4,000자에서 자른다', async () => {
  const f = fake()
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  const p = await s.preview({ source: 'selection', target: 'claude' })
  expect(p.text.slice(p.highlights[0][0], p.highlights[0][1])).toBe(SELECTED)

  const long = fake({ capture: { text: '가'.repeat(25000), method: 'ctrl-insert', elapsedMs: 50, restored: true } })
  const s2 = createPromptSession(long.deps)
  await s2.prepare('meeting-notes')
  expect((await s2.preview({ source: 'selection', target: 'claude' })).highlights).toEqual([[9, 4000]])
})

it('실행하면 전체 프롬프트를 복사하고 Claude를 연다', async () => {
  const f = fake()
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  expect(await s.run({ source: 'selection', target: 'claude' })).toEqual({ ok: true, message: '복사했어요 · Claude를 열었어요. Ctrl+V로 붙여넣으세요.' })
  expect(f.calls.writes).toEqual([{ text: `정리해 주세요.\n${SELECTED}`, excludeFromHistory: false }])
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

it('로그에는 길이·id·출처·대상·가린 건수만 남고 글은 남지 않는다', async () => {
  const f = fake({ mask: fakeMask })
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  await s.run({ source: 'selection', target: 'claude' })
  const logged = JSON.stringify(f.calls.logs)
  expect(logged).not.toContain(SELECTED)
  expect(logged).not.toContain('정리해 주세요')
  expect(logged).not.toContain('회의 메모')
  expect(f.calls.logs.at(-1)).toMatchObject({ templateId: 'meeting-notes', source: 'selection', inputLength: 9, target: 'claude', masking: 'restore', masked: 1 })
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

// ── 가명 처리(M3) ──────────────────────────────────

it('모드 우선순위: 이번 실행 > 템플릿 기본값 > 전체 기본값', async () => {
  const f = fake({ template: { ...template, masking: 'off' }, defaultMasking: 'restore', mask: fakeMask })
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  expect(f.calls.drafts[0].masking).toBe('off')
  await s.preview({ source: 'selection', target: 'claude' })
  await s.preview({ source: 'selection', target: 'claude', masking: 'remove' })
  expect(f.calls.masks.map((m) => m.mode)).toEqual(['off', 'remove'])

  const g = fake({ template: { ...template, masking: 'default' }, defaultMasking: 'remove' })
  await createPromptSession(g.deps).prepare('meeting-notes')
  expect(g.calls.drafts[0].masking).toBe('remove')
})

it('미리 보기는 dryRun으로만 가리고, 실행할 때 한 번 확정한다', async () => {
  const f = fake({ mask: fakeMask })
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  for (let i = 0; i < 3; i++) await s.preview({ source: 'selection', target: 'claude' })
  await s.run({ source: 'selection', target: 'claude' })
  expect(f.calls.masks.map((m) => m.dryRun)).toEqual([true, true, true, false])
})

it('가린 글을 복사하고, 미리 보기는 가린 글·항목·옮긴 형광펜 자리를 보낸다', async () => {
  const f = fake({ mask: fakeMask })
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  const p = await s.preview({ source: 'selection', target: 'claude' })
  expect(p.text).toBe('[머리말]\n\n정리해 주세요.\n선택한 CLIENT_A 메모')
  expect(p.masking).toEqual({ mode: 'restore', items: [{ key: 'client:m', category: 'client', original: '회의', replacement: 'CLIENT_A', count: 1, enabled: true }] })
  expect(p.highlights).toEqual([[16, 25]])
  const r = await s.run({ source: 'selection', target: 'claude', disabledKeys: ['client:m'] })
  expect(r.message).toBe('복사했어요 · Claude를 열었어요. Ctrl+V로 붙여넣으세요.')
  expect(f.calls.writes[0].text).toBe('[머리말]\n\n정리해 주세요.\n선택한 회의 메모')
  expect(f.calls.masks.at(-1)?.disabledKeys).toEqual(['client:m'])
})

it('가린 건수를 알림에 넣고, 끔이면 꺼짐을 알리며 Win+V 기록에서 뺀다', async () => {
  const f = fake({ mask: fakeMask })
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')
  expect((await s.run({ source: 'selection', target: 'claude' })).message).toBe('복사했어요 · 가명 1건 · Claude를 열었어요. Ctrl+V로 붙여넣으세요.')
  expect(f.calls.writes[0].excludeFromHistory).toBe(false)

  await s.prepare('meeting-notes')
  expect((await s.run({ source: 'selection', target: 'copy', masking: 'off' })).message).toBe('복사했어요(가명 처리 꺼짐). 붙여넣을 곳에서 Ctrl+V를 누르세요.')
  expect(f.calls.writes[1].excludeFromHistory).toBe(true)
})

// ── {{terms}}와 가명 처리(M4) ──────────────────────

it('붙인 용어 설명 속 고객사 이름도 가린다(실제 채우기·용어 찾기·가명 처리 서비스로 복사한 프롬프트에 가상자동차가 없다)', async () => {
  // 입력 글에는 고객사 이름이 없고, 팀이 적은 용어 설명에만 있다
  const glossary: GlossaryEntry[] = [
    {
      id: 'hils',
      term: 'HILS',
      aliases: [],
      definition: '가상자동차 제어기를 실제 하드웨어와 연결해 시험하는 환경',
      links: [],
      tags: [],
      source: 'user',
      updatedAt: '2026-11-09T00:00:00.000Z',
      version: 1
    }
  ]
  const allOn = Object.fromEntries(ALL_CATEGORIES.map((c) => [c, true])) as Record<MaskCategory, boolean>
  const masking = createMaskingService({
    loadDictionary: async () => ({ terms: [{ id: 'g', category: 'client', canonical: '가상자동차', aliases: [] }], errors: 0 }),
    settings: () => ({ mode: 'restore', categories: allOn, internalDomains: [], ttlHours: 8 }),
    now: () => 0
  })
  const f = fake({
    template: { ...template, body: '정리해 주세요.\n{{terms}}\n{{selection}}' },
    capture: { text: 'HILS 시험 일정을 공유합니다', method: 'ctrl-insert', elapsedMs: 50, restored: true },
    mask: (text, o) => masking.mask(text, o)
  })
  f.deps.fill = (t, input, clip) => fillTemplate(t.body, { input, clipboard: clip, now: new Date(2026, 10, 9), terms: (text) => termsFor(text, glossary), reference: () => null })
  const s = createPromptSession(f.deps)
  await s.prepare('meeting-notes')

  const p = await s.preview({ source: 'selection', target: 'copy' })
  expect(p.text).toContain('- HILS: CLIENT_A 제어기를')
  expect(p.text).not.toContain('가상자동차')

  expect((await s.run({ source: 'selection', target: 'copy' })).ok).toBe(true)
  expect(f.calls.writes[0].text).toContain('- HILS: CLIENT_A 제어기를')
  expect(f.calls.writes[0].text).not.toContain('가상자동차')
})

it('바: 선택 글이 있으면 확인 화면 없이 가려 복사하고 기본 대상을 연다', async () => {
  const f = fake({ mask: fakeMask })
  const r = await createPromptSession(f.deps).runFromBar('meeting-notes')
  expect(r).toBe('ran')
  expect(f.calls.writes).toHaveLength(1)
  expect(f.calls.writes[0].text).toContain('CLIENT_A')
  expect(f.calls.writes[0].text).toContain('선택한 CLIENT_A 메모')
  expect(f.calls.opened).toEqual(['https://claude.ai'])
  expect(f.calls.notes).toHaveLength(1)
  expect(f.calls.drafts).toHaveLength(0)
  expect(f.calls.order).toEqual(['capture'])
  expect(f.calls.masks).toEqual([{ mode: 'restore', disabledKeys: [], dryRun: false }])
})

it('바: 팔레트가 열려 있으면 먼저 숨기고 돌아간 뒤 가져온다', async () => {
  const f = fake({ paletteVisible: true })
  expect(await createPromptSession(f.deps).runFromBar('meeting-notes')).toBe('ran')
  expect(f.calls.order).toEqual(['hide', 'capture'])
})

it('바: 팔레트가 열려 있고 직전 창이 없으면 가져오지 않고 확인 화면', async () => {
  const f = fake({ paletteVisible: true, refocused: false })
  expect(await createPromptSession(f.deps).runFromBar('meeting-notes')).toBe('confirm')
  expect(f.calls.captures).toBe(0)
  expect(f.calls.drafts[0].selection).toEqual({ length: 0, skipped: 'no-foreground' })
})

it('바: 선택 없음이면 확인 화면(클립보드가 있으면 기본 출처 clipboard)이고 쓰기 없음', async () => {
  const f = fake({ capture: { text: '', method: 'ctrl-insert', elapsedMs: 5, restored: true }, clipboard: '클립 글' })
  expect(await createPromptSession(f.deps).runFromBar('meeting-notes')).toBe('confirm')
  expect(f.calls.drafts[0]).toMatchObject({ selection: { length: 0, skipped: 'nothing-selected' }, defaultSource: 'clipboard' })
  expect(f.calls.writes).toHaveLength(0)
  expect(f.calls.opened).toHaveLength(0)
})

it('바와 확인 화면: 공백·줄바꿈만 가져오면 선택 없음과 같다', async () => {
  const blank: CaptureResult = { text: ' \n\t ', method: 'ctrl-insert', elapsedMs: 5, restored: true }
  const f = fake({ capture: blank })
  expect(await createPromptSession(f.deps).runFromBar('meeting-notes')).toBe('confirm')
  expect(f.calls.drafts[0].selection).toEqual({ length: 0, skipped: 'nothing-selected' })
  const g = fake({ capture: blank })
  await createPromptSession(g.deps).prepare('meeting-notes')
  expect(g.calls.drafts[0].selection).toEqual({ length: 0, skipped: 'nothing-selected' })
})

it('바: 터미널이면 확인 화면 초안에 terminal', async () => {
  const f = fake({ capture: { text: '', skipped: 'terminal', method: 'none', elapsedMs: 1, restored: true } as CaptureResult })
  expect(await createPromptSession(f.deps).runFromBar('meeting-notes')).toBe('confirm')
  expect(f.calls.drafts[0].selection).toEqual({ length: 0, skipped: 'terminal' })
})

it('바: 없는 상용구는 missing이고 가져오기 없음', async () => {
  const f = fake()
  expect(await createPromptSession(f.deps).runFromBar('nope')).toBe('missing')
  expect(f.calls.captures).toBe(0)
})

it('바: 첫 호출이 끝나기 전 두 번째 호출은 busy, 가져오기는 1회', async () => {
  let release!: () => void
  const f = fake({ captureGate: new Promise<void>((r) => (release = r)) })
  const s = createPromptSession(f.deps)
  const first = s.runFromBar('meeting-notes')
  const second = await s.runFromBar('meeting-notes')
  expect(second).toBe('busy')
  release()
  expect(await first).toBe('ran')
  expect(f.calls.captures).toBe(1)
  expect(f.calls.writes).toHaveLength(1)
  expect(await s.runFromBar('meeting-notes')).toBe('ran')
})

it('바: 템플릿 가명 기본값이 off면 기록에서 뺀다', async () => {
  const f = fake({ template: { ...template, masking: 'off' }, mask: fakeMask })
  await createPromptSession(f.deps).runFromBar('meeting-notes')
  expect(f.calls.writes[0].excludeFromHistory).toBe(true)
  expect(f.calls.masks[0].mode).toBe('off')
})

it('바: 로그에 선택 글이 없다', async () => {
  const f = fake()
  await createPromptSession(f.deps).runFromBar('meeting-notes')
  expect(JSON.stringify(f.calls.logs)).not.toContain(SELECTED)
  expect(f.calls.logs).toContainEqual({ templateId: 'meeting-notes', result: 'ran', selectionLength: 9, skipped: null })
})
