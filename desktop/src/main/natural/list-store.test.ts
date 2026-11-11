import * as fsp from 'node:fs/promises'
import { mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SaveIo } from '../files/atomic-write'
import { createListStore } from './list-store'

// 읽기·사본 만들기 실패(백신·DLP 프로그램의 잠금 EBUSY 등)를 흉내 내려고 감싼다(기본은 실제 동작 그대로)
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readFile: vi.fn(actual.readFile), copyFile: vi.fn(actual.copyFile) }
})

interface Row {
  id: string
  n: number
}

function parse(raw: unknown): Row | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  return typeof r.id === 'string' && typeof r.n === 'number' ? { id: r.id, n: r.n } : null
}

const FORMAT = 'sure-mate-test-list'
const NOW = new Date(Date.UTC(2026, 10, 11, 9, 0, 0))
const ebusy = (): Error => Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
const rows = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: `id${i}`, n: i }))
const add = (row: Row) => (list: Row[]): Row[] => [...list, row]

let dir: string
const file = (): string => join(dir, 'list.json')
const open = (io?: SaveIo) => createListStore<Row>({ path: file(), format: FORMAT, field: 'items', parse, io, now: () => NOW })
const writeList = (items: unknown[], o: { format?: string; version?: number } = {}): Promise<void> =>
  writeFile(file(), JSON.stringify({ format: o.format ?? FORMAT, version: o.version ?? 1, items }))
const savedText = (): Promise<string> => readFile(file(), 'utf8')
const savedIds = async (): Promise<string[]> => (JSON.parse(await savedText()) as { items: Row[] }).items.map((r) => r.id)
const brokenCopies = async (): Promise<string[]> => (await readdir(dir)).filter((f) => f.startsWith('list.json.broken-'))
/** 이름 바꾸기(= 원자적 저장 한 번)를 실패시킨다 */
const failingIo = (): SaveIo => ({
  rename: async () => {
    throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' })
  },
  sleep: async () => {}
})

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-list-'))
  vi.mocked(fsp.readFile).mockClear()
  vi.mocked(fsp.copyFile).mockClear()
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('읽기 실패(깨진 파일이 아님): 기억하지 않고 다음 부름에서 다시 읽는다', () => {
  it('처음 읽기가 EBUSY면 그 부름은 코드만 담아 던지고, 사본을 만들지 않으며, 다음 read는 파일을 다시 읽는다', async () => {
    await writeList(rows(50))
    const s = open()
    vi.mocked(fsp.readFile).mockRejectedValueOnce(ebusy())
    const failed = await s.read().then(
      () => null,
      (e: unknown) => e
    )
    expect(failed).toMatchObject({ code: 'EBUSY' })
    expect(String((failed as Error).message)).not.toContain(dir)
    expect(fsp.copyFile).not.toHaveBeenCalled()
    expect(await brokenCopies()).toEqual([])
    expect(await s.read()).toHaveLength(50)
  })

  it('읽기 실패 뒤 잠금이 풀리고 기억하면 파일의 50개에 1개를 더한다(빈 목록으로 덮어 1개로 줄지 않는다)', async () => {
    await writeList(rows(50))
    const s = open()
    vi.mocked(fsp.readFile).mockRejectedValueOnce(ebusy())
    await expect(s.read()).rejects.toMatchObject({ code: 'EBUSY' })
    await s.update(add({ id: 'new', n: 99 }))
    expect(await savedIds()).toEqual([...rows(50).map((r) => r.id), 'new'])
  })

  it('첫 부름이 update이고 읽기가 실패하면 그 update는 던지고 파일은 그대로다', async () => {
    await writeList(rows(50))
    const before = await savedText()
    const s = open()
    vi.mocked(fsp.readFile).mockRejectedValueOnce(ebusy())
    await expect(s.update(add({ id: 'new', n: 99 }))).rejects.toMatchObject({ code: 'EBUSY' })
    expect(await savedText()).toBe(before)
    // 줄은 이어진다: 다음 update는 다시 읽고 저장한다
    await s.update(add({ id: 'new', n: 99 }))
    expect(await savedIds()).toHaveLength(51)
  })
})

describe('깨진 파일(PARSE·형식이나 판이 다름·일부 항목만 읽힘)', () => {
  it('PARSE: 빈 목록으로 시작하고 .broken 사본의 내용은 원본과 같으며, 다음 update는 정상 파일로 저장한다', async () => {
    const original = '{"format":"sure-mate-test-list","version":1,"items":[{"id":"가상자동차","n":1}'
    await writeFile(file(), original)
    const s = open()
    expect(await s.read()).toEqual([])
    const copies = await brokenCopies()
    expect(copies).toHaveLength(1)
    expect(await readFile(join(dir, copies[0]), 'utf8')).toBe(original)
    await s.update(add({ id: 'a', n: 1 }))
    expect(JSON.parse(await savedText())).toEqual({ format: FORMAT, version: 1, items: [{ id: 'a', n: 1 }] })
  })

  it('일부 항목만 읽히면 읽힌 것으로 시작하고 원본과 같은 사본을 남긴다', async () => {
    await writeList([{ id: 'a', n: 1 }, 5, { id: 'b' }])
    const original = await savedText()
    const s = open()
    expect(await s.read()).toEqual([{ id: 'a', n: 1 }])
    const copies = await brokenCopies()
    expect(copies).toHaveLength(1)
    expect(await readFile(join(dir, copies[0]), 'utf8')).toBe(original)
  })

  it.each([
    ['형식이 다름', { format: 'other-format' }],
    ['판이 다름', { version: 2 }]
  ])('%s: 빈 목록과 원본과 같은 사본, 다음 update는 이 형식·판 1로 저장한다', async (_, o) => {
    await writeList(rows(3), o)
    const original = await savedText()
    const s = open()
    expect(await s.read()).toEqual([])
    const copies = await brokenCopies()
    expect(copies).toHaveLength(1)
    expect(await readFile(join(dir, copies[0]), 'utf8')).toBe(original)
    await s.update(add({ id: 'a', n: 1 }))
    expect(JSON.parse(await savedText())).toEqual({ format: FORMAT, version: 1, items: [{ id: 'a', n: 1 }] })
  })

  it.each([
    ['PARSE', async (): Promise<void> => writeFile(file(), '{broken')],
    ['일부 항목만 읽힘', async (): Promise<void> => writeList([{ id: 'a', n: 1 }, 5])],
    ['형식이 다름', async (): Promise<void> => writeList(rows(3), { format: 'other-format' })]
  ])('%s인데 사본을 못 만들면(EBUSY) 읽기는 이어 가지만 이번 실행 동안 파일을 덮어쓰지 않는다', async (_, setup) => {
    await setup()
    const original = await savedText()
    const s = open()
    vi.mocked(fsp.copyFile).mockRejectedValueOnce(ebusy())
    const list = await s.read()
    expect(await brokenCopies()).toEqual([])
    await expect(s.update(add({ id: 'new', n: 9 }))).rejects.toThrow()
    // 사본 만들기는 다시 하지 않고(이번 실행 동안) 두 번째 변경도 저장하지 않는다
    await expect(s.update(add({ id: 'new2', n: 10 }))).rejects.toThrow()
    expect(fsp.copyFile).toHaveBeenCalledTimes(1)
    expect(await savedText()).toBe(original)
    expect(await readdir(dir)).toEqual(['list.json'])
    // 메모리도 그대로(읽은 항목만)이고, 바꾸지 않는 update(같은 목록)는 던지지 않는다
    expect(await s.read()).toEqual(list)
    await expect(s.update((l) => l)).resolves.toBeUndefined()
    // 다음 실행(새 저장소)은 사본을 다시 만들고 저장한다
    const next = open()
    await next.update(add({ id: 'new', n: 9 }))
    expect(await brokenCopies()).toHaveLength(1)
    expect(await savedIds()).toContain('new')
  })
})

describe('저장 실패와 줄', () => {
  it('저장(이름 바꾸기)이 실패하면 메모리와 파일 모두 그대로다', async () => {
    await writeList(rows(2))
    const before = await savedText()
    const s = open(failingIo())
    await expect(s.update(add({ id: 'new', n: 9 }))).rejects.toMatchObject({ code: 'EIO' })
    expect(await s.read()).toEqual(rows(2))
    expect(await savedText()).toBe(before)
    expect(await readdir(dir)).toEqual(['list.json'])
  })

  it('실패한 부름 뒤에도 줄은 이어진다(겹쳐 부른 다음 update는 부른 순서대로 저장된다)', async () => {
    await writeList(rows(1))
    let fail = true
    const io: SaveIo = {
      rename: async (from, to) => {
        if (fail) {
          fail = false
          throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' })
        }
        await rename(from, to)
      },
      sleep: async () => {}
    }
    const s = open(io)
    const results = await Promise.allSettled([s.update(add({ id: 'x', n: 1 })), s.update(add({ id: 'y', n: 2 })), s.read()])
    expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled', 'fulfilled'])
    expect(await savedIds()).toEqual(['id0', 'y'])
    expect((results[2] as PromiseFulfilledResult<Row[]>).value.map((r) => r.id)).toEqual(['id0', 'y'])
  })

  it('파일이 없으면 빈 목록이고 사본을 만들지 않으며, update는 새 파일을 만든다', async () => {
    const s = open()
    expect(await s.read()).toEqual([])
    expect(fsp.copyFile).not.toHaveBeenCalled()
    await s.update(add({ id: 'a', n: 1 }))
    expect(await savedIds()).toEqual(['a'])
  })
})
