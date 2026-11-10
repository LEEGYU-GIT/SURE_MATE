import type { PetFace, PetLook, PetPose, PetProp } from '../../../shared/pet/pet-view'

export type EyesKind = 'dot' | 'arc' | 'ring' | 'line'
export type MouthKind = 'smile' | 'small' | 'open' | 'frown' | 'o' | 'none'
export type PetMotion = 'breathe' | 'walk' | 'sway' | 'none'

/** 그릴 것: 상태 기계가 보낸 모습(PetLook)을 레이어별 선택으로 바꾼 값 */
export interface DrawPlan {
  pose: PetPose
  eyes: EyesKind | 'hidden'
  mouth: MouthKind
  brows: boolean
  cheeks: boolean
  blink: boolean
  props: PetProp[]
  /** 소품(편지·느낌표·z·조종 표시)이 위아래로 떠오르는지 */
  floatProps: boolean
  /** 반복 움직임(몸 레이어) */
  motion: PetMotion
  /** 한 번 도는 움직임(cueSeq가 바뀔 때마다 다시) */
  cue: 'hop' | 'land' | null
  /** 왼쪽을 볼 때 캐릭터(몸·얼굴)를 좌우로 뒤집는다 */
  mirror: boolean
}

export interface FaceParts {
  eyes: EyesKind
  mouth: MouthKind
  brows: boolean
  cheeks: boolean
}

/** 표정 → 눈·입·눈썹·볼(설계 문서 §14-2 모습 표, 시안) */
export const FACE_PARTS: Record<PetFace, FaceParts> = {
  normal: { eyes: 'dot', mouth: 'smile', brows: false, cheeks: true },
  happy: { eyes: 'arc', mouth: 'open', brows: false, cheeks: true },
  worried: { eyes: 'dot', mouth: 'frown', brows: true, cheeks: false },
  surprised: { eyes: 'ring', mouth: 'o', brows: false, cheeks: false },
  content: { eyes: 'arc', mouth: 'small', brows: false, cheeks: true },
  asleep: { eyes: 'line', mouth: 'none', brows: false, cheeks: false },
  up: { eyes: 'dot', mouth: 'small', brows: false, cheeks: false }
}

/** 자세 → 반복 움직임. 오르기·공중은 창이 움직이고, 졸 때는 애니메이션도 멈춘다(§14-2) */
const MOTION: Record<PetPose, PetMotion> = { stand: 'breathe', sit: 'breathe', walk: 'walk', held: 'sway', climb: 'none', air: 'none', sleep: 'none' }

const BLINK_POSES: ReadonlySet<PetPose> = new Set(['stand', 'walk', 'sit', 'climb'])
/** 볼은 둥근 몸에만(하이라이트처럼). 좁은 몸(오르기·들림)에서는 볼이 외곽선 밖으로 나간다 */
const NARROW_POSES: ReadonlySet<PetPose> = new Set(['climb', 'held'])
/** 깜빡일 수 있는 뜬 눈. 반달·선으로 감은 눈은 깜빡이지 않는다(시안의 감은 눈에는 깜빡임이 없다) */
const OPEN_EYES: ReadonlySet<DrawPlan['eyes']> = new Set(['dot', 'ring'])
const PROP_ORDER: readonly PetProp[] = ['sunglasses', 'envelope', 'alert', 'zzz', 'control']

export function drawPlan(look: PetLook, o: { reduceMotion: boolean }): DrawPlan {
  const face = FACE_PARTS[look.face]
  const eyes = look.props.includes('sunglasses') ? 'hidden' : face.eyes
  const still = o.reduceMotion
  return {
    pose: look.pose,
    eyes,
    mouth: face.mouth,
    brows: face.brows,
    cheeks: face.cheeks && !NARROW_POSES.has(look.pose),
    blink: !still && BLINK_POSES.has(look.pose) && OPEN_EYES.has(eyes),
    props: PROP_ORDER.filter((p) => look.props.includes(p)),
    floatProps: look.pose !== 'sleep' && !still,
    motion: still ? 'none' : MOTION[look.pose],
    cue: still ? null : look.cue,
    mirror: look.facing === 'left'
  }
}
