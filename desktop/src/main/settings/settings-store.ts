import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { allAiTargets, FALLBACK_AI_TARGET, sanitizeAiTargets, type AiTarget } from '../../shared/ai-targets'
import type { MaskingMode } from '../../shared/types'

export interface Settings {
  version: 1
  hotkeys: { palette: string; lookup: string }
  palette: { display: 'cursor' | 'primary' | 'active' }
  launchAtLogin: boolean
  masking: { mode: MaskingMode }
  /** 기본 AI 대상과 사용자가 더한 대상(사내 LLM 등) */
  ai: { defaultTarget: string; custom: AiTarget[] }
  onboardingDone: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  hotkeys: { palette: 'Ctrl+Alt+Space', lookup: 'Ctrl+Alt+W' },
  palette: { display: 'cursor' },
  launchAtLogin: true,
  masking: { mode: 'restore' },
  ai: { defaultTarget: FALLBACK_AI_TARGET, custom: [] },
  onboardingDone: false
}

/** 팔레트 단축키가 다른 앱과 겹칠 때 차례로 시도할 조합(Claude 데스크톱 앱이 Ctrl+Alt+Space를 씀) */
export const PALETTE_HOTKEY_FALLBACKS = ['Ctrl+Alt+Space', 'Alt+`']

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
  const ai = isObj(r.ai) ? r.ai : {}
  const custom = sanitizeAiTargets(ai.custom)
  const targetIds = allAiTargets(custom).map((t) => t.id)
  const d = DEFAULT_SETTINGS
  return {
    version: 1,
    hotkeys: { palette: str(hotkeys.palette, d.hotkeys.palette), lookup: str(hotkeys.lookup, d.hotkeys.lookup) },
    palette: { display: oneOf(palette.display, DISPLAYS, d.palette.display) },
    launchAtLogin: bool(r.launchAtLogin, d.launchAtLogin),
    masking: { mode: oneOf(masking.mode, MASKING_MODES, d.masking.mode) },
    ai: { defaultTarget: oneOf(ai.defaultTarget, targetIds, d.ai.defaultTarget), custom },
    onboardingDone: bool(r.onboardingDone, d.onboardingDone)
  }
}

const isMissing = (e: unknown): boolean => (e as NodeJS.ErrnoException).code === 'ENOENT'

/**
 * 없으면 기본값. JSON이 깨졌으면 settings.corrupt-<ms>.json으로 옮겨 두고 기본값.
 * 앱 시작을 막지 않도록 어떤 실패에도 기본값을 돌려주고, 실패는 onError로 알린다.
 */
export async function loadSettings(dir: string, onError: (what: string, e: unknown) => void = () => {}): Promise<Settings> {
  const path = join(dir, FILE)
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (e) {
    if (!isMissing(e)) onError('read', e)
    return structuredClone(DEFAULT_SETTINGS)
  }
  try {
    // 메모장·PowerShell 등이 붙이는 UTF-8 BOM은 JSON.parse가 거부하므로 뗀다
    return mergeSettings(JSON.parse(text.replace(/^\uFEFF/, '')))
  } catch {
    await keepCorruptCopy(path, join(dir, `settings.corrupt-${Date.now()}.json`), onError)
    return structuredClone(DEFAULT_SETTINGS)
  }
}

/** 깨진 설정 파일을 옆으로 옮긴다. 백신·EDR이 잡고 있어 옮기지 못하면 사본이라도 남긴다. */
async function keepCorruptCopy(path: string, dest: string, onError: (what: string, e: unknown) => void): Promise<void> {
  try {
    await rename(path, dest)
  } catch {
    try {
      await copyFile(path, dest)
    } catch (e) {
      onError('keep-corrupt', e)
    }
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
