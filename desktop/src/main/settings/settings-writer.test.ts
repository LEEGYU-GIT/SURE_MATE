import * as fsp from 'node:fs/promises'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withPosition } from '../../shared/bar/bar-settings'
import { DEFAULT_SETTINGS, type Settings } from './settings-store'
import { createSettingsWriter, SETTINGS_UNREADABLE_NOTICE } from './settings-writer'

// 백신·EDR이 파일을 잡고 있어 읽기·확인이 실패하는 경우를 흉내 내려고 감싼다(평소에는 그대로 통과)
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readFile: vi.fn(actual.readFile), access: vi.fn(actual.access), writeFile: vi.fn(actual.writeFile) }
})

let dir: string
let path: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-writer-'))
  path = join(dir, 'settings.json')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** 실행 중인 설정: 기본값과 다른 가명 처리 설정(사내 도메인)이 메모리에 있다 */
const running = (): Settings => {
  const s = structuredClone(DEFAULT_SETTINGS)
  return { ...s, masking: { ...s.masking, mode: 'remove', internalDomains: ['intra.example'] } }
}

function make(initial: Settings) {
  let state = initial
  const applied: Settings[] = []
  const notify = vi.fn()
  const log = vi.fn()
  const w = createSettingsWriter({
    dir: () => dir,
    current: () => state,
    apply: (next) => {
      state = next
      applied.push(next)
    },
    notify,
    log
  })
  return { w, applied, notify, log, state: () => state }
}

const events = (log: ReturnType<typeof vi.fn>, event: string): unknown[] => log.mock.calls.filter(([e]) => e === event).map(([, data]) => data)

describe('설정 파일을 읽지 못하면 기본값으로 덮지 않는다', () => {
  it('JSON이 깨졌으면 저장하지 않고(파일은 그대로, 옆으로 옮기지 않음) 메모리 설정에 바꾼 값만 적용하며 한 번만 알린다', async () => {
    const broken = '{"masking": {"internalDomains": ["intra.example"]  // 고치던 중'
    await writeFile(path, broken)
    const t = make(running())
    vi.mocked(fsp.writeFile).mockClear()

    await t.w.change((cur) => ({ ...cur, bar: withPosition(cur.bar, '1', 0.3) }))
    await t.w.change((cur) => ({ ...cur, bar: { ...cur.bar, shape: 'capsule' } }))

    expect(await readFile(path, 'utf8')).toBe(broken)
    expect(await readdir(dir)).toEqual(['settings.json'])
    expect(fsp.writeFile).not.toHaveBeenCalled()
    // 사내 도메인 등 메모리의 가명 처리 설정은 그대로이고, 바꾼 값만 들어간다
    expect(t.state().masking).toEqual(running().masking)
    expect(t.state().bar.positions).toEqual([{ display: '1', ratio: 0.3 }])
    expect(t.state().bar.shape).toBe('capsule')
    expect(t.notify).toHaveBeenCalledTimes(1)
    expect(t.notify).toHaveBeenCalledWith(SETTINGS_UNREADABLE_NOTICE)
    // 기록은 까닭 코드만(파일 내용·경로 없음)
    expect(events(t.log, 'settings.unreadable')).toEqual([
      { what: 'parse', error: 'SyntaxError' },
      { what: 'parse', error: 'SyntaxError' }
    ])
    expect(JSON.stringify(t.log.mock.calls)).not.toContain('intra.example')
    expect(JSON.stringify(t.log.mock.calls)).not.toContain(dir)
  })

  it('읽지 못하면(보안 프로그램이 잡고 있음) 저장하지 않고 메모리 설정에 바꾼 값만 적용하며 알린다', async () => {
    const onDisk = JSON.stringify({ masking: { mode: 'remove', internalDomains: ['intra.example'] }, onboardingDone: true })
    await writeFile(path, onDisk)
    const t = make(running())
    vi.mocked(fsp.writeFile).mockClear()
    vi.mocked(fsp.readFile).mockRejectedValueOnce(Object.assign(new Error(`EBUSY: resource busy or locked, open '${path}'`), { code: 'EBUSY' }))

    await t.w.change((cur) => ({ ...cur, pet: { ...cur.pet, visible: false } }))

    expect(await readFile(path, 'utf8')).toBe(onDisk)
    expect(fsp.writeFile).not.toHaveBeenCalled()
    expect(t.state().masking).toEqual(running().masking)
    expect(t.state().pet.visible).toBe(false)
    expect(t.notify).toHaveBeenCalledTimes(1)
    expect(t.notify).toHaveBeenCalledWith(SETTINGS_UNREADABLE_NOTICE)
    expect(events(t.log, 'settings.unreadable')).toEqual([{ what: 'read', error: 'EBUSY' }])
    expect(JSON.stringify(t.log.mock.calls)).not.toContain(dir)
  })

  it('실행 중에 설정 파일이 지워져도(없음) 기본값이 아니라 메모리의 지금 설정을 기준으로 파일을 다시 만든다', async () => {
    await writeFile(path, JSON.stringify({ masking: { mode: 'remove', internalDomains: ['intra.example'] } }))
    const t = make(running())
    await rm(path)

    await t.w.change((cur) => ({ ...cur, bar: withPosition(cur.bar, '1', 0.3) }))

    const saved = JSON.parse(await readFile(path, 'utf8'))
    expect(saved.masking).toMatchObject({ mode: 'remove', internalDomains: ['intra.example'] })
    expect(saved.bar.positions).toEqual([{ display: '1', ratio: 0.3 }])
    expect(t.state().masking).toEqual(running().masking)
    expect(t.state().bar.positions).toEqual([{ display: '1', ratio: 0.3 }])
    expect(t.notify).not.toHaveBeenCalled()
  })

  it('다시 읽을 수 있게 되면 그 파일에 저장하고, 그 뒤 다시 읽지 못하면 다시 알린다', async () => {
    await writeFile(path, '{oops')
    const t = make(running())
    await t.w.change((cur) => ({ ...cur, onboardingDone: true }))
    await writeFile(path, JSON.stringify({ masking: { internalDomains: ['intra.example'] } }))
    await t.w.change((cur) => ({ ...cur, bar: { ...cur.bar, shape: 'capsule' } }))
    const saved = JSON.parse(await readFile(path, 'utf8'))
    expect(saved.bar.shape).toBe('capsule')
    expect(saved.masking.internalDomains).toEqual(['intra.example'])
    await writeFile(path, '{oops')
    await t.w.change((cur) => ({ ...cur, bar: { ...cur.bar, shape: 'edge' } }))
    expect(t.notify).toHaveBeenCalledTimes(2)
  })
})

it('펫 단추를 앞 저장이 끝나기 전에 두 번 누르면 두 번 바뀐다(차례가 왔을 때의 상태를 뒤집고, 적용한 값을 기록)', async () => {
  const t = make(structuredClone(DEFAULT_SETTINGS))
  const first = t.w.togglePet()
  const second = t.w.togglePet()
  expect(await first).toBe(false)
  expect(await second).toBe(true)
  expect(t.applied.map((s) => s.pet.visible)).toEqual([false, true])
  expect(t.state().pet.visible).toBe(true)
  expect(JSON.parse(await readFile(path, 'utf8')).pet.visible).toBe(true)
  expect(events(t.log, 'pet.visible')).toEqual([{ visible: false }, { visible: true }])
})

describe('ensureFile: 설정 파일이 없을 때(ENOENT)만 지금 설정으로 만든다', () => {
  it('없으면 지금 설정으로 만든다', async () => {
    const t = make(running())
    expect(await t.w.ensureFile()).toBe(true)
    expect(JSON.parse(await readFile(path, 'utf8')).masking.internalDomains).toEqual(['intra.example'])
  })

  it('있으면 그대로 둔다', async () => {
    await writeFile(path, '{"onboardingDone":true}')
    const t = make(running())
    expect(await t.w.ensureFile()).toBe(false)
    expect(await readFile(path, 'utf8')).toBe('{"onboardingDone":true}')
  })

  it('있는지 확인하지 못하면(권한·잠김) 없는 것으로 보지 않고 덮어쓰지 않는다', async () => {
    const onDisk = JSON.stringify({ masking: { internalDomains: ['intra.example'] } })
    await writeFile(path, onDisk)
    const t = make(structuredClone(DEFAULT_SETTINGS))
    vi.mocked(fsp.writeFile).mockClear()
    vi.mocked(fsp.access).mockRejectedValueOnce(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }))
    expect(await t.w.ensureFile()).toBe(false)
    expect(fsp.writeFile).not.toHaveBeenCalled()
    expect(await readFile(path, 'utf8')).toBe(onDisk)
  })
})
