import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createUsageStore, USAGE_FILE, USAGE_MAX } from './usage-store'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-usage-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

let tick = 0
const now = (): Date => new Date(Date.UTC(2026, 10, 11) + tick++ * 1000)

it('record 두 번이면 count 2, lastAt은 마지막 시각', async () => {
  const s = createUsageStore(dir, { now })
  await s.record('cmd.unmask')
  await s.record('cmd.unmask')
  const u = (await createUsageStore(dir, { now }).all()).get('cmd.unmask')!
  expect(u.count).toBe(2)
  expect(u.lastAt).toBe(new Date(Date.UTC(2026, 10, 11) + (tick - 1) * 1000).toISOString())
})

it('201개째에서 가장 오래된 것을 뺀다', async () => {
  const s = createUsageStore(dir, { now })
  for (let i = 0; i <= USAGE_MAX; i++) await s.record(`id${i}`)
  const all = await s.all()
  expect(all.size).toBe(USAGE_MAX)
  expect(all.has('id0')).toBe(false)
  expect(all.has(`id${USAGE_MAX}`)).toBe(true)
})

it('깨진 파일은 빈 목록과 .broken 사본, 다음 record는 정상 저장', async () => {
  await writeFile(join(dir, USAGE_FILE), '[')
  const s = createUsageStore(dir, { now })
  expect((await s.all()).size).toBe(0)
  expect((await readdir(dir)).some((f) => f.startsWith(`${USAGE_FILE}.broken-`))).toBe(true)
  await s.record('a')
  expect((await createUsageStore(dir, { now }).all()).get('a')?.count).toBe(1)
})

it('clear는 모두 지우고 지운 수를 준다. 이미 비었으면 0이고 파일을 만들지 않는다', async () => {
  const s = createUsageStore(dir, { now })
  expect(await s.clear()).toBe(0)
  expect(await readdir(dir)).toEqual([])
  await s.record('cmd.unmask')
  await s.record('prompt:weekly-report')
  await s.record('cmd.unmask')
  expect(await s.clear()).toBe(2)
  expect((await createUsageStore(dir, { now }).all()).size).toBe(0)
  expect(JSON.parse(await readFile(join(dir, USAGE_FILE), 'utf8'))).toEqual({ format: 'sure-mate-usage', version: 1, items: [] })
})

it('clear는 record와 겹쳐 불러도 부른 순서대로 처리한다', async () => {
  const s = createUsageStore(dir, { now })
  await s.record('a')
  const [, cleared] = await Promise.all([s.record('b'), s.clear(), s.record('c')])
  expect(cleared).toBe(2)
  expect([...(await s.all()).keys()]).toEqual(['c'])
  expect([...(await createUsageStore(dir, { now }).all()).keys()]).toEqual(['c'])
})

it('파일에는 id·횟수·시각만 있다(입력 문장 없음)', async () => {
  await createUsageStore(dir, { now }).record('prompt:report')
  const file = JSON.parse(await readFile(join(dir, USAGE_FILE), 'utf8'))
  expect(file.items).toHaveLength(1)
  expect(Object.keys(file.items[0]).sort()).toEqual(['count', 'id', 'lastAt'])
  expect(Object.keys(file).sort()).toEqual(['format', 'items', 'version'])
})
