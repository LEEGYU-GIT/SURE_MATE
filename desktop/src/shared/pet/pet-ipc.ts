import type { Rect } from '../types'
import { PET_WINDOW, type PetKey, type PetMenuAction } from './pet-view'

/**
 * 펫 창(renderer)이 보낸 IPC 값 검사. renderer는 믿지 않으므로 main은 여기를 통과한 값만 쓴다.
 * 틀린 값은 null(말풍선 사각형은 undefined)이고, main은 그 메시지를 버린다.
 */

/** 펫 메뉴 동작(PetMenuAction 모두) */
export const PET_MENU_ACTIONS: readonly PetMenuAction[] = ['control', 'sleep', 'wake', 'hide', 'settings']

/** 조종 키(PetKey 모두): 렌더러가 e.code를 바꿔 보낸 이름이다 */
export const PET_KEYS: readonly PetKey[] = ['left', 'right', 'up', 'down', 'jump', 'end']

/**
 * 말풍선 사각형 값의 상한(DIP). 사각형은 펫 창(320×240) 안 좌표라 창 너비의 두 배면 넉넉하다.
 * 창 밖으로 나간 부분은 컨트롤러가 창 안으로 자른다
 */
export const PET_RECT_MAX = 2 * PET_WINDOW.width

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 펫 위 왼쪽 버튼 누름(true)·뗌(false). boolean이 아니면 null */
export function parsePetBool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

/** 펫 메뉴 행 동작. 정한 다섯 가지가 아니면 null */
export function parsePetMenuAction(v: unknown): PetMenuAction | null {
  return typeof v === 'string' && PET_MENU_ACTIONS.includes(v as PetMenuAction) ? (v as PetMenuAction) : null
}

/** 조종 키와 누름(true)·뗌(false). 키 이름과 boolean을 함께 검사하고, 하나라도 틀리면 null */
export function parsePetKey(k: unknown, down: unknown): { key: PetKey; down: boolean } | null {
  if (typeof k !== 'string' || !PET_KEYS.includes(k as PetKey) || typeof down !== 'boolean') return null
  return { key: k as PetKey, down }
}

/**
 * 렌더러가 잰 말풍선 사각형(펫 창 좌표, DIP). null은 말풍선이 사라짐(null을 돌려준다).
 * 네 값이 모두 유한하고 크기가 0보다 크며 모두 ±PET_RECT_MAX 안이면 네 값만 새 객체로 옮기고, 그 밖은 undefined(틀린 값)
 */
export function parsePetRect(v: unknown): Rect | null | undefined {
  if (v === null) return null
  if (!isObj(v)) return undefined
  const { x, y, width, height } = v
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(width) || !isFiniteNumber(height)) return undefined
  if (width <= 0 || height <= 0 || width > PET_RECT_MAX || height > PET_RECT_MAX) return undefined
  if (Math.abs(x) > PET_RECT_MAX || Math.abs(y) > PET_RECT_MAX) return undefined
  return { x, y, width, height }
}
