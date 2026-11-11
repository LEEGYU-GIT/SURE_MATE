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

it('state: 파일이 없으면 기본 목록(builtin), 문제 없음', async () => {
  expect(await createIntentCache(dir, builtin, vi.fn()).state()).toEqual({ pack: base, source: 'builtin', errors: [] })
})

it('state: 읽을 수 있는 사용자 파일이면 그 목록(user)', async () => {
  await writeFile(path(), JSON.stringify(user))
  const s = await createIntentCache(dir, builtin, vi.fn()).state()
  expect(s.source).toBe('user')
  expect(s.pack.intents.map((r) => r.id)).toEqual(['mine'])
  expect(s.errors).toEqual([])
})

it('state: 깨진 파일은 기본 목록과 문제 한 건(파일 이름·내용 없이 코드만), 알림은 한 번', async () => {
  await writeFile(path(), '{"fillers": ["가상자동차 비밀')
  const onErrors = vi.fn()
  const cache = createIntentCache(dir, builtin, onErrors)
  const s = await cache.state()
  expect(s).toEqual({ pack: base, source: 'builtin', errors: ['읽지 못함(PARSE)'] })
  expect(JSON.stringify(s)).not.toContain('가상자동차')
  // 설정 창이 다시 물어도(파일이 그대로면) 다시 읽거나 다시 알리지 않는다
  expect(await cache.state()).toBe(s)
  expect(await cache.get()).toBe(s.pack)
  expect(onErrors).toHaveBeenCalledTimes(1)
  expect(onErrors).toHaveBeenCalledWith([`${INTENTS_FILE}: 읽지 못함(PARSE)`])
})

it('state: 일부 값을 뺀 파일은 사용자 목록과 문제 목록(순번·까닭만, 단어 없이)', async () => {
  await writeFile(path(), JSON.stringify({ ...user, fillers: ['음', '음'], endings: ['해줘', 3, '가상자동차'.repeat(5)] }))
  const s = await createIntentCache(dir, builtin, vi.fn()).state()
  expect(s.source).toBe('user')
  expect(s.errors).toEqual(['군말 2번째: 중복', '어미 2번째: 문자열이 아님', '어미 3번째: 20자 초과'])
  expect(JSON.stringify(s.errors)).not.toContain('가상자동차')
})

it('state: 형식이 다른 파일은 기본 목록과 그 까닭', async () => {
  await writeFile(path(), JSON.stringify({ format: 'other', version: 1 }))
  expect(await createIntentCache(dir, builtin, vi.fn()).state()).toEqual({ pack: base, source: 'builtin', errors: ['단어 목록 형식이나 판이 다름'] })
})

it('ensureUserIntents는 없을 때만 기본 목록을 쓰고 두 번째는 덮어쓰지 않는다', async () => {
  expect(await ensureUserIntents(dir, builtin)).toBe(path())
  expect(await readFile(path(), 'utf8')).toBe(JSON.stringify(builtin, null, 2))
  await writeFile(path(), 'mine')
  await ensureUserIntents(dir, builtin)
  expect(await readFile(path(), 'utf8')).toBe('mine')
})
