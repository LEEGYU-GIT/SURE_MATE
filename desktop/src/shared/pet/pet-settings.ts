export type PetSize = 40 | 56 | 72
export type PetActivity = 'calm' | 'normal' | 'lively'

/** 말랑 메이트 설정(설계 문서 §14). 캐릭터 선택은 §14-3 작업이 더한다 */
export interface PetSettings {
  visible: boolean
  /** 펫 한 변(DIP) */
  size: PetSize
  activity: PetActivity
  /** 가만히 있다가 졸기까지 분 */
  sleepAfterMin: number
  bubbles: boolean
  reactions: boolean
  /** 조종 모드 전역 단축키. 기본값 없음(null) */
  controlHotkey: string | null
  reduceMotion: boolean
}

export const PET_LIMITS = { sleepAfterMin: { min: 1, max: 60 }, hotkeyLength: 64 } as const

/** 받는 크기·활발함(파일을 읽을 때와 설정 창이 보낸 값 검사가 같은 목록을 쓴다) */
export const PET_SIZES: readonly PetSize[] = [40, 56, 72]
export const PET_ACTIVITIES: readonly PetActivity[] = ['calm', 'normal', 'lively']

/** 활발함별 걷는 속도(DIP/초) */
export const WALK_SPEED: Record<PetActivity, number> = { calm: 40, normal: 60, lively: 90 }

export const DEFAULT_PET_SETTINGS: PetSettings = {
  visible: true,
  size: 56,
  activity: 'normal',
  sleepAfterMin: 3,
  bubbles: true,
  reactions: true,
  controlHotkey: null,
  reduceMotion: false
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)

/** 키별로 타입·범위가 맞는 값만 받고 나머지는 기본값으로 채운다. */
export function sanitizePetSettings(raw: unknown): PetSettings {
  const r = isObj(raw) ? raw : {}
  const d = DEFAULT_PET_SETTINGS
  const { min, max } = PET_LIMITS.sleepAfterMin
  const hotkey = typeof r.controlHotkey === 'string' ? r.controlHotkey.trim() : ''
  return {
    visible: bool(r.visible, d.visible),
    size: PET_SIZES.includes(r.size as PetSize) ? (r.size as PetSize) : d.size,
    activity: PET_ACTIVITIES.includes(r.activity as PetActivity) ? (r.activity as PetActivity) : d.activity,
    sleepAfterMin:
      typeof r.sleepAfterMin === 'number' && Number.isFinite(r.sleepAfterMin) ? Math.min(max, Math.max(min, Math.round(r.sleepAfterMin))) : d.sleepAfterMin,
    bubbles: bool(r.bubbles, d.bubbles),
    reactions: bool(r.reactions, d.reactions),
    controlHotkey: hotkey !== '' && hotkey.length <= PET_LIMITS.hotkeyLength ? hotkey : null,
    reduceMotion: bool(r.reduceMotion, d.reduceMotion)
  }
}
