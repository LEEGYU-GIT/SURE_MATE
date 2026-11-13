import { WALK_SPEED, type PetActivity } from '../../../shared/pet/pet-settings'

/** 무대 치수(DIP): 왼쪽 여백, 오른쪽의 작은 Sure-Mate 바 너비와 바 앞 간격 */
export const MATE_STAGE = { inset: 4, barWidth: 12, barGap: 6 } as const

/** 걷는 길(펫 왼쪽 끝의 x): 왼쪽 여백부터 바 앞까지. 무대가 좁으면 길이 0(걷지 않는다) */
export function walkTrack(o: { width: number; size: number }): { from: number; to: number } {
  const from = MATE_STAGE.inset
  const to = o.width - MATE_STAGE.barWidth - MATE_STAGE.barGap - o.size
  return { from, to: Math.max(from, to) }
}

/** 거리(DIP)를 활발함 속도(설계 §14-2: 차분 40·보통 60·활발 90 DIP/초)로 걷는 시간(ms) */
export const walkMs = (distance: number, activity: PetActivity): number =>
  Math.round((Math.abs(distance) / WALK_SPEED[activity]) * 1000)
