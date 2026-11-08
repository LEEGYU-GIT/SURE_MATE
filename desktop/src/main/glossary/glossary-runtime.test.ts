import { expect, it } from 'vitest'
import type { GlossaryEntry } from '../../shared/glossary/types'
import { createGlossaryRuntime, type GlossaryRuntimeDeps } from './glossary-runtime'

const entry: GlossaryEntry = {
  id: 'mcdc',
  term: 'MC/DC',
  aliases: [],
  definition: '조건마다 결정을 독립적으로 바꾸는지 보는 커버리지',
  links: [
    { title: '설명 문서', url: 'https://example.com/mcdc' },
    { title: '잘못 들어온 링크', url: 'javascript:alert(1)' }
  ],
  tags: [],
  source: 'builtin',
  updatedAt: '2026-11-09T00:00:00.000Z',
  version: 1
}

function fake(): { deps: GlossaryRuntimeDeps; calls: { writes: string[]; hides: boolean[]; opened: string[]; logs: { event: string; data: Record<string, unknown> }[] } } {
  const calls = { writes: [] as string[], hides: [] as boolean[], opened: [] as string[], logs: [] as { event: string; data: Record<string, unknown> }[] }
  return {
    calls,
    deps: {
      entries: async () => [entry],
      writeClipboard: async (text) => {
        calls.writes.push(text)
      },
      hidePalette: (restoreFocus) => {
        calls.hides.push(restoreFocus)
      },
      openExternal: async (url) => {
        calls.opened.push(url)
      },
      log: (event, data) => calls.logs.push({ event, data })
    }
  }
}

it('id로 항목을 돌려주고, 없으면 null', async () => {
  const r = createGlossaryRuntime(fake().deps)
  expect(await r.get('mcdc')).toEqual(entry)
  expect(await r.get('없음')).toBeNull()
})

it('설명 복사는 설명만 쓰고 팔레트를 닫아 원래 창으로 돌아가며, 로그에는 id와 길이만', async () => {
  const f = fake()
  expect(await createGlossaryRuntime(f.deps).copy('mcdc')).toBe(true)
  expect(f.calls.writes).toEqual([entry.definition])
  expect(f.calls.hides).toEqual([true])
  expect(JSON.stringify(f.calls.logs)).not.toMatch(/MC\/DC|커버리지/)
  expect(f.calls.logs[0].data).toEqual({ id: 'mcdc', length: entry.definition.length })
})

it('링크는 그 항목의 http/https 링크만 번호로 연다', async () => {
  const f = fake()
  const r = createGlossaryRuntime(f.deps)
  expect(await r.openLink('mcdc', 0)).toBe(true)
  expect(await r.openLink('mcdc', 1)).toBe(false)
  expect(await r.openLink('mcdc', 5)).toBe(false)
  expect(await r.openLink('없음', 0)).toBe(false)
  expect(f.calls.opened).toEqual(['https://example.com/mcdc'])
  expect(f.calls.hides).toEqual([false])
})
