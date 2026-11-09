import { mkdtemp, readdir, readFile, rename, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { GlossaryEntry } from '../../shared/glossary/types'
import { fileErrorNotice } from '../file-error-notice'
import { createGlossaryCache, GLOSSARY_FILE, loadGlossary, RENAME_RETRY_MS, saveUserEntries, type SaveIo } from './glossary-store'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-glossary-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const raw = (o: Partial<GlossaryEntry>): Partial<GlossaryEntry> => ({
  aliases: [],
  definition: '설명',
  links: [],
  tags: [],
  updatedAt: '2026-11-09T00:00:00.000Z',
  version: 1,
  ...o
})
const pack = (entries: unknown[]): string => JSON.stringify({ format: 'sure-mate-glossary', version: 1, entries })
const builtin = JSON.parse(pack([raw({ id: 'mcdc', term: 'MC/DC' }), raw({ id: 'sa', term: '정적분석' })]))

it('사용자 파일이 없으면 기본 팩만', async () => {
  const r = await loadGlossary(dir, builtin)
  expect(r.entries.map((e) => e.id)).toEqual(['mcdc', 'sa'])
  expect(r.userEntries).toEqual([])
  expect(r.errors).toEqual([])
})

it('같은 id는 사용자 것이 이기고(자리는 기본 팩 순서), 새 id는 뒤에 붙는다. BOM이 있어도 읽는다', async () => {
  await writeFile(join(dir, GLOSSARY_FILE), '\uFEFF' + pack([raw({ id: 'sa', term: '정적분석(우리 팀)', version: 2 }), raw({ id: 'new', term: '새 용어' })]))
  const r = await loadGlossary(dir, builtin)
  expect(r.entries.map((e) => [e.id, e.term, e.source])).toEqual([
    ['mcdc', 'MC/DC', 'builtin'],
    ['sa', '정적분석(우리 팀)', 'user'],
    ['new', '새 용어', 'user']
  ])
  expect(r.userEntries).toHaveLength(2)
})

it('사용자 파일이 깨졌으면 기본 팩은 그대로 쓰고 오류를 남기며 파일을 고치지 않는다', async () => {
  await writeFile(join(dir, GLOSSARY_FILE), '{고장')
  const r = await loadGlossary(dir, builtin)
  expect(r.entries.map((e) => e.id)).toEqual(['mcdc', 'sa'])
  expect(r.errors[0]).toContain(GLOSSARY_FILE)
  expect(await readFile(join(dir, GLOSSARY_FILE), 'utf8')).toBe('{고장')
})

it('저장하면 다시 읽히고, 깨진 파일을 덮어쓰기 전에는 사본을 남긴다', async () => {
  await writeFile(join(dir, GLOSSARY_FILE), '{고장')
  const mine = JSON.parse(pack([raw({ id: 'x', term: '내 용어', source: 'user' })])).entries as GlossaryEntry[]
  await saveUserEntries(dir, mine)
  const r = await loadGlossary(dir, builtin)
  expect(r.entries.map((e) => e.term)).toContain('내 용어')
  const files = await readdir(dir)
  const broken = files.find((f) => f.startsWith(`${GLOSSARY_FILE}.broken-`))
  expect(broken).toBeDefined()
  expect(await readFile(join(dir, broken!), 'utf8')).toBe('{고장')
  expect(files.some((f) => f.endsWith('.tmp'))).toBe(false)
})

it('일부 항목만 읽지 못한 파일도 처음 덮어쓰기 전에 사본을 남긴다(읽지 못한 항목을 잃지 않게)', async () => {
  const original = pack([
    raw({ id: 'u1', term: '읽히는 용어' }),
    raw({ id: 'u2', term: '설명이 긴 용어', definition: '가'.repeat(1001) }),
    raw({ id: 'u3', term: '태그가 많은 용어', tags: ['1', '2', '3', '4', '5', '6'] })
  ])
  await writeFile(join(dir, GLOSSARY_FILE), original)
  const loaded = await loadGlossary(dir, builtin)
  expect(loaded.userEntries.map((e) => e.id)).toEqual(['u1', 'u3'])
  const added = JSON.parse(pack([raw({ id: 'new', term: '새 용어', source: 'user' })])).entries as GlossaryEntry[]
  await saveUserEntries(dir, [...loaded.userEntries, ...added])
  const backups = (await readdir(dir)).filter((f) => f.startsWith(`${GLOSSARY_FILE}.broken-`))
  expect(backups).toHaveLength(1)
  expect(await readFile(join(dir, backups[0]), 'utf8')).toBe(original)
  // 다시 저장할 때는 파일에 문제가 없으니 사본을 또 만들지 않는다
  await saveUserEntries(dir, [...loaded.userEntries, ...added])
  expect((await readdir(dir)).filter((f) => f.startsWith(`${GLOSSARY_FILE}.broken-`))).toHaveLength(1)
  // 읽힌 항목이 있으니 "파일을 읽지 못함"은 아니다
  expect(loaded.userBroken).toBe(false)
})

it('읽을 때 통째로 건너뛴 항목과 일부 값만 뺀 항목을 따로 세어, 트레이 알림이 일부만 뺀 용어를 건너뛰었다고 하지 않는다', async () => {
  await writeFile(
    join(dir, GLOSSARY_FILE),
    pack([
      raw({ id: 'u1', term: '읽히는 용어' }),
      raw({ id: 'u2', term: '설명이 긴 용어', definition: '가'.repeat(1001) }),
      raw({ id: 'u3', term: '태그가 많은 용어', tags: ['1', '2', '3', '4', '5', '6'] })
    ])
  )
  const loaded = await loadGlossary(dir, builtin)
  expect(loaded.userEntries.map((e) => e.id)).toEqual(['u1', 'u3'])
  expect(loaded.errors).toHaveLength(2)
  expect(loaded.trimmed).toBe(1)
  expect(fileErrorNotice({ what: '용어', errors: loaded.errors, trimmed: loaded.trimmed })).toBe(
    `용어 1건을 읽지 못해 건너뛰었고, 1건은 링크·태그 등 일부 값을 빼고 읽었어요. ${loaded.errors[0]}`
  )

  // 캐시도 그 수를 함께 넘긴다
  const reported: [number, number][] = []
  await createGlossaryCache(dir, builtin, (errors, trimmed) => reported.push([errors.length, trimmed])).get()
  expect(reported).toEqual([[2, 1]])

  // 태그만 넘친 파일이면 건너뛴 것이 없다
  await writeFile(join(dir, GLOSSARY_FILE), pack([raw({ id: 'u3', term: '태그가 많은 용어', tags: ['1', '2', '3', '4', '5', '6'] })]))
  const onlyTrimmed = await loadGlossary(dir, builtin)
  expect([onlyTrimmed.errors.length, onlyTrimmed.trimmed]).toEqual([1, 1])
  expect(fileErrorNotice({ what: '용어', errors: onlyTrimmed.errors, trimmed: onlyTrimmed.trimmed })).not.toContain('건너뛰')
})

it('읽을 수 있는 항목이 하나도 없는 파일이면 userBroken(내보내기가 "없음" 대신 "읽지 못함"을 알리게)', async () => {
  expect((await loadGlossary(dir, builtin)).userBroken).toBe(false)
  await writeFile(join(dir, GLOSSARY_FILE), '{고장')
  expect((await loadGlossary(dir, builtin)).userBroken).toBe(true)
  await writeFile(join(dir, GLOSSARY_FILE), pack([raw({ id: 'u2', term: '설명이 긴 용어', definition: '가'.repeat(1001) })]))
  expect((await loadGlossary(dir, builtin)).userBroken).toBe(true)
})

it('저장: 폴더가 없으면 만들고, 동시에 저장해도 임시 파일이 겹치지 않으며, 임시 파일을 남기지 않는다', async () => {
  const sub = join(dir, '새 폴더', '안쪽')
  const one = JSON.parse(pack([raw({ id: 'a', term: '하나', source: 'user' })])).entries as GlossaryEntry[]
  const two = JSON.parse(pack([raw({ id: 'b', term: '둘', source: 'user' })])).entries as GlossaryEntry[]
  await Promise.all([saveUserEntries(sub, one), saveUserEntries(sub, two)])
  const saved = JSON.parse(await readFile(join(sub, GLOSSARY_FILE), 'utf8')) as { entries: GlossaryEntry[] }
  expect([['a'], ['b']]).toContainEqual(saved.entries.map((e) => e.id))
  expect((await readdir(sub)).filter((f) => f.endsWith('.tmp'))).toEqual([])
})

/** 이름 바꾸기가 앞의 몇 번은 code로 실패하는 가짜 io */
function flakyRename(failures: number, code: string): { io: SaveIo; sleeps: number[]; calls: () => number } {
  const sleeps: number[] = []
  let n = 0
  return {
    sleeps,
    calls: () => n,
    io: {
      rename: async (from, to) => {
        n++
        if (n <= failures) throw Object.assign(new Error(`${code}: rename`), { code })
        await rename(from, to)
      },
      sleep: async (ms) => {
        sleeps.push(ms)
      }
    }
  }
}

it('이름 바꾸기가 EPERM·EBUSY로 실패하면(백신이 파일을 잠깐 잡음) 짧게 다시 해 본다', async () => {
  const mine = JSON.parse(pack([raw({ id: 'x', term: '내 용어', source: 'user' })])).entries as GlossaryEntry[]
  const busy = flakyRename(2, 'EBUSY')
  await saveUserEntries(dir, mine, busy.io)
  expect(busy.sleeps).toEqual(RENAME_RETRY_MS.slice(0, 2))
  expect((await loadGlossary(dir, builtin)).userEntries.map((e) => e.id)).toEqual(['x'])

  const locked = flakyRename(99, 'EPERM')
  await expect(saveUserEntries(dir, mine, locked.io)).rejects.toMatchObject({ code: 'EPERM' })
  expect(locked.calls()).toBe(RENAME_RETRY_MS.length + 1)
  expect(RENAME_RETRY_MS.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1000)

  const full = flakyRename(1, 'ENOSPC')
  await expect(saveUserEntries(dir, mine, full.io)).rejects.toMatchObject({ code: 'ENOSPC' })
  expect(full.calls()).toBe(1)
  // 실패해도 임시 파일을 남기지 않는다
  expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([])
})

it('캐시는 사용자 파일이 바뀔 때만 다시 읽고, 오류는 바뀔 때 한 번 알린다', async () => {
  const reported: number[] = []
  const cache = createGlossaryCache(dir, builtin, (errors) => reported.push(errors.length))
  expect((await cache.get()).entries.map((e) => e.id)).toEqual(['mcdc', 'sa'])
  const file = join(dir, GLOSSARY_FILE)
  await writeFile(file, pack([raw({ id: 'new', term: '새 용어' })]))
  await utimes(file, 1000, 1000)
  expect((await cache.get()).entries.map((e) => e.id)).toEqual(['mcdc', 'sa', 'new'])
  await writeFile(file, '{고장')
  await utimes(file, 2000, 2000)
  await cache.get()
  await cache.get()
  expect(reported).toEqual([1])
})
