import type { PetPose } from '../../../shared/pet/pet-view'

/**
 * 말랑 메이트 그림(확정 시안 docs/design/mallang-mate.html의 SVG를 그대로 옮김, 설계 문서 §14-2).
 * 64×64 격자 하나, 바닥선 y=58. 몸은 자세마다 다른 경로이고, 얼굴(눈·입·눈썹·볼·선글라스)과
 * 소품(편지·느낌표·z·조종 표시)은 그 위에 얹는 레이어다. 색은 그리는 쪽(character.tsx·PetSprite.tsx)이 토큰으로 정한다.
 */

/** 몸 경로. 서기·걷기·공중은 같은 몸이고, 오르기는 벽이 오른쪽(외곽선 포함 x 44가 바 면 = CLIMB_OFFSET) */
const STAND = 'M8 52 C8 30 18 16 32 16 C46 16 56 30 56 52 C56 57 50 58 32 58 C14 58 8 57 8 52 Z'

export const MALLANG_BODY: Record<PetPose, string> = {
  stand: STAND,
  walk: STAND,
  air: STAND,
  climb: 'M18 8 C30 8 40 14 42 32 C44 50 34 58 22 58 C14 58 12 52 12 32 C12 14 12 8 18 8 Z',
  sit: 'M6 54 C6 38 18 30 32 30 C46 30 58 38 58 54 C58 58 50 59 32 59 C14 59 6 58 6 54 Z',
  sleep: 'M6 54 C6 40 18 33 32 33 C46 33 58 40 58 54 C58 58 50 59 32 59 C14 59 6 58 6 54 Z',
  held: 'M32 4 C38 4 42 12 44 26 C47 44 44 60 32 60 C20 60 17 44 20 26 C22 12 26 4 32 4 Z'
}

/** 하이라이트(흰색 55%): 둥근 몸(서기·걷기·공중)에만 */
export const MALLANG_HIGHLIGHT = {
  cx: 21,
  cy: 27,
  rx: 6,
  ry: 3.4,
  angle: -28,
  opacity: 0.55,
  poses: ['stand', 'walk', 'air'] as readonly PetPose[]
} as const

export interface FacePlace {
  dx: number
  dy: number
  scale: number
}

/** 얼굴은 서 있는 얼굴 좌표 하나로 정의하고, 자세마다 얼굴 가운데를 이만큼 옮기고 줄인다 */
export const FACE_CENTER = { x: 32, y: 38 } as const

/**
 * 자세별 얼굴 자리(얼굴 가운데 (32,38) 기준). 시안의 칸에 맞춘 값:
 * 걷기는 가는 쪽으로 3칸(통통 걷기 칸), 앉기·졸기는 퍼진 몸에 맞춰 6·8칸 아래,
 * 오르기는 벽에서 먼 위쪽(눈이 위를 봄), 들림은 좁은 몸에 맞춰 줄이고 넓은 쪽으로 2칸 위
 * (놀란 입이 시안의 들림 칸 자리 y 45에 오고, 기본으로 쓰는 선글라스가 몸 안에 들어간다).
 */
export const MALLANG_FACE: Record<PetPose, FacePlace> = {
  stand: { dx: 0, dy: 0, scale: 1 },
  walk: { dx: 3, dy: 0, scale: 1 },
  air: { dx: 0, dy: 0, scale: 1 },
  sit: { dx: 0, dy: 6, scale: 1 },
  sleep: { dx: 0, dy: 8, scale: 1 },
  climb: { dx: -7, dy: -18, scale: 0.85 },
  held: { dx: 0, dy: -2, scale: 0.85 }
}

/** 선 굵기(격자). 몸 외곽선 3, 얼굴 선 2.4·2.2(시안), 소품 외곽선 2 */
export const STROKE = { outline: 3, face: 2.4, faceThin: 2.2, ring: 2, prop: 2, mark: 2.4, glint: 1.5 } as const

type Point = readonly [number, number]

/** 얼굴 부품(서 있는 얼굴 좌표). 시안의 가만히·복사·선글라스·경고·들림 칸 */
export const FACE_SHAPES = {
  eyes: {
    dot: { points: [[26, 38], [38, 38]] as Point[], rx: 2.6, ry: 3.6 },
    arc: 'M22 38 Q25 35 28 38 M36 38 Q39 35 42 38',
    /** 흰 눈 + 눈동자(시안처럼 눈동자가 1칸 아래) */
    ring: { points: [[26, 38], [38, 38]] as Point[], rx: 3, ry: 4, pupil: 1.4, pupilDy: 1 },
    line: 'M22 38 h6 M36 38 h6'
  },
  mouth: {
    smile: 'M28 45 Q32 48.5 36 45',
    small: 'M29 44 Q32 46.5 35 44',
    open: 'M27 44 Q32 50 37 44 Z',
    frown: 'M28 48 Q32 45 36 48',
    /** 놀란 입(시안 들림 칸 (32,45)를 서 있는 얼굴 좌표로 옮긴 자리) */
    o: { cx: 32, cy: 49, rx: 2.6, ry: 3.2 }
  },
  brows: 'M21 31 L28 33 M43 31 L36 33',
  cheeks: { points: [[20, 45], [44, 45]] as Point[], r: 2.8, opacity: 0.8 },
  sunglasses: { lenses: [[19, 33], [33, 33]] as Point[], width: 12, height: 8, radius: 4, bridge: 'M31 36 h2', glint: 'M22 35 h4', glintOpacity: 0.7 }
} as const

/** 조종 표시가 들어가는 머리 위 띠(격자 y). 말풍선은 이 위로 비킨다(hopRoom) */
export const CONTROL_BAND = { top: -14, bottom: -2 } as const

/** 소품(펫 상자 좌표, 시안 위치). 조종 표시는 머리를 가리키는 작은 삼각 표지(게임의 "조종 중인 캐릭터" 표시) */
export const PROP_SHAPES = {
  envelope: { x: 40, y: 0, width: 20, height: 14, radius: 2, flap: 'M40.5 1 L50 8 L59.5 1' },
  alert: { cx: 52, cy: 10, r: 8, bar: 'M52 5.5 v5.5', dot: { cx: 52, cy: 14.3, r: 1.4 } },
  zzz: [
    { x: 44, y: 26, size: 11 },
    { x: 51, y: 17, size: 8 }
  ],
  control: { points: [[25, -12.5], [39, -12.5], [32, -3.5]] as Point[], stroke: 2 }
} as const
