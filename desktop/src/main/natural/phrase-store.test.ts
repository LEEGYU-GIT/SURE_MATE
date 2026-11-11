import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createPhraseStore, PHRASE_MAX, PHRASES_FILE } from './phrase-store'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-phrase-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

let tick = 0
const now = (): Date => new Date(Date.UTC(2026, 10, 11) + tick++ * 1000)
const open = () => createPhraseStore(dir, { now })

it('learn한 문장은 all에 있고 새로 열어도 남는다', async () => {
  await open().learn('보고서띄워줘', 'prompt:report')
  expect((await open().all()).get('보고서띄워줘')).toBe('prompt:report')
  const file = JSON.parse(await readFile(join(dir, PHRASES_FILE), 'utf8'))
  expect(file).toMatchObject({ format: 'sure-mate-phrases', version: 1 })
})

it('같은 key는 새 id로 바뀐다', async () => {
  const s = open()
  await s.learn('k', 'a')
  await s.learn('k', 'b')
  const all = await s.all()
  expect(all.size).toBe(1)
  expect(all.get('k')).toBe('b')
})

it('301개째에서 가장 오래된 것을 뺀다', async () => {
  const s = open()
  for (let i = 0; i <= PHRASE_MAX; i++) await s.learn(`k${i}`, `id${i}`)
  const all = await s.all()
  expect(all.size).toBe(PHRASE_MAX)
  expect(all.has('k0')).toBe(false)
  expect(all.has('k300')).toBe(true)
})

it('깨진 파일은 빈 목록과 .broken 사본, 다음 learn은 정상 파일로 저장한다', async () => {
  await writeFile(join(dir, PHRASES_FILE), '{broken')
  const s = open()
  expect((await s.all()).size).toBe(0)
  expect((await readdir(dir)).some((f) => f.startsWith(`${PHRASES_FILE}.broken-`))).toBe(true)
  await s.learn('k', 'a')
  expect((await open().all()).get('k')).toBe('a')
})

it('일부 항목만 읽히면 읽힌 것을 쓰고 사본을 남긴다', async () => {
  await writeFile(join(dir, PHRASES_FILE), JSON.stringify({ format: 'sure-mate-phrases', version: 1, entries: [{ key: 'k', id: 'a', at: 'x' }, 5] }))
  expect((await open().all()).get('k')).toBe('a')
  expect((await readdir(dir)).some((f) => f.includes('.broken-'))).toBe(true)
})

it('동시에 learn해도 둘 다 저장된다', async () => {
  const s = open()
  await Promise.all([s.learn('a', '1'), s.learn('b', '2')])
  const all = await open().all()
  expect([...all]).toEqual(expect.arrayContaining([['a', '1'], ['b', '2']]))
})
