import { FALLBACK_AI_TARGET, type AiTarget } from '../ai-targets'
import { DEFAULT_BAR_SETTINGS, type BarSettings } from '../bar/bar-settings'
import { ALL_CATEGORIES, type MaskCategory } from '../masking/types'
import { DEFAULT_PET_SETTINGS, type PetSettings } from '../pet/pet-settings'
import type { MaskingMode } from '../types'

/** 앱 설정(`%APPDATA%\Sure-Mate\settings.json`). main과 설정 창이 함께 쓴다 */
export interface Settings {
  version: 1
  hotkeys: { palette: string; lookup: string }
  palette: { display: PaletteDisplay }
  launchAtLogin: boolean
  /**
   * 가명 처리(설계 문서 §8): 전체 기본 모드, 분류별 켜기/끄기, 사내 도메인, 대응표 보관 시간,
   * 빼기 모드 표기(분류별로 바꾼 것만, 없으면 기본 표기)
   */
  masking: {
    mode: MaskingMode
    categories: Record<MaskCategory, boolean>
    internalDomains: string[]
    ttlHours: number
    removeLabels?: Partial<Record<MaskCategory, string>>
  }
  /** 기본 AI 대상과 사용자가 더한 대상(사내 LLM 등) */
  ai: { defaultTarget: string; custom: AiTarget[] }
  onboardingDone: boolean
  /** 화면 가장자리 바(설계 문서 §14-1) */
  bar: BarSettings
  /** 말랑 메이트(설계 문서 §14) */
  pet: PetSettings
}

export type PaletteDisplay = 'cursor' | 'primary' | 'active'
export const PALETTE_DISPLAYS: readonly PaletteDisplay[] = ['cursor', 'primary', 'active']
export const SETTING_MASKING_MODES: readonly MaskingMode[] = ['off', 'restore', 'remove']

/** 설정 값의 한계. 파일을 읽을 때(mergeSettings)와 설정 창이 보낸 값(validateSettingsPatch)이 같은 값을 쓴다 */
export const SETTINGS_LIMITS = {
  internalDomains: 20,
  ttlHours: { min: 1, max: 24 },
  customTargets: 10,
  targetName: 40,
  targetId: 64,
  removeLabel: 20
} as const

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  hotkeys: { palette: 'Ctrl+Alt+Space', lookup: 'Ctrl+Alt+W' },
  palette: { display: 'cursor' },
  launchAtLogin: true,
  masking: {
    mode: 'restore',
    categories: Object.fromEntries(ALL_CATEGORIES.map((c) => [c, true])) as Record<MaskCategory, boolean>,
    internalDomains: [],
    ttlHours: 8,
    removeLabels: {}
  },
  ai: { defaultTarget: FALLBACK_AI_TARGET, custom: [] },
  onboardingDone: false,
  bar: { ...DEFAULT_BAR_SETTINGS, positions: [], pinnedPrompts: [...DEFAULT_BAR_SETTINGS.pinnedPrompts] },
  pet: { ...DEFAULT_PET_SETTINGS }
}

/** 사내 도메인 이름(호스트 이름만: 주소·경로·한 단어는 아님). 받기 전에 앞뒤 공백을 떼고 소문자로 바꾼다 */
export const isInternalDomain = (x: string): boolean => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(x) && x.length <= 253

/** 빼기 모드 표기로 받을 수 있는 글(앞뒤 공백을 뗀 뒤): 1~20자, 줄바꿈·중괄호 없음 */
export const isRemoveLabel = (x: string): boolean => x.length >= 1 && x.length <= SETTINGS_LIMITS.removeLabel && !/[\r\n{}]/.test(x)
