import { rename as realRename } from 'node:fs/promises'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { keepBrokenCopy, RENAME_RETRY_MS, writeFileAtomic, type SaveIo } from './atomic-write'

let dir = ''
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'atomic-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function flaky(failures: number, code: string): { io: SaveIo; sleeps: number[]; calls: () => number } {
  let n = 0
  const sleeps: number[] = []
  return {
    sleeps,
    calls: () => n,
    io: {
      rename: async (from, to) => {
        n++
        if (n <= failures) throw Object.assign(new Error(code), { code })
        await realRename(from, to)
      },
      sleep: async (ms) => void sleeps.push(ms)
    }
  }
}

it('임시 파일에 쓰고 이름을 바꿔 저장하며, 없는 폴더는 만든다(임시 파일은 남지 않음)', async () => {
  const path = join(dir, 'sub', 'a.json')
  await writeFileAtomic(path, '{"a":1}')
  expect(await readFile(path, 'utf8')).toBe('{"a":1}')
  expect(await readdir(join(dir, 'sub'))).toEqual(['a.json'])
})

it('이름 바꾸기가 EPERM이면 50·100ms 기다렸다 다시 해서 저장한다', async () => {
  const f = flaky(2, 'EPERM')
  await writeFileAtomic(join(dir, 'a.json'), 'x', f.io)
  expect(f.sleeps).toEqual(RENAME_RETRY_MS.slice(0, 2))
  expect(await readFile(join(dir, 'a.json'), 'utf8')).toBe('x')
})

it('계속 잠겨 있으면 네 번 다시 한 뒤 던지고 임시 파일을 지운다', async () => {
  const f = flaky(99, 'EBUSY')
  await expect(writeFileAtomic(join(dir, 'a.json'), 'x', f.io)).rejects.toThrow('EBUSY')
  expect(f.calls()).toBe(RENAME_RETRY_MS.length + 1)
  expect(await readdir(dir)).toEqual([])
})

it('다시 해도 안 되는 오류(ENOSPC)는 바로 던진다', async () => {
  const f = flaky(1, 'ENOSPC')
  await expect(writeFileAtomic(join(dir, 'a.json'), 'x', f.io)).rejects.toThrow('ENOSPC')
  expect(f.sleeps).toEqual([])
  expect(await readdir(dir)).toEqual([])
})

it('같은 파일을 동시에 저장해도 임시 파일 이름이 겹치지 않는다', async () => {
  const path = join(dir, 'a.json')
  await Promise.all(['1', '2', '3'].map((t) => writeFileAtomic(path, t)))
  expect(['1', '2', '3']).toContain(await readFile(path, 'utf8'))
  expect(await readdir(dir)).toEqual(['a.json'])
})

it('깨진 파일 사본: <이름>.broken-<시각>으로 복사하고 원본은 그대로, 원본이 없으면 null', async () => {
  const path = join(dir, 'a.json')
  await writeFile(path, '{broken')
  const copy = await keepBrokenCopy(path, new Date('2026-11-10T13:05:06.789Z'))
  expect(copy).toBe(`${path}.broken-2026-11-10T13-05-06-789Z`)
  expect(await readFile(copy!, 'utf8')).toBe('{broken')
  expect(await readFile(path, 'utf8')).toBe('{broken')
  expect(await keepBrokenCopy(join(dir, 'none.json'))).toBeNull()
})
