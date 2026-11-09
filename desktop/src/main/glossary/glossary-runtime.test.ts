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
      userEntries: async () => [],
      saveUserEntries: async () => {},
      newId: () => 'new-id',
      now: () => '2026-11-09T00:00:00.000Z',
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

function saving(existingUser: GlossaryEntry[] = []): {
  deps: GlossaryRuntimeDeps
  saved: GlossaryEntry[][]
} {
  const saved: GlossaryEntry[][] = []
  let user = [...existingUser]
  const all = (): GlossaryEntry[] => {
    const byId = new Map([entry].map((e) => [e.id, e]))
    for (const e of user) byId.set(e.id, e)
    return [...byId.values()]
  }
  return {
    saved,
    deps: {
      ...fake().deps,
      entries: async () => all(),
      userEntries: async () => user,
      saveUserEntries: async (list) => {
        user = list
        saved.push(list)
      },
      newId: () => '11111111-2222-4333-8444-555555555555',
      now: () => '2026-11-09T10:00:00.000Z'
    }
  }
}

const draft = { term: '정적분석', aliases: ['SA'], definition: '실행하지 않고 코드를 분석', links: [], tags: [] }

it('새 용어는 uuid·version 1·내 용어로 사용자 파일에 더한다', async () => {
  const s = saving()
  const r = await createGlossaryRuntime(s.deps).save(draft, { allowDuplicate: false })
  expect(r).toMatchObject({ ok: true, entry: { id: '11111111-2222-4333-8444-555555555555', term: '정적분석', source: 'user', version: 1, updatedAt: '2026-11-09T10:00:00.000Z' } })
  expect(s.saved[0].map((e) => e.term)).toEqual(['정적분석'])
})

it('같은 정규화 키의 용어가 있으면 저장하지 않고 먼저 보여 주고, 그래도 추가하면 둘 다 둔다', async () => {
  const s = saving()
  const runtime = createGlossaryRuntime(s.deps)
  const dup = await runtime.save({ ...draft, term: 'mc dc' }, { allowDuplicate: false })
  expect(dup).toMatchObject({ ok: false, duplicate: { id: 'mcdc', term: 'MC/DC' } })
  expect(s.saved).toEqual([])
  expect(await runtime.save({ ...draft, term: 'mc dc' }, { allowDuplicate: true })).toMatchObject({ ok: true })
  expect(s.saved).toHaveLength(1)
})

it('기본 용어를 고치면 같은 id의 내 용어로 저장하고 version을 올린다', async () => {
  const s = saving()
  const r = await createGlossaryRuntime(s.deps).save({ ...draft, term: 'MC/DC', definition: '우리 팀 설명' }, { id: 'mcdc', allowDuplicate: false })
  expect(r).toMatchObject({ ok: true, entry: { id: 'mcdc', definition: '우리 팀 설명', source: 'user', version: 2 } })
  expect(s.saved[0].map((e) => e.id)).toEqual(['mcdc'])
})

it('고쳐도 작성자(닉네임)는 그대로 둔다(편집 화면에는 작성자 칸이 없다)', async () => {
  const mine: GlossaryEntry = { ...entry, id: 'u1', term: '우리 팀 용어', author: '검증팀', source: 'user' }
  const s = saving([mine])
  const r = await createGlossaryRuntime(s.deps).save({ ...draft, term: '우리 팀 용어', definition: '고친 설명' }, { id: 'u1', allowDuplicate: false })
  expect(r).toMatchObject({ ok: true, entry: { id: 'u1', definition: '고친 설명', author: '검증팀', version: 2 } })
  expect(s.saved[0][0].author).toBe('검증팀')
})

it('제한을 넘는 항목은 저장하지 않고 까닭을 돌려준다', async () => {
  const s = saving()
  const r = await createGlossaryRuntime(s.deps).save({ ...draft, definition: '가'.repeat(1001) }, { allowDuplicate: false })
  expect(r).toMatchObject({ ok: false, errors: [expect.stringContaining('설명')] })
  expect(s.saved).toEqual([])
})
