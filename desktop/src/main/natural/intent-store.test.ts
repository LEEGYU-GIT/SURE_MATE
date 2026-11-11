import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import builtin from '../../../resources/intents.json'
import { parseIntentPack } from '../../shared/natural/intent-pack'
import { createIntentCache, ensureUserIntents, INTENTS_FILE } from './intent-store'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-intents-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const base = parseIntentPack(builtin).pack!
const user = { format: 'sure-mate-intents', version: 1, fillers: ['음'], endings: ['해줘'], particles: ['을'], intents: [{ id: 'mine', label: '내것', words: ['내'], targets: [{ group: 'wiki' }] }] }
const path = (): string => join(dir, INTENTS_FILE)

it('사용자 파일이 없으면 기본 목록', async () => {
  const onErrors = vi.fn()
  expect(await createIntentCache(dir, builtin, onErrors).get()).toEqual(base)
  expect(onErrors).not.toHaveBeenCalled()
})

it('정상 사용자 파일이면 그 목록만 쓴다(기본과 합치지 않음)', async () => {
  await writeFile(path(), JSON.stringify(user))
  const pack = await createIntentCache(dir, builtin, vi.fn()).get()
  expect(pack.intents.map((r) => r.id)).toEqual(['mine'])
  expect(pack.endings).toEqual(['해줘'])
})

it('BOM이 붙은 파일도 읽힌다', async () => {
  await writeFile(path(), '﻿' + JSON.stringify(user))
  const onErrors = vi.fn()
  expect((await createIntentCache(dir, builtin, onErrors).get()).intents[0].id).toBe('mine')
  expect(onErrors).not.toHaveBeenCalled()
})

it('깨진 파일은 기본 목록과 알림 한 번(내용 없이)', async () => {
  await writeFile(path(), '{')
  const onErrors = vi.fn()
  const cache = createIntentCache(dir, builtin, onErrors)
  expect(await cache.get()).toEqual(base)
  await cache.get()
  expect(onErrors).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(onErrors.mock.calls)).toContain('PARSE')
})

it('형식이 다른 파일은 기본 목록과 알림', async () => {
  await writeFile(path(), JSON.stringify({ format: 'other', version: 1 }))
  const onErrors = vi.fn()
  expect(await createIntentCache(dir, builtin, onErrors).get()).toEqual(base)
  expect(onErrors).toHaveBeenCalledTimes(1)
})

it('일부 값을 뺀 파일은 읽을 수 있는 목록을 쓰고 알린다', async () => {
  await writeFile(path(), JSON.stringify({ ...user, endings: ['해줘', 3] }))
  const onErrors = vi.fn()
  const pack = await createIntentCache(dir, builtin, onErrors).get()
  expect(pack.intents[0].id).toBe('mine')
  expect(onErrors).toHaveBeenCalledTimes(1)
})

it('수정 시각·크기가 같으면 다시 읽지 않고, 바뀌면 다시 읽는다', async () => {
  await writeFile(path(), JSON.stringify(user))
  const t = new Date('2026-11-11T00:00:00Z')
  await utimes(path(), t, t)
  const cache = createIntentCache(dir, builtin, vi.fn())
  const a = await cache.get()
  expect(await cache.get()).toBe(a)
  // 같은 크기·같은 시각으로 내용만 바꾸면 못 알아챈다(수정 시각·크기 기준)
  await writeFile(path(), JSON.stringify(user).replace('내것', '네것'))
  await utimes(path(), t, t)
  expect((await cache.get()).intents[0].label).toBe('내것')
  await writeFile(path(), JSON.stringify({ ...user, fillers: ['음', '어'] }))
  expect((await cache.get()).fillers).toEqual(['음', '어'])
})

it('ensureUserIntents는 없을 때만 기본 목록을 쓰고 두 번째는 덮어쓰지 않는다', async () => {
  expect(await ensureUserIntents(dir, builtin)).toBe(path())
  expect(await readFile(path(), 'utf8')).toBe(JSON.stringify(builtin, null, 2))
  await writeFile(path(), 'mine')
  await ensureUserIntents(dir, builtin)
  expect(await readFile(path(), 'utf8')).toBe('mine')
})
