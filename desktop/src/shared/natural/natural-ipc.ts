// 말하듯 입력 IPC 값(설계 §13). 팔레트 창이 보내는 선택 기록의 검사와, main이 돌려주는 검색 문맥의 모양.
import type { IntentPack } from './intent-pack'
import type { UsageRecord } from './usage'

/** 검색 문맥을 IPC로 보내는 모양(Map은 [키, 값] 목록으로). now는 main의 Date.now() */
export interface SearchContextPayload {
  pack: IntentPack | null
  learned: [string, string][]
  usage: [string, UsageRecord][]
  now: number
}

export const PICK_ID_MAX = 200
export const PICK_QUERY_MAX = 200

export interface Pick {
  id: string
  remember: boolean
  query: string
}

/**
 * 팔레트가 보낸 선택 기록을 검사한다. id는 1~200자 문자열, remember는 boolean이어야 하고, query는 문자열이면 200자까지만 쓰고 아니면 ''.
 * 형식이 맞지 않으면 null(무시).
 */
export function parsePick(v: unknown): Pick | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (typeof o.id !== 'string' || o.id.length < 1 || o.id.length > PICK_ID_MAX) return null
  if (typeof o.remember !== 'boolean') return null
  return { id: o.id, remember: o.remember, query: typeof o.query === 'string' ? o.query.slice(0, PICK_QUERY_MAX) : '' }
}
