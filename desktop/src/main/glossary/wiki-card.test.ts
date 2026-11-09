import { expect, it } from 'vitest'
import type { WikiCardView } from '../../shared/flyout/flyout-content'
import type { GlossaryEntry } from '../../shared/glossary/types'
import { CAPTURE_NOTES } from '../../shared/labels'
import type { CaptureResult } from '../../shared/types'
import { createWikiCard } from './wiki-card'

const entry = (id: string, term: string, aliases: string[] = []): GlossaryEntry => ({
  id,
  term,
  aliases,
  definition: `${term} 설명`,
  links: [],
  tags: [],
  source: 'builtin',
  updatedAt: '2026-11-09T00:00:00.000Z',
  version: 1
})
const glossary = [entry('mcdc', 'MC/DC', ['MCDC']), entry('sa', '정적분석')]

function fake(o: { capture?: CaptureResult; clipboard?: string } = {}) {
  const shown: WikiCardView[] = []
  const logs: Record<string, unknown>[] = []
  const card = createWikiCard({
    capture: async () => o.capture ?? { text: 'MC/DC', method: 'ctrl-insert', elapsedMs: 40, restored: true },
    readClipboard: async () => o.clipboard ?? '',
    entries: async () => glossary,
    show: (v) => shown.push(v),
    log: (_e, data) => logs.push(data)
  })
  return { card, shown, logs }
}

it('가져온 글로 찾아 카드를 띄운다', async () => {
  const f = fake()
  await f.card.lookupSelection()
  expect(f.shown).toHaveLength(1)
  expect(f.shown[0]).toMatchObject({ kind: 'best', source: 'selection', best: { id: 'mcdc', term: 'MC/DC' } })
})

it('다른 가져오기가 진행 중(busy)이면 카드를 띄우지 않고 기록만 한다', async () => {
  const f = fake({ capture: { text: null, method: 'none', elapsedMs: 0, restored: false, skipped: 'busy' } })
  await f.card.lookupSelection()
  expect(f.shown).toEqual([])
  expect(f.logs).toHaveLength(1)
})

it('가져오지 못했으면 까닭을 보이고, 클립보드에 글이 있을 때만 클립보드로 찾기를 제안한다(자동으로 찾지 않음)', async () => {
  const terminal = fake({ capture: { text: null, method: 'none', elapsedMs: 0, restored: false, skipped: 'terminal' }, clipboard: 'MC/DC 관련 메모' })
  await terminal.card.lookupSelection()
  expect(terminal.shown[0]).toEqual({ kind: 'note', message: CAPTURE_NOTES.terminal, canUseClipboard: true })
  const empty = fake({ capture: { text: null, method: 'none', elapsedMs: 0, restored: false, skipped: 'terminal' } })
  await empty.card.lookupSelection()
  expect(empty.shown[0]).toMatchObject({ canUseClipboard: false })
  const blank = fake({ capture: { text: ' \n ', method: 'ctrl-insert', elapsedMs: 30, restored: true } })
  await blank.card.lookupSelection()
  expect(blank.shown[0]).toMatchObject({ kind: 'note', message: CAPTURE_NOTES['nothing-selected'] })
})

it('클립보드 글로 찾기, 클립보드가 비었으면 그렇게 알린다', async () => {
  const f = fake({ clipboard: '정적분석' })
  await f.card.lookupClipboard()
  expect(f.shown[0]).toMatchObject({ kind: 'best', source: 'clipboard', best: { id: 'sa' } })
  const empty = fake()
  await empty.card.lookupClipboard()
  expect(empty.shown[0]).toEqual({ kind: 'note', message: '클립보드에 글이 없어요', canUseClipboard: false })
})

it('로그에는 가져오기 수치와 결과 종류·건수만(선택 글·용어 이름 없음)', async () => {
  const f = fake({ capture: { text: '정적분석 결과에서 MC/DC 커버리지가 부족한 함수 목록', method: 'ctrl-c', elapsedMs: 120, restored: true } })
  await f.card.lookupSelection()
  expect(f.logs[0]).toMatchObject({ source: 'selection', method: 'ctrl-c', elapsedMs: 120, restored: true, kind: 'found', count: 2 })
  expect(JSON.stringify(f.logs)).not.toMatch(/정적분석|MC\/DC|커버리지/)
})
