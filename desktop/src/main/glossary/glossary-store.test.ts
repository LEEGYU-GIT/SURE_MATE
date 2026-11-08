import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { GlossaryEntry } from '../../shared/glossary/types'
import { createGlossaryCache, GLOSSARY_FILE, loadGlossary, saveUserEntries } from './glossary-store'

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
  await writeFile(join(dir, GLOSSARY_FILE), '﻿' + pack([raw({ id: 'sa', term: '정적분석(우리 팀)', version: 2 }), raw({ id: 'new', term: '새 용어' })]))
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
