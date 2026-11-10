import { expect, it, vi } from 'vitest'
import { wikiSaveErrorText } from '../../shared/glossary/save-error'
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

function fake(): {
  deps: GlossaryRuntimeDeps
  calls: { writes: string[]; hides: boolean[]; opened: string[]; notes: string[]; logs: { event: string; data: Record<string, unknown> }[] }
} {
  const calls = { writes: [] as string[], hides: [] as boolean[], opened: [] as string[], notes: [] as string[], logs: [] as { event: string; data: Record<string, unknown> }[] }
  return {
    calls,
    deps: {
      entries: async () => [entry],
      writeClipboard: async (text) => {
        calls.writes.push(text)
      },
      waitKeysReleased: async () => true,
      hidePalette: (restoreFocus) => {
        calls.hides.push(restoreFocus)
      },
      notify: (message) => calls.notes.push(message),
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

/**
 * Enter를 holdMs 동안 누르고 있는 가짜 키보드. 진짜 waitPickKeysReleased처럼 10ms마다 확인하고,
 * limitMs(PICK_KEYS_WAIT_MS 0.6초) 안에 떼면 true, 못 떼면 false
 */
const enterHeldFor =
  (holdMs: number, limitMs = 600): (() => Promise<boolean>) =>
  () =>
    new Promise((resolve) => {
      const start = Date.now()
      const check = (): void => {
        const held = Date.now() - start
        if (held >= holdMs) resolve(true)
        else if (held >= limitMs) resolve(false)
        else setTimeout(check, 10)
      }
      check()
    })

it('설명 복사: 누른 Enter를 뗀 뒤에야 팔레트를 닫고 원래 창으로 돌아간다(자동 반복 Enter가 문서에 들어가지 않게)', async () => {
  vi.useFakeTimers()
  try {
    const f = fake()
    f.deps.waitKeysReleased = enterHeldFor(300)
    const copied = createGlossaryRuntime(f.deps).copy('mcdc')
    await vi.advanceTimersByTimeAsync(250)
    // 복사는 했지만 Enter를 누르고 있는 동안은 팔레트가 앞에 남아 반복 Enter를 받는다
    expect(f.calls.writes).toEqual([entry.definition])
    expect(f.calls.hides).toEqual([])
    await vi.advanceTimersByTimeAsync(100)
    expect(await copied).toBe(true)
    expect(f.calls.hides).toEqual([true])
    expect(f.calls.notes).toEqual([])
  } finally {
    vi.useRealTimers()
  }
})

it('설명 복사: 0.6초 안에 Enter를 떼지 않으면 팔레트를 닫지 않고, 복사했다고 알린다', async () => {
  vi.useFakeTimers()
  try {
    const f = fake()
    f.deps.waitKeysReleased = enterHeldFor(1500)
    const copied = createGlossaryRuntime(f.deps).copy('mcdc')
    await vi.advanceTimersByTimeAsync(700)
    expect(await copied).toBe(true)
    expect(f.calls.writes).toEqual([entry.definition])
    expect(f.calls.hides).toEqual([])
    expect(f.calls.notes).toEqual([expect.stringContaining('복사했어요')])
    expect(f.calls.logs.map((l) => l.event)).toEqual(['wiki.copy', 'wiki.copy.keysHeld'])
    expect(JSON.stringify(f.calls.logs)).not.toMatch(/MC\/DC|커버리지/)
  } finally {
    vi.useRealTimers()
  }
})

it('설명 복사 안내: 상세 화면의 Esc는 목록으로 돌아가므로 Esc를 두 번 눌러 닫으라고 알린다', async () => {
  const f = fake()
  f.deps.waitKeysReleased = async () => false
  expect(await createGlossaryRuntime(f.deps).copy('mcdc')).toBe(true)
  expect(f.calls.notes).toHaveLength(1)
  expect(f.calls.notes[0]).not.toContain('Esc로 닫은 뒤')
  expect(f.calls.notes[0]).toContain('Esc를 두 번 눌러 팔레트를 닫은 뒤')
})

it('위키 카드의 설명 복사는 설명만 쓰고 팔레트·포커스·키는 건드리지 않는다(숨은 팔레트를 닫으면 옛 창으로 포커스가 갈 수 있다)', async () => {
  const f = fake()
  const waited = vi.fn(async () => true)
  f.deps.waitKeysReleased = waited
  expect(await createGlossaryRuntime(f.deps).copyForCard('mcdc')).toBe(true)
  expect(f.calls.writes).toEqual([entry.definition])
  expect(f.calls.hides).toEqual([])
  expect(waited).not.toHaveBeenCalled()
  expect(f.calls.notes).toEqual([])
  expect(f.calls.logs).toEqual([{ event: 'wiki.card.copy', data: { id: 'mcdc', length: entry.definition.length } }])
})

it('위키 카드의 설명 복사: 그사이 용어가 없어졌으면 쓰지 않고 false(카드가 그렇다고 알린다), 로그에는 id만', async () => {
  const f = fake()
  expect(await createGlossaryRuntime(f.deps).copyForCard('지운-용어')).toBe(false)
  expect(f.calls.writes).toEqual([])
  expect(f.calls.hides).toEqual([])
  expect(f.calls.logs).toEqual([{ event: 'wiki.card.copy', data: { id: '지운-용어', missing: true } }])
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

it('파일 저장이 실패하면(백신이 파일을 잡음) 던지지 않고 제품 문구로 돌려주며, 로그에는 오류 코드만 남긴다', async () => {
  const s = saving()
  const logs: { event: string; data: Record<string, unknown> }[] = []
  s.deps.log = (event, data) => logs.push({ event, data })
  s.deps.saveUserEntries = async () => {
    throw Object.assign(new Error("EPERM: operation not permitted, rename 'C:\\Users\\가상사용자\\AppData\\Roaming\\Sure-Mate\\glossary.json.1.tmp'"), { code: 'EPERM' })
  }
  const r = await createGlossaryRuntime(s.deps).save(draft, { allowDuplicate: false })
  expect(r).toEqual({ ok: false, errors: [wikiSaveErrorText('EPERM')] })
  expect(logs).toEqual([{ event: 'wiki.save.error', data: { id: '11111111-2222-4333-8444-555555555555', isNew: true, code: 'EPERM' } }])
  expect(JSON.stringify(logs)).not.toMatch(/Users|가상사용자|정적분석/)
})

it('제한을 넘는 항목은 저장하지 않고 까닭을 돌려준다', async () => {
  const s = saving()
  const r = await createGlossaryRuntime(s.deps).save({ ...draft, definition: '가'.repeat(1001) }, { allowDuplicate: false })
  expect(r).toMatchObject({ ok: false, errors: [expect.stringContaining('설명')] })
  expect(s.saved).toEqual([])
})

it('지우기: 내 용어는 지우고, 고친 기본 용어 사본을 지우면 기본으로, 기본 용어는 builtin, 없으면 missing, 저장 실패는 save-failed', async () => {
  const mine: GlossaryEntry = { ...entry, id: 'u1', term: '가상 용어', source: 'user' }
  const editedBuiltin: GlossaryEntry = { ...entry, definition: '고친 설명', source: 'user' }
  const s = saving([mine, editedBuiltin])
  const rt = createGlossaryRuntime(s.deps)
  expect(await rt.remove('u1')).toEqual({ ok: true })
  expect(await rt.remove('mcdc')).toEqual({ ok: true })
  expect((await rt.get('mcdc'))?.definition).toBe(entry.definition)
  expect(await rt.remove('mcdc')).toEqual({ ok: false, reason: 'builtin' })
  expect(await rt.remove('nope')).toEqual({ ok: false, reason: 'missing' })
  const failing = saving([mine])
  failing.deps.saveUserEntries = async () => {
    throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' })
  }
  expect(await createGlossaryRuntime(failing.deps).remove('u1')).toEqual({ ok: false, reason: 'save-failed' })
})
