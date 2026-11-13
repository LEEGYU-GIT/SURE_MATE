import { allAiTargets, BUILTIN_AI_TARGETS, isOpenableUrl, type AiTarget } from '../ai-targets'
import { BAR_LIMITS, type BarSettings } from '../bar/bar-settings'
import { ALL_CATEGORIES, type MaskCategory } from '../masking/types'
import {
  PET_ACTIVITIES,
  PET_LIMITS,
  PET_NUDGE_MINUTES,
  PET_SIZES,
  type PetActivity,
  type PetNudgeMin,
  type PetSettings,
  type PetSize
} from '../pet/pet-settings'
import type { MaskingMode } from '../types'
import { isInternalDomain, isRemoveLabel, PALETTE_DISPLAYS, SETTING_MASKING_MODES, SETTINGS_LIMITS, type PaletteDisplay, type Settings } from './settings'

export { SETTINGS_LIMITS }

/**
 * 설정 창이 보내는 바뀐 값(설계 문서 §14). 보낸 필드만 바꾸고 나머지는 지금 값을 그대로 둔다.
 * 단축키는 이 길로 바꾸지 않는다(등록해 보고 실패하면 되돌려야 하므로 hotkey-change.ts). 말랑 메이트 조종 단축키도 같다.
 * removeLabels의 null은 그 분류를 기본 표기로 되돌린다.
 */
export interface SettingsPatch {
  palette?: { display: PaletteDisplay }
  launchAtLogin?: boolean
  onboardingDone?: boolean
  masking?: {
    mode?: MaskingMode
    categories?: Partial<Record<MaskCategory, boolean>>
    internalDomains?: string[]
    ttlHours?: number
    removeLabels?: Partial<Record<MaskCategory, string | null>>
  }
  ai?: { defaultTarget?: string; custom?: AiTarget[] }
  bar?: Partial<Omit<BarSettings, 'positions'>>
  pet?: Partial<Omit<PetSettings, 'controlHotkey'>>
  /** 처음 한 번 보이는 안내를 봤는지(확인 화면의 가명 처리 예시) */
  tips?: Partial<Settings['tips']>
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

const TOP_KEYS = [
  'palette',
  'launchAtLogin',
  'onboardingDone',
  'masking',
  'ai',
  'bar',
  'pet',
  'tips'
] as const
const TIP_KEYS = ['maskingExampleSeen'] as const
const MASKING_KEYS = ['mode', 'categories', 'internalDomains', 'ttlHours', 'removeLabels'] as const
const AI_KEYS = ['defaultTarget', 'custom'] as const
const BAR_KEYS = ['shape', 'edge', 'monitor', 'pinnedPrompts', 'autoHide', 'opacity', 'wikiCardMs', 'wikiCardWidth'] as const
const BAR_SHAPES = ['edge', 'capsule', 'off'] as const
const BAR_EDGES = ['left', 'right'] as const
/** 켬·끔 펫 필드와 오류 글에 쓰는 이름(설정 창의 행 이름) */
const PET_SWITCHES = { visible: '보이기', bubbles: '말풍선', reactions: '반응', nudges: '쉬어 가기 말 걸기', reduceMotion: '움직임 줄이기' } as const
/** controlHotkey는 알려진 키지만 이 길로 받지 않는다(아래에서 까닭을 따로 알린다) */
const PET_KEYS = [...(Object.keys(PET_SWITCHES) as (keyof typeof PET_SWITCHES)[]), 'size', 'activity', 'sleepAfterMin', 'nudgeEveryMin', 'controlHotkey'] as const

const idText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim() !== '' && v.length <= max
const intIn = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const numIn = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

/**
 * 설정 창이 보낸 값을 검사한다(renderer를 믿지 않는다). 하나라도 틀리면 아무것도 저장하지 않고 까닭을 모두 돌려준다.
 * cur는 지금 설정(기본 AI 대상이 사용자 대상 목록에 있는지 볼 때 쓴다).
 */
export function validateSettingsPatch(raw: unknown, cur: Settings): { ok: true; patch: SettingsPatch } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!isObj(raw)) return { ok: false, errors: ['설정 값의 형식이 맞지 않아요'] }
  const unknownKeys = (o: Obj, allowed: readonly string[], prefix: string): void => {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) errors.push(`알 수 없는 설정: ${prefix}${k}`)
  }
  unknownKeys(raw, TOP_KEYS, '')
  const patch: SettingsPatch = {}

  if (raw.palette !== undefined) {
    if (!isObj(raw.palette) || !PALETTE_DISPLAYS.includes(raw.palette.display as PaletteDisplay)) errors.push('팔레트를 띄울 모니터 값이 맞지 않아요')
    else {
      unknownKeys(raw.palette, ['display'], 'palette.')
      patch.palette = { display: raw.palette.display as PaletteDisplay }
    }
  }
  for (const k of ['launchAtLogin', 'onboardingDone'] as const) {
    if (raw[k] === undefined) continue
    if (typeof raw[k] !== 'boolean') errors.push(`${k} 값은 켬·끔이어야 해요`)
    else patch[k] = raw[k]
  }

  if (raw.masking !== undefined) {
    if (!isObj(raw.masking)) errors.push('가명 처리 설정의 형식이 맞지 않아요')
    else validateMasking(raw.masking, patch, errors, unknownKeys)
  }
  if (raw.ai !== undefined) {
    if (!isObj(raw.ai)) errors.push('AI 대상 설정의 형식이 맞지 않아요')
    else validateAi(raw.ai, cur, patch, errors, unknownKeys)
  }
  if (raw.bar !== undefined) {
    if (!isObj(raw.bar)) errors.push('바 설정의 형식이 맞지 않아요')
    else validateBar(raw.bar, patch, errors, unknownKeys)
  }
  if (raw.pet !== undefined) {
    if (!isObj(raw.pet)) errors.push('말랑 메이트 설정의 형식이 맞지 않아요')
    else validatePet(raw.pet, patch, errors, unknownKeys)
  }
  if (raw.tips !== undefined) {
    if (!isObj(raw.tips)) errors.push('안내 설정의 형식이 맞지 않아요')
    else {
      unknownKeys(raw.tips, TIP_KEYS, 'tips.')
      const tips: NonNullable<SettingsPatch['tips']> = {}
      for (const k of TIP_KEYS) {
        const v = raw.tips[k]
        if (v === undefined) continue
        if (typeof v !== 'boolean') errors.push(`tips.${k} 값은 켬·끔이어야 해요`)
        else tips[k] = v
      }
      patch.tips = tips
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, patch }
}

type UnknownKeys = (o: Obj, allowed: readonly string[], prefix: string) => void

function validateMasking(m: Obj, patch: SettingsPatch, errors: string[], unknownKeys: UnknownKeys): void {
  unknownKeys(m, MASKING_KEYS, 'masking.')
  const out: NonNullable<SettingsPatch['masking']> = {}
  if (m.mode !== undefined) {
    if (!SETTING_MASKING_MODES.includes(m.mode as MaskingMode)) errors.push('가명 처리 기본 모드 값이 맞지 않아요')
    else out.mode = m.mode as MaskingMode
  }
  if (m.categories !== undefined) {
    if (!isObj(m.categories)) errors.push('가명 처리 분류의 형식이 맞지 않아요')
    else {
      const cats: Partial<Record<MaskCategory, boolean>> = {}
      for (const [k, v] of Object.entries(m.categories)) {
        if (!ALL_CATEGORIES.includes(k as MaskCategory)) errors.push(`알 수 없는 가명 처리 분류: ${k}`)
        else if (typeof v !== 'boolean') errors.push(`가명 처리 분류 ${k}의 값은 켬·끔이어야 해요`)
        else cats[k as MaskCategory] = v
      }
      out.categories = cats
    }
  }
  if (m.internalDomains !== undefined) {
    if (!Array.isArray(m.internalDomains) || m.internalDomains.some((x) => typeof x !== 'string')) errors.push('사내 도메인 목록의 형식이 맞지 않아요')
    else {
      const domains = [...new Set((m.internalDomains as string[]).map((x) => x.trim().toLowerCase()))]
      const bad = domains.filter((x) => !isInternalDomain(x))
      if (bad.length) errors.push(`사내 도메인이 아니에요: ${bad.join(', ')}`)
      if (domains.length > SETTINGS_LIMITS.internalDomains) errors.push(`사내 도메인은 ${SETTINGS_LIMITS.internalDomains}개까지예요`)
      out.internalDomains = domains
    }
  }
  if (m.ttlHours !== undefined) {
    const { min, max } = SETTINGS_LIMITS.ttlHours
    if (!intIn(m.ttlHours, min, max)) errors.push(`대응표 보관 시간은 ${min}~${max}시간(정수)이에요`)
    else out.ttlHours = m.ttlHours
  }
  if (m.removeLabels !== undefined) {
    if (!isObj(m.removeLabels)) errors.push('빼기 표기의 형식이 맞지 않아요')
    else {
      const labels: Partial<Record<MaskCategory, string | null>> = {}
      for (const [k, v] of Object.entries(m.removeLabels)) {
        if (!ALL_CATEGORIES.includes(k as MaskCategory)) errors.push(`알 수 없는 가명 처리 분류: ${k}`)
        else if (v === null) labels[k as MaskCategory] = null
        else if (typeof v !== 'string' || !isRemoveLabel(v.trim())) errors.push(`빼기 표기는 1~${SETTINGS_LIMITS.removeLabel}자이고 줄바꿈·중괄호를 쓸 수 없어요(${k})`)
        else labels[k as MaskCategory] = v.trim()
      }
      out.removeLabels = labels
    }
  }
  patch.masking = out
}

function validateAi(a: Obj, cur: Settings, patch: SettingsPatch, errors: string[], unknownKeys: UnknownKeys): void {
  unknownKeys(a, AI_KEYS, 'ai.')
  const out: NonNullable<SettingsPatch['ai']> = {}
  let custom = cur.ai.custom
  if (a.custom !== undefined) {
    if (!Array.isArray(a.custom)) errors.push('사용자 AI 대상 목록의 형식이 맞지 않아요')
    else {
      const builtinIds = new Set(BUILTIN_AI_TARGETS.map((t) => t.id))
      const seen = new Set<string>()
      const list: AiTarget[] = []
      if (a.custom.length > SETTINGS_LIMITS.customTargets) errors.push(`사용자 AI 대상은 ${SETTINGS_LIMITS.customTargets}개까지예요`)
      for (const t of a.custom) {
        if (!isObj(t)) {
          errors.push('사용자 AI 대상의 형식이 맞지 않아요')
          continue
        }
        const name = typeof t.name === 'string' ? t.name.trim() : ''
        if (!idText(t.id, SETTINGS_LIMITS.targetId)) errors.push('사용자 AI 대상의 id가 맞지 않아요')
        else if (builtinIds.has(t.id.trim()) || seen.has(t.id.trim())) errors.push(`AI 대상 id가 겹쳐요: ${t.id}`)
        else if (!name || name.length > SETTINGS_LIMITS.targetName) errors.push(`AI 대상 이름은 1~${SETTINGS_LIMITS.targetName}자예요`)
        else if (typeof t.url !== 'string' || !isOpenableUrl(t.url)) errors.push(`AI 대상 주소는 http 또는 https로 시작해야 해요: ${name}`)
        else {
          seen.add(t.id.trim())
          list.push({ id: t.id.trim(), name, url: t.url })
        }
      }
      out.custom = list
      custom = list
    }
  }
  const ids = allAiTargets(custom).map((t) => t.id)
  if (a.defaultTarget !== undefined) {
    if (typeof a.defaultTarget !== 'string' || !ids.includes(a.defaultTarget)) errors.push('기본 AI 대상이 목록에 없어요')
    else out.defaultTarget = a.defaultTarget
  } else if (a.custom !== undefined && !ids.includes(cur.ai.defaultTarget)) {
    errors.push('지금 기본 AI 대상은 지울 수 없어요. 다른 대상을 기본으로 고른 뒤 지워 주세요')
  }
  patch.ai = out
}

function validateBar(b: Obj, patch: SettingsPatch, errors: string[], unknownKeys: UnknownKeys): void {
  unknownKeys(b, BAR_KEYS, 'bar.')
  const out: NonNullable<SettingsPatch['bar']> = {}
  if (b.shape !== undefined) {
    if (!BAR_SHAPES.includes(b.shape as never)) errors.push('바 모양 값이 맞지 않아요')
    else out.shape = b.shape as BarSettings['shape']
  }
  if (b.edge !== undefined) {
    if (!BAR_EDGES.includes(b.edge as never)) errors.push('바 가장자리 값이 맞지 않아요')
    else out.edge = b.edge as BarSettings['edge']
  }
  if (b.monitor !== undefined) {
    if (!idText(b.monitor, BAR_LIMITS.idLength)) errors.push('바 모니터 값이 맞지 않아요')
    else out.monitor = b.monitor
  }
  if (b.pinnedPrompts !== undefined) {
    const list = b.pinnedPrompts
    if (!Array.isArray(list) || !list.every((x) => idText(x, BAR_LIMITS.idLength))) errors.push('고정 프롬프트 목록의 형식이 맞지 않아요')
    else if (list.length > BAR_LIMITS.pinnedPrompts) errors.push(`고정 프롬프트는 ${BAR_LIMITS.pinnedPrompts}개까지예요`)
    else out.pinnedPrompts = [...new Set(list as string[])]
  }
  if (b.autoHide !== undefined) {
    if (typeof b.autoHide !== 'boolean') errors.push('자동 숨김 값은 켬·끔이어야 해요')
    else out.autoHide = b.autoHide
  }
  if (b.opacity !== undefined) {
    if (!numIn(b.opacity, BAR_LIMITS.opacity.min, BAR_LIMITS.opacity.max)) errors.push(`바 불투명도는 ${BAR_LIMITS.opacity.min}~${BAR_LIMITS.opacity.max}이에요`)
    else out.opacity = b.opacity
  }
  if (b.wikiCardMs !== undefined) {
    if (!intIn(b.wikiCardMs, BAR_LIMITS.wikiCardMs.min, BAR_LIMITS.wikiCardMs.max)) errors.push('위키 카드 숨김 시간이 범위를 벗어났어요')
    else out.wikiCardMs = b.wikiCardMs
  }
  if (b.wikiCardWidth !== undefined) {
    if (!intIn(b.wikiCardWidth, BAR_LIMITS.wikiCardWidth.min, BAR_LIMITS.wikiCardWidth.max)) errors.push('위키 카드 너비가 범위를 벗어났어요')
    else out.wikiCardWidth = b.wikiCardWidth
  }
  patch.bar = out
}

/**
 * 말랑 메이트(설계 문서 §14): 파일을 읽을 때의 sanitizePetSettings와 같은 값만 받는다. 다만 파일과 달리
 * 범위 밖 숫자를 끝값으로 바꾸거나 반올림하지 않고 거절한다(화면이 보낸 값이 몰래 바뀌지 않게).
 */
function validatePet(p: Obj, patch: SettingsPatch, errors: string[], unknownKeys: UnknownKeys): void {
  unknownKeys(p, PET_KEYS, 'pet.')
  const out: NonNullable<SettingsPatch['pet']> = {}
  if (p.controlHotkey !== undefined) errors.push('조종 단축키는 단축키 녹화로만 바꿀 수 있어요')
  for (const [k, name] of Object.entries(PET_SWITCHES) as [keyof typeof PET_SWITCHES, string][]) {
    const v = p[k]
    if (v === undefined) continue
    if (typeof v !== 'boolean') errors.push(`말랑 메이트 ${name} 값은 켬·끔이어야 해요`)
    else out[k] = v
  }
  if (p.size !== undefined) {
    if (!PET_SIZES.includes(p.size as PetSize)) errors.push(`말랑 메이트 크기는 ${PET_SIZES.join('·')} 가운데 하나예요`)
    else out.size = p.size as PetSize
  }
  if (p.activity !== undefined) {
    if (!PET_ACTIVITIES.includes(p.activity as PetActivity)) errors.push('말랑 메이트 활발함 값이 맞지 않아요')
    else out.activity = p.activity as PetActivity
  }
  if (p.sleepAfterMin !== undefined) {
    const { min, max } = PET_LIMITS.sleepAfterMin
    if (!intIn(p.sleepAfterMin, min, max)) errors.push(`졸기까지 시간은 ${min}~${max}분(정수)이에요`)
    else out.sleepAfterMin = p.sleepAfterMin
  }
  if (p.nudgeEveryMin !== undefined) {
    if (!PET_NUDGE_MINUTES.includes(p.nudgeEveryMin as PetNudgeMin)) errors.push(`쉬어 가기 말 간격은 ${PET_NUDGE_MINUTES.join('·')}분 가운데 하나예요`)
    else out.nudgeEveryMin = p.nudgeEveryMin as PetNudgeMin
  }
  patch.pet = out
}

/** 검사한 패치를 지금 설정에 덮는다(보낸 필드만, 새 객체) */
export function applySettingsPatch(cur: Settings, p: SettingsPatch): Settings {
  const next = structuredClone(cur)
  if (p.palette) next.palette = { ...next.palette, ...p.palette }
  if (p.launchAtLogin !== undefined) next.launchAtLogin = p.launchAtLogin
  if (p.onboardingDone !== undefined) next.onboardingDone = p.onboardingDone
  if (p.masking) {
    const { categories, removeLabels, ...rest } = p.masking
    next.masking = { ...next.masking, ...rest }
    if (categories) next.masking.categories = { ...next.masking.categories, ...categories }
    if (removeLabels) {
      const labels = { ...(next.masking.removeLabels ?? {}) }
      for (const [k, v] of Object.entries(removeLabels) as [MaskCategory, string | null][]) {
        if (v === null) delete labels[k]
        else labels[k] = v
      }
      next.masking.removeLabels = labels
    }
  }
  if (p.ai) next.ai = { ...next.ai, ...p.ai }
  if (p.bar) next.bar = { ...next.bar, ...p.bar }
  if (p.pet) next.pet = { ...next.pet, ...p.pet }
  if (p.tips) next.tips = { ...next.tips, ...p.tips }
  return next
}
