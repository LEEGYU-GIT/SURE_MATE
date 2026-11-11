import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { Workspace } from '../../shared/workspace/types'
import { createWorkspaceCache, loadWorkspaces, saveWorkspaces, WORKSPACES_FILE } from './workspace-store'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-ws-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const rect = { x: 0, y: 0, width: 1920, height: 1080 }
const mk = (id: string, name: string): Workspace => ({
  id,
  name,
  aliases: ['qa'],
  hotkey: null,
  layouts: {
    fp: {
      monitors: [{ key: 'm1', role: 'primary', bounds: rect, workArea: rect, scaleFactor: 1 }],
      windows: [
        {
          id: 'r1',
          enabled: true,
          match: { exe: 'EXCEL.EXE' },
          savedTitle: 'SureMate-WS-A',
          target: { monitor: 'm1', rect: { x: 0, y: 0, w: 0.5, h: 1 }, state: 'normal' },
          order: 0
        }
      ]
    }
  },
  updatedAt: '2026-11-09T00:00:00.000Z'
})
const path = (): string => join(dir, WORKSPACES_FILE)
const files = async (pre: string): Promise<string[]> => (await readdir(dir)).filter((f) => f.startsWith(pre))

it('저장하고 읽으면 같은 값', async () => {
  const list = [mk('a', 'QA 모드'), mk('b', 'XY방산')]
  await saveWorkspaces(dir, list)
  const r = await loadWorkspaces(dir)
  expect(r).toEqual({ workspaces: list, errors: [], recovered: false })
})

it('파일이 없으면 빈 목록', async () => {
  expect(await loadWorkspaces(dir)).toEqual({ workspaces: [], errors: [], recovered: false })
})

it('본 파일이 깨지고 .bak이 정상이면 복구하고 사본을 남긴다', async () => {
  await saveWorkspaces(dir, [mk('a', 'one')])
  await saveWorkspaces(dir, [mk('a', 'two')]) // .bak = one
  await writeFile(path(), '{')
  const r = await loadWorkspaces(dir)
  expect(r.recovered).toBe(true)
  expect(r.workspaces.map((w) => w.name)).toEqual(['one'])
  expect(r.errors).toContain('workspaces.json을 읽지 못해 백업에서 복구했어요')
  const copies = await files(`${WORKSPACES_FILE}.broken-`)
  expect(copies).toHaveLength(1)
  expect(await readFile(join(dir, copies[0]), 'utf8')).toBe('{')
})

it('둘 다 깨지면 빈 목록·오류, 원본은 그대로', async () => {
  await writeFile(path(), '{')
  await writeFile(`${path()}.bak`, '[')
  const r = await loadWorkspaces(dir)
  expect(r.workspaces).toEqual([])
  expect(r.errors.length).toBeGreaterThan(0)
  expect(r.recovered).toBe(false)
  expect(await readFile(path(), 'utf8')).toBe('{')
})

it('규칙 하나가 잘못된 파일은 오류를 돌려주고 다음 저장 전에 사본을 남긴다', async () => {
  const w = mk('a', 'QA 모드')
  w.layouts.fp.windows.push({ ...w.layouts.fp.windows[0], id: 'r2', target: { monitor: 'nope', rect: { x: 0, y: 0, w: 1, h: 1 }, state: 'normal' } })
  await writeFile(path(), JSON.stringify({ format: 'sure-mate-workspaces', version: 1, savedAt: 'x', workspaces: [w] }))
  const r = await loadWorkspaces(dir)
  expect(r.errors.length).toBe(1)
  expect(r.workspaces[0].layouts.fp.windows).toHaveLength(1)
  expect(await files(`${WORKSPACES_FILE}.broken-`)).toHaveLength(0)
  await saveWorkspaces(dir, r.workspaces)
  expect(await files(`${WORKSPACES_FILE}.broken-`)).toHaveLength(1)
})

it('캐시는 수정 시각·크기가 같으면 다시 읽지 않는다', async () => {
  const seen: string[][] = []
  const cache = createWorkspaceCache(dir, (e) => seen.push(e))
  await saveWorkspaces(dir, [mk('a', 'one')])
  const t = new Date('2026-11-09T00:00:00Z')
  await utimes(path(), t, t)
  expect((await cache.get())[0].name).toBe('one')
  // 같은 크기의 내용으로 바꾸고 수정 시각을 되돌리면 캐시 값이 유지된다
  const text = (await readFile(path(), 'utf8')).replace('"one"', '"two"')
  await writeFile(path(), text)
  await utimes(path(), t, t)
  expect((await cache.get())[0].name).toBe('one')
  cache.invalidate()
  expect((await cache.get())[0].name).toBe('two')
})

it('캐시 save 뒤에는 저장한 목록을 돌려준다', async () => {
  const cache = createWorkspaceCache(dir, () => undefined)
  const list = [mk('a', 'x')]
  await cache.save(list)
  expect(await cache.get()).toEqual(list)
})

it('캐시 목록은 함께 쓰므로 얼려 두고, save는 넘긴 목록의 사본을 둔다(고쳐도 캐시가 바뀌지 않는다)', async () => {
  const cache = createWorkspaceCache(dir, () => undefined)
  await saveWorkspaces(dir, [mk('a', 'one')])
  const read = await cache.get()
  expect(Object.isFrozen(read)).toBe(true)
  expect(Object.isFrozen(read[0].layouts.fp.windows[0].target.rect)).toBe(true)
  expect(() => (read as Workspace[]).push(mk('b', 'two'))).toThrow(TypeError)
  expect(() => {
    read[0].name = 'two'
  }).toThrow(TypeError)

  const mine = [mk('c', 'three')]
  await cache.save(mine)
  mine[0].name = 'changed'
  mine.push(mk('d', 'four'))
  const after = await cache.get()
  expect(after.map((w) => [w.id, w.name])).toEqual([['c', 'three']])
  expect(Object.isFrozen(after[0].aliases)).toBe(true)
  expect(Object.isFrozen(mine[0])).toBe(false)
})
