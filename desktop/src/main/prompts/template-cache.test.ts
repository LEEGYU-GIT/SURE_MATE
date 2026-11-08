import { mkdir, mkdtemp, rm, unlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createTemplateCache } from './template-cache'
import { loadTemplates } from './template-store'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-template-cache-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const pack = (templates: unknown[]): unknown => ({ format: 'sure-mate-templates', version: 1, templates })
const builtin = pack([{ id: 'meeting', name: '회의록 정리', aliases: [], kind: 'prompt', body: '기본 {{selection}}' }])
const mine = (name: string): string => JSON.stringify(pack([{ id: 'meeting', name, aliases: [], kind: 'prompt', body: '{{selection}}' }]))

it('템플릿 파일을 고치면 앱을 다시 켜지 않아도 다음 목록에 반영된다(설계 문서 §7 완료 기준)', async () => {
  let loads = 0
  const cache = createTemplateCache(dir, builtin, () => {}, (d, b) => {
    loads++
    return loadTemplates(d, b)
  })
  expect((await cache.get()).map((t) => t.name)).toEqual(['회의록 정리'])

  await mkdir(join(dir, 'templates'))
  const file = join(dir, 'templates', 'mine.json')
  await writeFile(file, mine('회의록 정리(우리 팀)'))
  await utimes(file, 1000, 1000)
  expect((await cache.get()).map((t) => t.name)).toEqual(['회의록 정리(우리 팀)'])

  // 바뀐 것이 없으면 다시 읽지 않는다
  const before = loads
  await cache.get()
  expect(loads).toBe(before)

  await writeFile(file, mine('회의록 정리(고침)'))
  await utimes(file, 2000, 2000)
  expect((await cache.get()).map((t) => t.name)).toEqual(['회의록 정리(고침)'])

  await unlink(file)
  expect((await cache.get()).map((t) => t.name)).toEqual(['회의록 정리'])
})

it('읽지 못한 템플릿 파일은 바뀔 때마다 한 번 알리고, 같은 상태로 다시 열 때는 또 알리지 않는다', async () => {
  const reported: string[][] = []
  const cache = createTemplateCache(dir, builtin, (errors) => reported.push(errors))
  await mkdir(join(dir, 'templates'))
  const file = join(dir, 'templates', 'broken.json')
  await writeFile(file, '{고장')
  await utimes(file, 1000, 1000)
  expect((await cache.get()).map((t) => t.id)).toEqual(['meeting'])
  await cache.get()
  expect(reported).toHaveLength(1)
  expect(reported[0][0]).toContain('broken.json')
})
