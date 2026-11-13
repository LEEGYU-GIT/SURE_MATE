export type PetSize = 40 | 56 | 72
export type PetActivity = 'calm' | 'normal' | 'lively'
/** 쉬어 가기 말 간격(분) */
export type PetNudgeMin = 30 | 45 | 60 | 90
/** Ttree 이석 기준(분): Ttree가 입력 없이 이만큼 지나면 이석으로 잡는다. 회사(서버) 설정이라 사용자가 맞춘다 */
export type PetAwayMin = 10 | 15 | 20 | 30
/** 이석 미리 알림: 이석 기준 몇 분 전에 알릴지 */
export type PetAwayLeadMin = 1 | 2 | 3 | 5

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
  /** 쉬어 가기 말 걸기(2026-11-13). 말풍선이 켜져 있어야 보인다 */
  nudges: boolean
  /** 쉬어 가기 말 간격(일한 시간, 분). 매번 ±15% 흔든다(pet-nudge) */
  nudgeEveryMin: PetNudgeMin
  /**
   * Ttree 이석 미리 알림(2026-11-13). 입력 없는 시간이 awayAfterMin − awayLeadMin분에 닿으면 말랑 메이트가 말풍선으로
   * (못 보이면 Windows 알림으로) 알린다. Ttree가 설치된 PC에서만 동작하고, 입력을 흉내 내지 않는다
   */
  awayWarn: boolean
  awayAfterMin: PetAwayMin
  awayLeadMin: PetAwayLeadMin
  /** 조종 모드 전역 단축키. 기본값 없음(null) */
  controlHotkey: string | null
  reduceMotion: boolean
}

export const PET_LIMITS = { sleepAfterMin: { min: 1, max: 60 }, hotkeyLength: 64 } as const

/** 받는 크기·활발함·쉬어 가기 말 간격(파일을 읽을 때와 설정 창이 보낸 값 검사가 같은 목록을 쓴다) */
export const PET_SIZES: readonly PetSize[] = [40, 56, 72]
export const PET_ACTIVITIES: readonly PetActivity[] = ['calm', 'normal', 'lively']
export const PET_NUDGE_MINUTES: readonly PetNudgeMin[] = [30, 45, 60, 90]
export const PET_AWAY_MINUTES: readonly PetAwayMin[] = [10, 15, 20, 30]
export const PET_AWAY_LEAD_MINUTES: readonly PetAwayLeadMin[] = [1, 2, 3, 5]

/** 활발함별 걷는 속도(DIP/초) */
export const WALK_SPEED: Record<PetActivity, number> = { calm: 40, normal: 60, lively: 90 }

export const DEFAULT_PET_SETTINGS: PetSettings = {
  visible: true,
  size: 56,
  activity: 'normal',
  sleepAfterMin: 3,
  bubbles: true,
  reactions: true,
  nudges: true,
  nudgeEveryMin: 60,
  awayWarn: true,
  awayAfterMin: 20,
  awayLeadMin: 2,
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
    // 쉬어 가기 말 전의 파일에는 없다(기본값: 켬, 60분)
    nudges: bool(r.nudges, d.nudges),
    nudgeEveryMin: PET_NUDGE_MINUTES.includes(r.nudgeEveryMin as PetNudgeMin) ? (r.nudgeEveryMin as PetNudgeMin) : d.nudgeEveryMin,
    // 이석 미리 알림 전의 파일에는 없다(기본값: 켬, 20분 기준, 2분 전)
    awayWarn: bool(r.awayWarn, d.awayWarn),
    awayAfterMin: PET_AWAY_MINUTES.includes(r.awayAfterMin as PetAwayMin) ? (r.awayAfterMin as PetAwayMin) : d.awayAfterMin,
    awayLeadMin: PET_AWAY_LEAD_MINUTES.includes(r.awayLeadMin as PetAwayLeadMin) ? (r.awayLeadMin as PetAwayLeadMin) : d.awayLeadMin,
    controlHotkey: hotkey !== '' && hotkey.length <= PET_LIMITS.hotkeyLength ? hotkey : null,
    reduceMotion: bool(r.reduceMotion, d.reduceMotion)
  }
}
