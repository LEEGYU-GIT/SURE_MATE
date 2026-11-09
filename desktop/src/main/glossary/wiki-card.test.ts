import { describe, expect, it, vi, type Mock } from 'vitest'
import builtinGlossary from '../../../resources/glossary.json'
import type { WikiCardView } from '../../shared/flyout/flyout-content'
import { parseGlossaryPack } from '../../shared/glossary/pack'
import type { GlossaryEntry } from '../../shared/glossary/types'
import * as lookup from '../../shared/glossary/wiki-lookup'
import { CAPTURE_NOTES } from '../../shared/labels'
import type { CaptureResult } from '../../shared/types'
import { CLIPBOARD_EMPTY_NOTE, createWikiCard, type WikiCard } from './wiki-card'

// 색인을 몇 번 만드는지 세려고 원래 함수를 감싼다(동작은 그대로)
vi.mock('../../shared/glossary/wiki-lookup', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../shared/glossary/wiki-lookup')>()
  return { ...real, buildGlossaryIndex: vi.fn(real.buildGlossaryIndex) }
})

const pack = parseGlossaryPack(builtinGlossary, 'builtin').entries

const captured = (text: string | null, o: Partial<CaptureResult> = {}): CaptureResult => ({ text, method: 'ctrl-insert', elapsedMs: 120, restored: true, ...o })
const skipped = (reason: NonNullable<CaptureResult['skipped']>): CaptureResult => ({ text: null, method: 'none', elapsedMs: 0, restored: false, skipped: reason })

interface Harness {
  card: WikiCard
  d: {
    capture: Mock<() => Promise<CaptureResult>>
    readClipboard: Mock<() => Promise<string>>
    entries: Mock<() => Promise<GlossaryEntry[]>>
    show: Mock<(v: WikiCardView) => void>
    log: Mock<(event: string, data: Record<string, unknown>) => void>
  }
  shown: WikiCardView[]
  logs: { event: string; data: Record<string, unknown> }[]
}

function make(o: { capture?: CaptureResult; clipboard?: string | Error; entries?: GlossaryEntry[] } = {}): Harness {
  const shown: WikiCardView[] = []
  const logs: { event: string; data: Record<string, unknown> }[] = []
  const d = {
    capture: vi.fn(async () => o.capture ?? captured('MC/DC')),
    readClipboard: vi.fn(async () => {
      if (o.clipboard instanceof Error) throw o.clipboard
      return o.clipboard ?? ''
    }),
    entries: vi.fn(async () => o.entries ?? pack),
    show: vi.fn((v: WikiCardView) => void shown.push(v)),
    log: vi.fn((event: string, data: Record<string, unknown>) => void logs.push({ event, data }))
  }
  return { card: createWikiCard(d), d, shown, logs }
}

describe('lookupSelection: 선택한 글로 찾기', () => {
  it('가져온 글 → 가장 맞는 항목 카드(출처 selection), 클립보드는 읽지 않는다', async () => {
    const t = make({ capture: captured('MC/DC') })
    await t.card.lookupSelection()
    expect(t.shown).toHaveLength(1)
    const v = t.shown[0]
    expect(v).toMatchObject({ kind: 'best', source: 'selection', best: { id: 'mcdc', term: 'MC/DC' } })
    // 카드에는 링크·태그를 보내지 않는다(toCardEntry)
    if (v.kind === 'best') {
      expect(v.best).not.toHaveProperty('links')
      expect(v.best).not.toHaveProperty('tags')
      expect(v.others.length).toBeLessThanOrEqual(2)
    }
    expect(t.d.readClipboard).not.toHaveBeenCalled()
  })

  it('로그 wiki.card: 가져오기 수치(옛 dev.capture와 같은 필드)와 카드 종류·용어 수', async () => {
    const t = make({ capture: captured('MC/DC', { method: 'ctrl-c', elapsedMs: 340, restored: false }) })
    await t.card.lookupSelection()
    const v = t.shown[0]
    const count = v.kind === 'best' ? 1 + v.others.length : -1
    expect(t.logs).toEqual([
      { event: 'wiki.card', data: { source: 'selection', method: 'ctrl-c', elapsedMs: 340, restored: false, skipped: null, length: 5, kind: 'best', count } }
    ])
  })

  it('busy(다른 가져오기가 먼저 시작) → 카드를 띄우지 않고 로그만 한 번', async () => {
    const t = make({ capture: skipped('busy') })
    await t.card.lookupSelection()
    expect(t.d.show).not.toHaveBeenCalled()
    expect(t.logs).toEqual([
      { event: 'wiki.card', data: { source: 'selection', method: 'none', elapsedMs: 0, restored: false, skipped: 'busy', length: 0, kind: null, count: 0 } }
    ])
  })

  it('터미널 → 이유와 [클립보드 글로 찾기](클립보드에 글이 있을 때만). 클립보드를 자동으로 찾지는 않는다', async () => {
    const t = make({ capture: skipped('terminal'), clipboard: 'SIL 2 요구사항' })
    await t.card.lookupSelection()
    expect(t.shown).toEqual([{ kind: 'note', message: CAPTURE_NOTES.terminal, canUseClipboard: true }])
    expect(t.logs[0].data).toMatchObject({ skipped: 'terminal', kind: 'note', count: 0 })
    const empty = make({ capture: skipped('terminal'), clipboard: '' })
    await empty.card.lookupSelection()
    expect(empty.shown).toEqual([{ kind: 'note', message: CAPTURE_NOTES.terminal, canUseClipboard: false }])
  })

  it('공백·줄바꿈만 가져왔거나 가져온 글이 없으면 "선택한 글이 없어요", 공백뿐인 클립보드는 빈 것으로', async () => {
    const blank = make({ capture: captured(' \n\t '), clipboard: ' \n ' })
    await blank.card.lookupSelection()
    expect(blank.shown).toEqual([{ kind: 'note', message: CAPTURE_NOTES['nothing-selected'], canUseClipboard: false }])
    expect(blank.logs[0].data).toMatchObject({ skipped: null, length: 4, kind: 'note' })
    const none = make({ capture: captured(null), clipboard: '정적분석' })
    await none.card.lookupSelection()
    expect(none.shown).toEqual([{ kind: 'note', message: CAPTURE_NOTES['nothing-selected'], canUseClipboard: true }])
  })

  it('클립보드를 읽지 못하면 빈 것으로 본다(단추를 보이지 않음)', async () => {
    const t = make({ capture: skipped('elevated'), clipboard: new Error('EBUSY') })
    await t.card.lookupSelection()
    expect(t.shown).toEqual([{ kind: 'note', message: CAPTURE_NOTES.elevated, canUseClipboard: false }])
  })

  it('긴 글 → 이 글에 나온 용어 목록, 용어 수는 목록 + 더 있는 수', async () => {
    const t = make({ capture: captured('정적분석 결과에서 MC/DC 커버리지가 부족') })
    await t.card.lookupSelection()
    const v = t.shown[0]
    expect(v.kind).toBe('found')
    if (v.kind !== 'found') return
    expect(v).toMatchObject({ source: 'selection', more: 0 })
    expect(v.entries.map((e) => e.id)).toEqual(['static-analysis', 'mcdc', 'code-coverage'])
    expect(v.entries[0]).not.toHaveProperty('links')
    expect(t.logs[0].data).toMatchObject({ kind: 'found', count: 3, length: 24 })
  })

  it('맞는 용어가 없으면: 짧은 글은 그 글을 검색어로, 긴 글은 빈 검색어(카드가 "이 글에 나온 용어가 없어요")', async () => {
    const short = make({ capture: captured('  zzqxw  ') })
    await short.card.lookupSelection()
    expect(short.shown).toEqual([{ kind: 'none', source: 'selection', query: 'zzqxw' }])
    const long = make({ capture: captured('오늘 오후에 다음 주 일정과 담당자를 정했습니다') })
    await long.card.lookupSelection()
    expect(long.shown).toEqual([{ kind: 'none', source: 'selection', query: '' }])
    expect(long.logs[0].data).toMatchObject({ kind: 'none', count: 0 })
  })
})

describe('lookupClipboard: [클립보드 글로 찾기]', () => {
  it('클립보드 글로 찾는다(출처 clipboard). 가져오기는 하지 않았으므로 method none·0ms·되돌림 없음', async () => {
    const t = make({ clipboard: 'SIL' })
    await t.card.lookupClipboard()
    expect(t.d.capture).not.toHaveBeenCalled()
    const v = t.shown[0]
    expect(v).toMatchObject({ kind: 'best', source: 'clipboard' })
    const count = v.kind === 'best' ? 1 + v.others.length : -1
    expect(t.logs).toEqual([
      { event: 'wiki.card', data: { source: 'clipboard', method: 'none', elapsedMs: 0, restored: false, skipped: null, length: 3, kind: 'best', count } }
    ])
  })

  it('빈 클립보드(공백뿐 포함) → "클립보드에 글이 없어요", 단추 없음', async () => {
    expect(CLIPBOARD_EMPTY_NOTE).toBe('클립보드에 글이 없어요')
    for (const clipboard of ['', '  \n ']) {
      const t = make({ clipboard })
      await t.card.lookupClipboard()
      expect(t.shown).toEqual([{ kind: 'note', message: CLIPBOARD_EMPTY_NOTE, canUseClipboard: false }])
      expect(t.logs[0].data).toMatchObject({ source: 'clipboard', kind: 'note', count: 0, length: clipboard.length })
    }
    const failed = make({ clipboard: new Error('EBUSY') })
    await failed.card.lookupClipboard()
    expect(failed.shown).toEqual([{ kind: 'note', message: CLIPBOARD_EMPTY_NOTE, canUseClipboard: false }])
  })
})

it('로그에는 선택 글·클립보드 글·용어 이름·설명이 없다(길이·종류·수만)', async () => {
  const secret = '가상자동차 MC/DC 회의 메모'
  const runs = [
    make({ capture: captured(secret) }),
    make({ capture: captured('XY방산 정적분석 결과에서 MC/DC 커버리지가 부족') }),
    make({ capture: captured('zzqxw') }),
    make({ capture: skipped('terminal'), clipboard: 'XY방산 클립보드 글' })
  ]
  for (const t of runs) await t.card.lookupSelection()
  const viaClipboard = make({ clipboard: 'XY방산 SIL 시험' })
  await viaClipboard.card.lookupClipboard()
  const json = JSON.stringify([...runs, viaClipboard].flatMap((t) => t.logs))
  for (const word of ['가상자동차', 'XY방산', 'MC/DC', 'mcdc', 'SIL', '정적분석', 'zzqxw', '커버리지', '클립보드 글']) expect(json, word).not.toContain(word)
})

it('색인은 같은 용어 배열이면 다시 만들지 않는다(WeakMap), 새 배열이면 새로 만든다', async () => {
  const build = vi.mocked(lookup.buildGlossaryIndex)
  build.mockClear()
  const entries = [...pack]
  const t = make({ entries, capture: captured('ㅈㅈㅂㅅ') })
  await t.card.lookupSelection()
  await t.card.lookupSelection()
  await t.card.lookupClipboard()
  expect(build).toHaveBeenCalledTimes(1)
  t.d.entries.mockResolvedValue([...pack])
  await t.card.lookupSelection()
  expect(build).toHaveBeenCalledTimes(2)
})
