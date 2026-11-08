import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ensureMaskDictionaryFile, loadMaskDictionary, MASK_DICTIONARY_FILE } from './dictionary-store'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-mask-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

it('사전 파일이 없으면 빈 사전', async () => {
  expect(await loadMaskDictionary(dir)).toEqual({ terms: [], errors: [] })
})

it('없으면 가상 예시로 만들고, 다시 읽어도 오류가 없다', async () => {
  const path = await ensureMaskDictionaryFile(dir)
  expect(path).toBe(join(dir, MASK_DICTIONARY_FILE))
  const r = await loadMaskDictionary(dir)
  expect(r.errors).toEqual([])
  expect(r.terms.map((t) => t.canonical)).toEqual(['가상자동차', 'XY방산'])
  // 이미 있으면 덮어쓰지 않는다
  await writeFile(path, JSON.stringify({ format: 'sure-mate-masking', version: 1, terms: [] }))
  await ensureMaskDictionaryFile(dir)
  expect((await loadMaskDictionary(dir)).terms).toEqual([])
})

it('메모장이 붙이는 BOM도 읽고, 깨진 JSON은 오류로 알린다', async () => {
  await writeFile(join(dir, MASK_DICTIONARY_FILE), '﻿' + JSON.stringify({ format: 'sure-mate-masking', version: 1, terms: [{ id: 'a', category: 'client', canonical: '가상자동차', aliases: [] }] }))
  expect((await loadMaskDictionary(dir)).terms).toHaveLength(1)
  await writeFile(join(dir, MASK_DICTIONARY_FILE), '{oops')
  const r = await loadMaskDictionary(dir)
  expect(r.terms).toEqual([])
  expect(r.errors[0]).toContain('읽지 못함')
})
