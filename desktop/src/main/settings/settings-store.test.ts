import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings-store'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-settings-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
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

it('저장은 원자적이고 이전 파일을 .bak으로 남긴다', async () => {
  await saveSettings(dir, DEFAULT_SETTINGS)
  await saveSettings(dir, { ...DEFAULT_SETTINGS, onboardingDone: true })
  expect(JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8')).onboardingDone).toBe(true)
  expect(JSON.parse(await readFile(join(dir, 'settings.json.bak'), 'utf8')).onboardingDone).toBe(false)
  expect(await readdir(dir)).not.toContain('settings.json.tmp')
})
