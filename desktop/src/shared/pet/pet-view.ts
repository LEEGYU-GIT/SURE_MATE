import type { Rect } from '../types'
import type { PetSize } from './pet-settings'

export type PetPose = 'stand' | 'walk' | 'climb' | 'sit' | 'sleep' | 'held' | 'air'
export type PetFace = 'normal' | 'happy' | 'worried' | 'surprised' | 'content' | 'asleep' | 'up'
export type PetProp = 'sunglasses' | 'envelope' | 'alert' | 'zzz' | 'control'

export interface PetLook {
  pose: PetPose
  face: PetFace
  props: PetProp[]
  facing: 'left' | 'right'
  cue: 'hop' | 'land' | null
  cueSeq: number
}

export type PetMenuAction = 'control' | 'sleep' | 'wake' | 'hide' | 'settings'

/** 조종 모드 키(설계 §14-2): ←→ 걷기, ↑↓ 바 옆면 오르내리기, Space 뛰기, Esc 끝 */
export type PetKey = 'left' | 'right' | 'up' | 'down' | 'jump' | 'end'

export interface PetMenuRow {
  action: PetMenuAction
  title: string
  detail?: string
}

export type SlotSide = 'above' | 'left' | 'right'

/** main이 렌더러에 보내는 펫 화면 상태(창 안 좌표, DIP). */
export interface PetView {
  size: PetSize
  /** 창 안 펫 상자 왼쪽 위 */
  box: { x: number; y: number }
  look: PetLook
  /** slot: 창 안 최대 자리 */
  bubble: { seq: number; text: string; side: SlotSide; slot: Rect } | null
  menu: { rows: PetMenuRow[]; rect: Rect; side: SlotSide } | null
  controlling: boolean
  reduceMotion: boolean
}

export const PET_WINDOW = { width: 320, height: 240 } as const

export const SLOT = {
  gap: 8,
  margin: 8,
  bubbleWidth: 200,
  bubbleMaxHeight: 96,
  menuWidth: 176,
  menuRow: 32,
  menuPad: 4,
  /**
   * 메뉴와 창 가장자리 사이. 그림자 --shadow-flyout(아래로 8, 흐림 24)이 투명 창에서 잘리지 않게:
   * 위는 24 − 8, 옆은 24, 아래는 24 + 8. 말풍선은 그림자가 없어 margin을 쓴다
   */
  menuMargin: { top: 16, side: 24, bottom: 32 }
} as const
