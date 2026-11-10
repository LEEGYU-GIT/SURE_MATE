import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { allAiTargets, sanitizeAiTargets } from '../../shared/ai-targets'
import { ALL_CATEGORIES, type MaskCategory } from '../../shared/masking/types'
import { sanitizeBarSettings } from '../../shared/bar/bar-settings'
import {
  DEFAULT_SETTINGS,
  isInternalDomain,
  isRemoveLabel,
  PALETTE_DISPLAYS,
  SETTING_MASKING_MODES,
  SETTINGS_LIMITS,
  type Settings
} from '../../shared/settings/settings'

// 설정 타입·기본값은 설정 창도 쓰므로 shared에 있다. 기존 main 코드는 여기서 가져간다
export { DEFAULT_SETTINGS, type Settings }

/** 팔레트 단축키가 다른 앱과 겹칠 때 차례로 시도할 조합(Claude 데스크톱 앱이 Ctrl+Alt+Space를 씀) */
export const PALETTE_HOTKEY_FALLBACKS = ['Ctrl+Alt+Space', 'Alt+`']

/** 설정 파일 이름(사용자 데이터 폴더 안). 설정 화면 전까지 바의 설정 단추가 이 파일을 연다 */
export const SETTINGS_FILE = 'settings.json'
const FILE = SETTINGS_FILE

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, fallback: string): string => (typeof v === 'string' && v.trim() !== '' ? v : fallback)
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback

/** 빼기 모드 표기 중 올바른 것만(알려진 분류, 1~20자, 줄바꿈·중괄호 없음) */
function sanitizeRemoveLabels(raw: unknown): Partial<Record<MaskCategory, string>> {
  if (!isObj(raw)) return {}
  const out: Partial<Record<MaskCategory, string>> = {}
  for (const c of ALL_CATEGORIES) {
    const v = raw[c]
    if (typeof v === 'string' && isRemoveLabel(v.trim())) out[c] = v.trim()
  }
  return out
}

/** 키별로 타입이 맞는 값만 받고 나머지는 기본값으로 채운다. */
export function mergeSettings(raw: unknown): Settings {
  const r = isObj(raw) ? raw : {}
  const hotkeys = isObj(r.hotkeys) ? r.hotkeys : {}
  const palette = isObj(r.palette) ? r.palette : {}
  const masking = isObj(r.masking) ? r.masking : {}
  const categories = isObj(masking.categories) ? masking.categories : {}
  const ai = isObj(r.ai) ? r.ai : {}
  const pet = isObj(r.pet) ? r.pet : {}
  const custom = sanitizeAiTargets(ai.custom)
  const targetIds = allAiTargets(custom).map((t) => t.id)
  const d = DEFAULT_SETTINGS
  return {
    version: 1,
    hotkeys: { palette: str(hotkeys.palette, d.hotkeys.palette), lookup: str(hotkeys.lookup, d.hotkeys.lookup) },
    palette: { display: oneOf(palette.display, PALETTE_DISPLAYS, d.palette.display) },
    launchAtLogin: bool(r.launchAtLogin, d.launchAtLogin),
    masking: {
      mode: oneOf(masking.mode, SETTING_MASKING_MODES, d.masking.mode),
      categories: Object.fromEntries(ALL_CATEGORIES.map((c) => [c, bool(categories[c], true)])) as Record<MaskCategory, boolean>,
      internalDomains: Array.isArray(masking.internalDomains)
        ? masking.internalDomains
            .filter((x): x is string => typeof x === 'string')
            .map((x) => x.trim().toLowerCase())
            .filter(isInternalDomain)
            .slice(0, SETTINGS_LIMITS.internalDomains)
        : [],
      ttlHours:
        typeof masking.ttlHours === 'number' && Number.isFinite(masking.ttlHours)
          ? Math.min(SETTINGS_LIMITS.ttlHours.max, Math.max(SETTINGS_LIMITS.ttlHours.min, Math.round(masking.ttlHours)))
          : d.masking.ttlHours,
      removeLabels: sanitizeRemoveLabels(masking.removeLabels)
    },
    ai: { defaultTarget: oneOf(ai.defaultTarget, targetIds, d.ai.defaultTarget), custom },
    onboardingDone: bool(r.onboardingDone, d.onboardingDone),
    bar: sanitizeBarSettings(r.bar),
    pet: { visible: bool(pet.visible, d.pet.visible) }
  }
}

const isMissing = (e: unknown): boolean => (e as NodeJS.ErrnoException).code === 'ENOENT'

/** 설정 파일을 읽지 못했거나(없는 경우 제외) JSON이 깨져 저장하지 않았다. 파일은 그대로 둔다(cause: 원래 오류) */
export class SettingsUnreadableError extends Error {
  readonly what: 'read' | 'parse'
  constructor(what: 'read' | 'parse', cause: unknown) {
    super(what === 'read' ? '설정 파일을 읽지 못함' : '설정 파일의 JSON이 깨짐', { cause })
    this.name = 'SettingsUnreadableError'
    this.what = what
  }
}

type ReadResult = { ok: true; settings: Settings; missing: boolean } | { ok: false; what: 'read' | 'parse'; error: unknown }

/** 설정 파일을 읽는다. 없으면 기본값(missing)이고, 읽지 못했거나 깨졌으면 그 까닭을 돌려준다(파일은 건드리지 않는다) */
async function readSettingsFile(path: string): Promise<ReadResult> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (e) {
    return isMissing(e) ? { ok: true, settings: structuredClone(DEFAULT_SETTINGS), missing: true } : { ok: false, what: 'read', error: e }
  }
  try {
    return { ok: true, settings: parseSettingsText(text), missing: false }
  } catch (e) {
    return { ok: false, what: 'parse', error: e }
  }
}

/** 설정 JSON을 읽어 기본값과 합친다. JSON이 깨졌으면 던진다 */
function parseSettingsText(text: string): Settings {
  // 메모장·PowerShell 등이 붙이는 UTF-8 BOM은 JSON.parse가 거부하므로 뗀다
  return mergeSettings(JSON.parse(text.replace(/^\uFEFF/, '')))
}

/** 시작할 때 깨진 settings.json을 남긴 파일. name은 폴더 없는 파일 이름, moved는 옮김(true) 또는 원래 파일을 두고 사본(false) */
export type CorruptCopy = { name: string; moved: boolean }

/** 시작할 때 설정 파일 문제: 읽지 못함, JSON이 깨짐(kept: 남긴 파일, 못 남겼으면 null), 깨진 파일을 옮기지도 복사하지도 못함 */
export type SettingsLoadError = (what: 'read' | 'parse' | 'keep-corrupt', e: unknown, kept?: CorruptCopy | null) => void

/**
 * 앱을 시작할 때 읽는다. 없으면 기본값. JSON이 깨졌으면 settings.corrupt-<ms>.json으로 옮겨 두고 기본값.
 * 앱 시작을 막지 않도록 어떤 실패에도 기본값을 돌려주고, 실패는 onError로 알린다(깨진 JSON은 남긴 파일과 함께 parse로).
 */
export async function loadSettings(dir: string, onError: SettingsLoadError = () => {}): Promise<Settings> {
  const path = join(dir, FILE)
  const r = await readSettingsFile(path)
  if (r.ok) return r.settings
  if (r.what === 'read') onError('read', r.error)
  else {
    const name = `settings.corrupt-${Date.now()}.json`
    onError('parse', r.error, await keepCorruptCopy(path, join(dir, name), name, onError))
  }
  return structuredClone(DEFAULT_SETTINGS)
}

/** 깨진 설정 파일을 옆으로 옮긴다. 백신·EDR이 잡고 있어 옮기지 못하면 사본이라도 남긴다. 남긴 파일을 돌려준다 */
async function keepCorruptCopy(path: string, dest: string, name: string, onError: SettingsLoadError): Promise<CorruptCopy | null> {
  try {
    await rename(path, dest)
    return { name, moved: true }
  } catch {
    try {
      await copyFile(path, dest)
      return { name, moved: false }
    } catch (e) {
      onError('keep-corrupt', e)
      return null
    }
  }
}

/**
 * 시작할 때 settings.json을 읽지 못해 기본 설정으로 시작했음을 알리는 트레이 글(해요체, 파일 이름만·경로 없음).
 * 알리지 않으면 사내 도메인·가명 처리 모드가 기본값으로 돌아간 것을 모른 채 실명이 그대로 나갈 수 있다
 */
export function settingsLoadNotice(what: 'read' | 'parse', kept: CorruptCopy | null): string {
  const head = 'settings.json을 읽지 못해 기본 설정으로 시작했어요.'
  if (what === 'read') return `${head} 파일은 그대로 두었으니 앱을 다시 켜 주세요.`
  if (!kept) return `${head} 원래 파일은 그대로 두었어요.`
  return kept.moved ? `${head} 원래 파일은 ${kept.name}으로 옮겨 두었어요.` : `${head} 원래 파일은 그대로 두고 사본을 ${kept.name}으로 남겨 두었어요.`
}

/**
 * 설정 파일을 다시 읽어 update로 고친 뒤 저장하고 돌려준다. 실행 중에 사용자가 파일을 손으로 고쳤어도
 * (설정 화면이 생기기 전에는 유일한 방법) 바꾸려는 값만 바뀌고 나머지는 지켜진다.
 * 파일을 읽지 못했거나 깨졌으면 저장하지 않고 SettingsUnreadableError를 던진다(파일도 옮기지 않는다):
 * 기본값에 이번 값만 바꿔 저장하면 사내 도메인 같은 사용자 설정이 기본값으로 돌아간다.
 * 파일이 없으면 whenMissing()을 기준으로 고쳐 파일을 새로 만든다(주지 않으면 기본값).
 */
export async function updateSettings(dir: string, update: (current: Settings) => Settings, whenMissing?: () => Settings): Promise<Settings> {
  const r = await readSettingsFile(join(dir, FILE))
  if (!r.ok) throw new SettingsUnreadableError(r.what, r.error)
  const next = update(r.missing && whenMissing ? whenMissing() : r.settings)
  await saveSettings(dir, next)
  return next
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
