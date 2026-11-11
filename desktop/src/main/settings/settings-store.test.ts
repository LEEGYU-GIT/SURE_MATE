import * as fsp from 'node:fs/promises'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PET_SETTINGS } from '../../shared/pet/pet-settings'
import { DEFAULT_SETTINGS, loadSettings, mergeSettings, saveSettings, settingsLoadNotice, SettingsUnreadableError, updateSettings } from './settings-store'

// 백신·EDR이 파일을 잡고 있어 이름 바꾸기·복사가 실패하는 경우를 흉내 내려고 rename·copyFile만 감싼다(평소에는 그대로 통과)
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rename: vi.fn(actual.rename), copyFile: vi.fn(actual.copyFile) }
})

const ebusy = (): Error => Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
const CORRUPT_NAME = /^settings\.corrupt-\d+\.json$/

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-settings-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

it('빼기 모드 표기는 올바른 것만 남긴다(알려진 분류, 1~20자, 줄바꿈·중괄호 없음)', () => {
  const s = mergeSettings({ masking: { removeLabels: { client: ' 협력사 ', ip: '', email: 'x'.repeat(21), phone: '줄\n바꿈', url: '{{u}}', money: '돈' } } })
  expect(s.masking.removeLabels).toEqual({ client: '협력사' })
  expect(mergeSettings({}).masking.removeLabels).toEqual({})
})

it('파일이 없으면 기본값', async () => {
  expect(await loadSettings(dir)).toEqual(DEFAULT_SETTINGS)
})

it('일부만 있으면 기본값과 합친다', async () => {
  await writeFile(join(dir, 'settings.json'), JSON.stringify({ hotkeys: { palette: 'Alt+`' } }))
  const s = await loadSettings(dir)
  expect(s.hotkeys.palette).toBe('Alt+`')
  expect(s.hotkeys.lookup).toBe('Ctrl+Alt+W')
})

it('타입이 틀린 값은 기본값', async () => {
  await writeFile(join(dir, 'settings.json'), JSON.stringify({ launchAtLogin: 'yes', masking: { mode: 'weird' } }))
  const s = await loadSettings(dir)
  expect(s.launchAtLogin).toBe(true)
  expect(s.masking.mode).toBe('restore')
})

it('깨진 JSON은 옆으로 옮기고 기본값', async () => {
  await writeFile(join(dir, 'settings.json'), '{oops')
  expect(await loadSettings(dir)).toEqual(DEFAULT_SETTINGS)
  expect((await readdir(dir)).some((f) => /^settings\.corrupt-\d+\.json$/.test(f))).toBe(true)
})

describe('시작할 때 깨진 JSON은 onError(parse)로 알린다(옮긴 파일 이름 포함)', () => {
  it('옮겼으면 그 파일 이름(폴더 없음)과 moved true', async () => {
    await writeFile(join(dir, 'settings.json'), '{"masking": {"internalDomains": ["intra.example",]}}')
    const onError = vi.fn()
    expect(await loadSettings(dir, onError)).toEqual(DEFAULT_SETTINGS)
    expect(onError).toHaveBeenCalledTimes(1)
    const [what, e, kept] = onError.mock.calls[0]
    expect(what).toBe('parse')
    expect(e).toBeInstanceOf(SyntaxError)
    expect(kept).toEqual({ name: expect.stringMatching(CORRUPT_NAME), moved: true })
    expect(await readdir(dir)).toEqual([kept.name])
  })

  it('옮기지 못하고 사본을 남겼으면 moved false(원래 파일은 그대로)', async () => {
    await writeFile(join(dir, 'settings.json'), '{oops')
    vi.mocked(fsp.rename).mockRejectedValueOnce(ebusy())
    const onError = vi.fn()
    await loadSettings(dir, onError)
    expect(onError).toHaveBeenCalledWith('parse', expect.any(SyntaxError), { name: expect.stringMatching(CORRUPT_NAME), moved: false })
    expect((await readdir(dir)).sort()).toEqual([onError.mock.calls[0][2].name, 'settings.json'].sort())
  })

  it('옮기지도 복사하지도 못했으면 keep-corrupt를 알리고 parse의 남긴 파일은 null', async () => {
    await writeFile(join(dir, 'settings.json'), '{oops')
    vi.mocked(fsp.rename).mockRejectedValueOnce(ebusy())
    vi.mocked(fsp.copyFile).mockRejectedValueOnce(ebusy())
    const onError = vi.fn()
    expect(await loadSettings(dir, onError)).toEqual(DEFAULT_SETTINGS)
    expect(onError.mock.calls.map(([what]) => what)).toEqual(['keep-corrupt', 'parse'])
    expect(onError).toHaveBeenLastCalledWith('parse', expect.any(SyntaxError), null)
    expect(await readdir(dir)).toEqual(['settings.json'])
  })

  it('읽지 못하면(파일 자리에 폴더 등) onError(read)만 알린다(파일은 옮기지 않는다)', async () => {
    await mkdir(join(dir, 'settings.json'))
    const onError = vi.fn()
    expect(await loadSettings(dir, onError)).toEqual(DEFAULT_SETTINGS)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBe('read')
    expect(onError.mock.calls[0][2]).toBeUndefined()
  })
})

describe('settingsLoadNotice: 시작할 때 기본 설정으로 시작했음을 알리는 트레이 글', () => {
  it('깨진 JSON을 옮겼으면 옮긴 파일 이름을 알린다', () => {
    expect(settingsLoadNotice('parse', { name: 'settings.corrupt-1762678800000.json', moved: true })).toBe(
      'settings.json을 읽지 못해 기본 설정으로 시작했어요. 원래 파일은 settings.corrupt-1762678800000.json으로 옮겨 두었어요.'
    )
  })

  it('사본만 남겼으면 원래 파일을 그대로 두었다고 알린다', () => {
    expect(settingsLoadNotice('parse', { name: 'settings.corrupt-1762678800000.json', moved: false })).toBe(
      'settings.json을 읽지 못해 기본 설정으로 시작했어요. 원래 파일은 그대로 두고 사본을 settings.corrupt-1762678800000.json으로 남겨 두었어요.'
    )
  })

  it('남기지 못했거나 읽지 못한 경우', () => {
    expect(settingsLoadNotice('parse', null)).toBe('settings.json을 읽지 못해 기본 설정으로 시작했어요. 원래 파일은 그대로 두었어요.')
    expect(settingsLoadNotice('read', null)).toBe('settings.json을 읽지 못해 기본 설정으로 시작했어요. 파일은 그대로 두었으니 앱을 다시 켜 주세요.')
  })
})

it('저장은 원자적이고 이전 파일을 .bak으로 남긴다', async () => {
  await saveSettings(dir, DEFAULT_SETTINGS)
  await saveSettings(dir, { ...DEFAULT_SETTINGS, onboardingDone: true })
  expect(JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8')).onboardingDone).toBe(true)
  expect(JSON.parse(await readFile(join(dir, 'settings.json.bak'), 'utf8')).onboardingDone).toBe(false)
  expect(await readdir(dir)).not.toContain('settings.json.tmp')
})

it('한 값만 바꿔 저장해도 실행 중에 손으로 고친 다른 값은 지킨다(파일을 다시 읽고 고친다)', async () => {
  await writeFile(join(dir, 'settings.json'), JSON.stringify({ masking: { internalDomains: ['intra.example'] } }))
  const s = await updateSettings(dir, (cur) => ({ ...cur, masking: { ...cur.masking, mode: 'off' } }))
  expect(s.masking).toMatchObject({ mode: 'off', internalDomains: ['intra.example'] })
  const onDisk = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'))
  expect(onDisk.masking).toMatchObject({ mode: 'off', internalDomains: ['intra.example'] })
})

it('updateSettings: JSON이 깨졌으면 저장하지 않고 SettingsUnreadableError(parse)를 던진다(파일은 옮기지 않고 그대로)', async () => {
  await writeFile(join(dir, 'settings.json'), '{oops')
  const err = await updateSettings(dir, (cur) => ({ ...cur, onboardingDone: true })).catch((e: unknown) => e)
  expect(err).toBeInstanceOf(SettingsUnreadableError)
  expect((err as SettingsUnreadableError).what).toBe('parse')
  expect(await readdir(dir)).toEqual(['settings.json'])
  expect(await readFile(join(dir, 'settings.json'), 'utf8')).toBe('{oops')
})

it('updateSettings: 읽지 못하면(파일 자리에 폴더 등) 저장하지 않고 SettingsUnreadableError(read)를 던진다', async () => {
  await mkdir(join(dir, 'settings.json'))
  const err = await updateSettings(dir, (cur) => ({ ...cur, onboardingDone: true })).catch((e: unknown) => e)
  expect(err).toBeInstanceOf(SettingsUnreadableError)
  expect((err as SettingsUnreadableError).what).toBe('read')
  expect(await readdir(dir)).toEqual(['settings.json'])
})

it('BOM이 붙은 설정 파일도 읽는다', async () => {
  await writeFile(join(dir, 'settings.json'), '﻿' + JSON.stringify({ hotkeys: { palette: 'Alt+`' } }))
  expect((await loadSettings(dir)).hotkeys.palette).toBe('Alt+`')
  expect((await readdir(dir)).some((f) => f.startsWith('settings.corrupt-'))).toBe(false)
})

it('가명 처리 설정 기본값: 되돌리기, 분류 모두 켬, 사내 도메인 없음, 8시간', async () => {
  const m = (await loadSettings(dir)).masking
  expect(m.mode).toBe('restore')
  expect(Object.values(m.categories).every(Boolean)).toBe(true)
  expect(Object.keys(m.categories)).toHaveLength(9)
  expect(m.internalDomains).toEqual([])
  expect(m.ttlHours).toBe(8)
})

it('가명 처리 설정: 분류 일부만 있으면 나머지는 켬, 도메인은 글자만 소문자로, 시간은 1~24로 자른다', async () => {
  await writeFile(
    join(dir, 'settings.json'),
    JSON.stringify({ masking: { mode: 'remove', categories: { ip: false }, internalDomains: ['Intra.Example', 3, ' ', 'bad domain!'], ttlHours: 99 } })
  )
  const m = (await loadSettings(dir)).masking
  expect(m.mode).toBe('remove')
  expect(m.categories.ip).toBe(false)
  expect(m.categories.client).toBe(true)
  expect(m.internalDomains).toEqual(['intra.example'])
  expect(m.ttlHours).toBe(24)
  await writeFile(join(dir, 'settings.json'), JSON.stringify({ masking: { ttlHours: 0 } }))
  expect((await loadSettings(dir)).masking.ttlHours).toBe(1)
})

it('AI 설정 기본값은 Claude, 사용자 대상 없음', async () => {
  expect((await loadSettings(dir)).ai).toEqual({ defaultTarget: 'claude', custom: [] })
})

it('AI 설정: 잘못된 사용자 대상은 빼고, 기본 대상이 목록에 없으면 claude', async () => {
  await writeFile(
    join(dir, 'settings.json'),
    JSON.stringify({
      ai: {
        defaultTarget: 'intra',
        custom: [
          { id: 'intra', name: '사내 LLM', url: 'https://llm.intra.example' },
          { id: 'x', name: 'x', url: 'ftp://x' }
        ]
      }
    })
  )
  const s = await loadSettings(dir)
  expect(s.ai.custom.map((t) => t.id)).toEqual(['intra'])
  expect(s.ai.defaultTarget).toBe('intra')

  await writeFile(join(dir, 'settings.json'), JSON.stringify({ ai: { defaultTarget: 'gone' } }))
  expect((await loadSettings(dir)).ai.defaultTarget).toBe('claude')
})

it('설정 파일을 읽지 못해도(파일 자리에 폴더 등) 기본값으로 시작한다', async () => {
  await mkdir(join(dir, 'settings.json'))
  expect(await loadSettings(dir)).toEqual(DEFAULT_SETTINGS)
})

it('깨진 파일을 옆으로 옮기지 못해도(보안 프로그램이 잡고 있음) 사본을 남기고 기본값으로 시작한다', async () => {
  await writeFile(join(dir, 'settings.json'), '{oops')
  vi.mocked(fsp.rename).mockRejectedValueOnce(Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' }))
  expect(await loadSettings(dir)).toEqual(DEFAULT_SETTINGS)
  expect((await readdir(dir)).some((f) => /^settings\.corrupt-\d+\.json$/.test(f))).toBe(true)
})

it('바·펫 설정: 없으면 기본값(옛 설정 파일 포함), 펫 숨김은 유지', async () => {
  const { mergeSettings } = await import('./settings-store')
  const m = mergeSettings({})
  expect(m.bar).toEqual(DEFAULT_SETTINGS.bar)
  expect(m.pet).toEqual(DEFAULT_PET_SETTINGS)
  await writeFile(join(dir, 'settings.json'), JSON.stringify({ version: 1, hotkeys: { palette: 'Alt+`' }, launchAtLogin: false, onboardingDone: true }))
  const old = await loadSettings(dir)
  expect(old.bar).toEqual(DEFAULT_SETTINGS.bar)
  expect(old.pet).toEqual(DEFAULT_PET_SETTINGS)
  expect(mergeSettings({ pet: { visible: false } }).pet).toEqual({ ...DEFAULT_PET_SETTINGS, visible: false })
  expect(mergeSettings({ pet: { visible: 'no' } }).pet.visible).toBe(true)
  expect(mergeSettings({ bar: { shape: 'nope', wikiCardWidth: 9999 } }).bar).toMatchObject({ shape: 'edge', wikiCardWidth: 560 })
})

it('바 설정을 바꿔 저장하면 읽을 때 유지된다', async () => {
  const s = await updateSettings(dir, (cur) => ({ ...cur, bar: { ...cur.bar, shape: 'capsule', positions: [{ display: '1', ratio: 0.4 }] } }))
  expect(s.bar.shape).toBe('capsule')
  const back = await loadSettings(dir)
  expect(back.bar.shape).toBe('capsule')
  expect(back.bar.positions).toEqual([{ display: '1', ratio: 0.4 }])
})

it('펫 설정을 바꿔 저장하면 읽을 때 유지된다', async () => {
  await updateSettings(dir, (cur) => ({ ...cur, pet: { ...cur.pet, size: 72, activity: 'lively', controlHotkey: 'Ctrl+Alt+P' } }))
  const back = await loadSettings(dir)
  expect(back.pet).toEqual({ ...DEFAULT_PET_SETTINGS, size: 72, activity: 'lively', controlHotkey: 'Ctrl+Alt+P' })
})
