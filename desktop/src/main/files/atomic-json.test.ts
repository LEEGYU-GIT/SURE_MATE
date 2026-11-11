import { mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { keepBrokenCopy, readJsonFile, RENAME_RETRY_MS, writeJsonAtomic, type SaveIo } from './atomic-write'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-atomic-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const failing = (code: string, times: number): { io: SaveIo; slept: number[] } => {
  const slept: number[] = []
  let n = 0
  return {
    slept,
    io: {
      rename: async (from, to) => {
        if (n++ < times) throw Object.assign(new Error('x'), { code })
        await rename(from, to)
      },
      sleep: async (ms) => {
        slept.push(ms)
      }
    }
  }
}

it('2칸 들여쓰기 JSON을 쓰고 .tmp를 남기지 않는다', async () => {
  const p = join(dir, 'sub', 'a.json')
  const v = { a: 1, b: ['가상자동차'] }
  await writeJsonAtomic(p, v)
  expect(await readFile(p, 'utf8')).toBe(JSON.stringify(v, null, 2))
  expect((await readdir(join(dir, 'sub'))).filter((f) => f.endsWith('.tmp'))).toEqual([])
})

it('backup: true면 이전 내용이 .bak에 남는다', async () => {
  const p = join(dir, 'a.json')
  await writeJsonAtomic(p, { v: 1 }, { backup: true })
  await writeJsonAtomic(p, { v: 2 }, { backup: true })
  expect(JSON.parse(await readFile(`${p}.bak`, 'utf8'))).toEqual({ v: 1 })
  expect(JSON.parse(await readFile(p, 'utf8'))).toEqual({ v: 2 })
})

it('EPERM 두 번 뒤 성공하면 50·100ms를 기다린다', async () => {
  const { io, slept } = failing('EPERM', 2)
  await writeJsonAtomic(join(dir, 'a.json'), { v: 1 }, { io })
  expect(slept).toEqual([50, 100])
  expect(RENAME_RETRY_MS).toEqual([50, 100, 200, 400])
})

it('EACCES가 계속되면 오류를 던지고 .tmp를 지운다', async () => {
  const { io } = failing('EACCES', 5)
  await expect(writeJsonAtomic(join(dir, 'a.json'), { v: 1 }, { io })).rejects.toMatchObject({ code: 'EACCES' })
  expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([])
})

it('readJsonFile: 없음·BOM·깨짐', async () => {
  expect(await readJsonFile(join(dir, 'none.json'))).toEqual({ kind: 'missing' })
  await writeFile(join(dir, 'bom.json'), '﻿{"a":1}')
  expect(await readJsonFile(join(dir, 'bom.json'))).toEqual({ kind: 'ok', value: { a: 1 } })
  await writeFile(join(dir, 'bad.json'), '{')
  const r = await readJsonFile(join(dir, 'bad.json'))
  expect(r.kind).toBe('broken')
})

it('keepBrokenCopy: 사본 경로를 돌려주고 없으면 null', async () => {
  const p = join(dir, 'a.json')
  expect(await keepBrokenCopy(p)).toBeNull()
  await writeFile(p, '{')
  const c = await keepBrokenCopy(p, new Date('2026-11-10T01:02:03.456Z'))
  expect(c).toBe(`${p}.broken-2026-11-10T01-02-03-456Z`)
  expect(await readFile(c as string, 'utf8')).toBe('{')
})
