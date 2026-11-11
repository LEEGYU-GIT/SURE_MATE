import { mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SaveIo } from '../files/atomic-write'
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

/** 이름 바꾸기(= 원자적 저장 한 번)를 센다. fail이면 그 저장은 실패한다 */
function countingIo(o: { fail?: boolean } = {}): SaveIo & { writes: () => number } {
  const fn = vi.fn(async (from: string, to: string) => {
    if (o.fail) throw Object.assign(new Error('disk'), { code: 'EIO' })
    await rename(from, to)
  })
  return { rename: fn, sleep: async () => {}, writes: () => fn.mock.calls.length }
}

describe('설정 창에서 보기·지우기(설계 §13 8단계 학습 내용)', () => {
  it('entries는 문장 키·항목 id·기억한 시각을 파일 순서대로 준다', async () => {
    const s = open()
    await s.learn('출근세팅해줘', 'workspace:ws-qa')
    await s.learn('주간보고띄워줘', 'prompt:weekly-report')
    const list = await open().entries()
    expect(list.map((e) => [e.key, e.id])).toEqual([
      ['출근세팅해줘', 'workspace:ws-qa'],
      ['주간보고띄워줘', 'prompt:weekly-report']
    ])
    expect(list.every((e) => Number.isFinite(Date.parse(e.at)))).toBe(true)
  })

  it('remove는 그 문장만 지우고 true, 새로 열어도 없다', async () => {
    const s = open()
    await s.learn('출근세팅해줘', 'workspace:ws-qa')
    await s.learn('주간보고띄워줘', 'prompt:weekly-report')
    expect(await s.remove('출근세팅해줘')).toBe(true)
    expect([...(await s.all())]).toEqual([['주간보고띄워줘', 'prompt:weekly-report']])
    expect([...(await open().all())]).toEqual([['주간보고띄워줘', 'prompt:weekly-report']])
  })

  it('없는 문장을 지우면 false이고 파일을 다시 쓰지 않는다', async () => {
    const io = countingIo()
    const s = createPhraseStore(dir, { now, io })
    await s.learn('출근세팅해줘', 'workspace:ws-qa')
    expect(io.writes()).toBe(1)
    expect(await s.remove('없는문장')).toBe(false)
    expect(io.writes()).toBe(1)
  })

  it('clear는 모두 지우고 지운 수를 준다. 이미 비었으면 0이고 파일을 만들지 않는다', async () => {
    const io = countingIo()
    const s = createPhraseStore(dir, { now, io })
    expect(await s.clear()).toBe(0)
    expect(io.writes()).toBe(0)
    expect(await readdir(dir)).toEqual([])
    await s.learn('출근세팅해줘', 'workspace:ws-qa')
    await s.learn('주간보고띄워줘', 'prompt:weekly-report')
    expect(await s.clear()).toBe(2)
    expect((await open().all()).size).toBe(0)
    const file = JSON.parse(await readFile(join(dir, PHRASES_FILE), 'utf8'))
    expect(file).toEqual({ format: 'sure-mate-phrases', version: 1, entries: [] })
  })

  it('저장에 실패하면 지우지 않은 것으로 남는다(메모리·파일 모두)', async () => {
    await open().learn('출근세팅해줘', 'workspace:ws-qa')
    const s = createPhraseStore(dir, { now, io: countingIo({ fail: true }) })
    await expect(s.remove('출근세팅해줘')).rejects.toThrow()
    await expect(s.clear()).rejects.toThrow()
    expect([...(await s.all())]).toEqual([['출근세팅해줘', 'workspace:ws-qa']])
    expect([...(await open().all())]).toEqual([['출근세팅해줘', 'workspace:ws-qa']])
  })

  it('learn과 겹쳐 불러도 부른 순서대로 처리한다(같은 줄·같은 원자적 저장)', async () => {
    const s = open()
    await s.learn('a', '1')
    const [, removed, , cleared] = await Promise.all([s.learn('b', '2'), s.remove('a'), s.learn('c', '3'), s.clear(), s.learn('d', '4')])
    expect(removed).toBe(true)
    // clear는 그 앞에 부른 learn(b·c)까지 지우고, 뒤에 부른 learn(d)은 남는다
    expect(cleared).toBe(2)
    expect([...(await s.all())]).toEqual([['d', '4']])
    expect([...(await open().all())]).toEqual([['d', '4']])
  })

  it('같은 문장을 지우고 바로 다시 기억하면 남고, 기억하고 바로 지우면 없다', async () => {
    const s = open()
    await s.learn('출근세팅해줘', 'workspace:ws-qa')
    await Promise.all([s.remove('출근세팅해줘'), s.learn('출근세팅해줘', 'prompt:weekly-report')])
    expect([...(await s.all())]).toEqual([['출근세팅해줘', 'prompt:weekly-report']])
    await Promise.all([s.learn('출근세팅해줘', 'workspace:ws-qa'), s.remove('출근세팅해줘')])
    expect((await open().all()).size).toBe(0)
  })
})
