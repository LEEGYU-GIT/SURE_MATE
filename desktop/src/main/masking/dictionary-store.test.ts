import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ensureMaskDictionaryFile, exportMaskDictionaryText, importMaskDictionary, loadMaskDictionary, MASK_DICTIONARY_FILE, saveMaskDictionary } from './dictionary-store'

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

const term = (id: string, canonical: string, category = 'client', aliases: string[] = []) => ({ id, category, canonical, aliases })

it('저장: 검사를 통과하면 사전 형식으로 쓰고 개수를, 틀린 항목이 있으면 쓰지 않고 까닭을 돌려준다', async () => {
  expect(await saveMaskDictionary(dir, [term('a', '가상자동차', 'client', ['가상차']), term('b', 'XY방산')])).toEqual({ ok: true, count: 2 })
  const saved = JSON.parse(await readFile(join(dir, MASK_DICTIONARY_FILE), 'utf8'))
  expect(saved.format).toBe('sure-mate-masking')
  expect(saved.terms.map((t: { canonical: string }) => t.canonical)).toEqual(['가상자동차', 'XY방산'])
  const bad = await saveMaskDictionary(dir, [term('c', '가상전자', 'money')])
  expect(bad.ok).toBe(false)
  expect((await loadMaskDictionary(dir)).terms).toHaveLength(2)
  expect((await saveMaskDictionary(dir, 'x')).ok).toBe(false)
})

it('지금 파일에 읽지 못한 항목이 있었으면 저장 전에 사본을 남긴다(손으로 고친 항목을 잃지 않게)', async () => {
  await writeFile(join(dir, MASK_DICTIONARY_FILE), '{"format":"sure-mate-masking","terms":[{"id":"x","category":"money","canonical":"?"}]}')
  expect((await saveMaskDictionary(dir, [term('a', '가상자동차')])).ok).toBe(true)
  expect((await readdir(dir)).some((f) => f.startsWith(`${MASK_DICTIONARY_FILE}.broken-`))).toBe(true)
})

it('가져오기: 같은 분류·이름은 건너뛰고 나머지를 더하며, id가 겹치면 새 id를 준다', async () => {
  await saveMaskDictionary(dir, [term('a', '가상자동차')])
  const text = JSON.stringify({ format: 'sure-mate-masking', version: 1, terms: [term('a', '가상전자'), term('z', '가상자동차'), term('y', 'XY방산', 'project')] })
  expect(await importMaskDictionary(dir, text)).toEqual({ ok: true, added: 2, skipped: 1 })
  const ids = (await loadMaskDictionary(dir)).terms.map((t) => t.id)
  expect(new Set(ids).size).toBe(ids.length)
  expect((await loadMaskDictionary(dir)).terms.map((t) => t.canonical)).toEqual(['가상자동차', '가상전자', 'XY방산'])
})

it('가져오기: 다른 형식·깨진 JSON은 사전을 바꾸지 않는다', async () => {
  await saveMaskDictionary(dir, [term('a', '가상자동차')])
  expect((await importMaskDictionary(dir, '{"format":"sure-mate-glossary","entries":[]}')).ok).toBe(false)
  expect((await importMaskDictionary(dir, '{broken')).ok).toBe(false)
  expect((await loadMaskDictionary(dir)).terms).toHaveLength(1)
})

it('내보내기 글은 다시 가져올 수 있는 사전 형식이다', async () => {
  await saveMaskDictionary(dir, [term('a', '가상자동차', 'client', ['가상차'])])
  const text = await exportMaskDictionaryText(dir)
  const other = await mkdtemp(join(tmpdir(), 'sure-mate-mask-'))
  try {
    expect(await importMaskDictionary(other, text)).toEqual({ ok: true, added: 1, skipped: 0 })
  } finally {
    await rm(other, { recursive: true, force: true })
  }
})
