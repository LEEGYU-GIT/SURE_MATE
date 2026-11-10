import type { PetPose } from '../../../shared/pet/pet-view'
import { MALLANG_BODY, MALLANG_FACE, MALLANG_HIGHLIGHT, STROKE, type FacePlace } from './mallang-shapes'

/**
 * 그림 교체 자리(§14-3 캐릭터 꾸미기). 캐릭터는 몸 레이어와 자세별 얼굴 자리만 정한다.
 * 얼굴(눈·입·눈썹·볼·선글라스)과 소품(편지·느낌표·z·조종 표시)은 PetSprite가 모든 캐릭터에 같은 레이어로 얹고,
 * 움직임(숨쉬기·걷기·흔들림·폴짝)도 몸 레이어 전체에 같게 건다.
 */
export interface PetCharacter {
  id: string
  /** 몸 레이어(64 격자, 바닥선 y=58). 자세만 받고 상태 기계를 모른다 */
  Body(p: { pose: PetPose }): React.JSX.Element
  /** 얼굴 레이어(눈·입·눈썹·볼·선글라스) 위치: 서 있는 얼굴 기준 이동·배율 */
  face(pose: PetPose): FacePlace
}

/**
 * 말랑 메이트 몸: 청록 젤리(--brand)에 --ink 외곽선, 둥근 몸에는 흰 하이라이트.
 * 캐릭터(MALLANG)는 몸 컴포넌트를 담은 값이라 이 파일은 컴포넌트가 아닌 값도 내보낸다(개발 중 빠른 새로 고침 대신 다시 불러옴).
 */
// eslint-disable-next-line react-refresh/only-export-components
function MallangBody({ pose }: { pose: PetPose }): React.JSX.Element {
  const h = MALLANG_HIGHLIGHT
  return (
    <>
      <path d={MALLANG_BODY[pose]} fill="var(--brand)" stroke="var(--ink)" strokeWidth={STROKE.outline} />
      {h.poses.includes(pose) ? (
        <ellipse cx={h.cx} cy={h.cy} rx={h.rx} ry={h.ry} fill="var(--white)" opacity={h.opacity} transform={`rotate(${h.angle} ${h.cx} ${h.cy})`} />
      ) : null}
    </>
  )
}

export const MALLANG: PetCharacter = {
  id: 'mallang',
  Body: MallangBody,
  face: (pose) => MALLANG_FACE[pose]
}
