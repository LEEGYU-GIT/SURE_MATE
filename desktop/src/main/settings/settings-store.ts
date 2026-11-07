import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MaskingMode } from '../../shared/types'

export interface Settings {
  version: 1
  hotkeys: { palette: string; lookup: string }
  palette: { display: 'cursor' | 'primary' | 'active' }
  launchAtLogin: boolean
  masking: { mode: MaskingMode }
  onboardingDone: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  hotkeys: { palette: 'Ctrl+Alt+Space', lookup: 'Ctrl+Alt+W' },
  palette: { display: 'cursor' },
  launchAtLogin: true,
  masking: { mode: 'restore' },
  onboardingDone: false
}

const FILE = 'settings.json'
const DISPLAYS = ['cursor', 'primary', 'active'] as const
const MASKING_MODES = ['off', 'restore', 'remove'] as const

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, fallback: string): string => (typeof v === 'string' && v.trim() !== '' ? v : fallback)
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback

/** 키별로 타입이 맞는 값만 받고 나머지는 기본값으로 채운다. */
export function mergeSettings(raw: unknown): Settings {
  const r = isObj(raw) ? raw : {}
  const hotkeys = isObj(r.hotkeys) ? r.hotkeys : {}
  const palette = isObj(r.palette) ? r.palette : {}
  const masking = isObj(r.masking) ? r.masking : {}
  const d = DEFAULT_SETTINGS
  return {
    version: 1,
    hotkeys: { palette: str(hotkeys.palette, d.hotkeys.palette), lookup: str(hotkeys.lookup, d.hotkeys.lookup) },
    palette: { display: oneOf(palette.display, DISPLAYS, d.palette.display) },
    launchAtLogin: bool(r.launchAtLogin, d.launchAtLogin),
    masking: { mode: oneOf(masking.mode, MASKING_MODES, d.masking.mode) },
    onboardingDone: bool(r.onboardingDone, d.onboardingDone)
  }
}

const isMissing = (e: unknown): boolean => (e as NodeJS.ErrnoException).code === 'ENOENT'

/** 없으면 기본값. JSON이 깨졌으면 settings.corrupt-<ms>.json으로 옮겨 두고 기본값. */
export async function loadSettings(dir: string): Promise<Settings> {
  const path = join(dir, FILE)
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (e) {
    if (isMissing(e)) return structuredClone(DEFAULT_SETTINGS)
    throw e
  }
  try {
    return mergeSettings(JSON.parse(text))
  } catch {
    await rename(path, join(dir, `settings.corrupt-${Date.now()}.json`))
    return structuredClone(DEFAULT_SETTINGS)
  }
}

/** 임시 파일에 쓰고, 기존 파일을 .bak으로 복사한 뒤 이름을 바꾼다. */
export async function saveSettings(dir: string, s: Settings): Promise<void> {
  await mkdir(dir, { recursive: true })
  const path = join(dir, FILE)
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(s, null, 2), 'utf8')
  try {
    await copyFile(path, `${path}.bak`)
  } catch (e) {
    if (!isMissing(e)) throw e
  }
  await rename(tmp, path)
}
