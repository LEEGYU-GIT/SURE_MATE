import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { MASK_DICTIONARY_FILE } from './dictionary-store'
import { createTermsCache } from './terms-cache'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-terms-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const dict = (canonical: string): string =>
  JSON.stringify({ format: 'sure-mate-masking', version: 1, terms: [{ id: 'a', category: 'client', canonical, aliases: [] }] })

it('사전 파일이 없으면 빈 사전, 오류 0', async () => {
  expect(await createTermsCache(dir, () => {})()).toEqual({ terms: [], errors: 0 })
})

it('수정 시각이 같으면 다시 읽지 않고, 바뀌면 다시 읽는다', async () => {
  const path = join(dir, MASK_DICTIONARY_FILE)
  await writeFile(path, dict('가상자동차'))
  await utimes(path, 1000, 1000)
  let loads = 0
  const load = createTermsCache(dir, () => {}, async (d) => {
    loads++
    const { loadMaskDictionary } = await import('./dictionary-store')
    return loadMaskDictionary(d)
  })
  expect((await load()).terms.map((t) => t.canonical)).toEqual(['가상자동차'])
  await load()
  expect(loads).toBe(1)
  await writeFile(path, dict('XY방산'))
  await utimes(path, 2000, 2000)
  expect((await load()).terms.map((t) => t.canonical)).toEqual(['XY방산'])
  expect(loads).toBe(2)
})

it('사전 오류는 알리고(바뀔 때 한 번), 오류 건수를 함께 돌려준다', async () => {
  await writeFile(join(dir, MASK_DICTIONARY_FILE), '{oops')
  const reported: number[] = []
  const load = createTermsCache(dir, (errors) => reported.push(errors.length))
  expect(await load()).toEqual({ terms: [], errors: 1 })
  await load()
  expect(reported).toEqual([1])
})
