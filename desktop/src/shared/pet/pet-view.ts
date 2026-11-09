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
  menuPad: 4
} as const
