// 말하듯 입력 IPC 값(설계 §13). 팔레트 창이 보내는 선택 기록의 검사와, main이 돌려주는 검색 문맥의 모양.
// 설정 창 말하듯 입력 탭(§14)이 받는 보기와, 그 탭이 보내는 문장 키의 검사.
import type { PaletteGroup } from '../types'
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

/** 기억한 문장 한 줄: 정규화한 문장 키(화면에만 보이고 로그에는 남기지 않는다)와 그 문장이 맨 위로 올리는 항목. 지금 없는 항목이면 null */
export interface PhraseRow {
  key: string
  item: { title: string; group: PaletteGroup } | null
}

/** 의도 규칙이 올리는 대상: 구역 전체, 또는 항목 하나(지금 팔레트에 없으면 title null) */
export type IntentTargetView = { group: PaletteGroup } | { title: string | null }

export interface IntentRuleView {
  id: string
  /** 팔레트 맨 위 후보의 의도 표시 */
  label: string
  words: string[]
  targets: IntentTargetView[]
}

/**
 * 설정 창 말하듯 입력 탭(설계 §13 8단계 "학습 내용", §14 "말하듯 입력(단어 목록, 학습 내용)"). 기억한 문장은 최근에 기억한 것부터.
 * 단어 목록 파일의 위치는 싣지 않는다(실제 경로에 Windows 사용자 이름이 있다. 화면은 %APPDATA%\Sure-Mate\intents.json으로 적는다).
 */
export interface NaturalView {
  /** 기억한 문장·사용 기록을 바꿀 때마다 커진다. 화면은 지금보다 작은 값의 보기를 버린다(지우기 결과와 바뀜 알림이 엇갈려 와도 지운 줄이 되살아나지 않게) */
  rev: number
  phrases: PhraseRow[]
  /** 기억하는 문장 수 상한(넘으면 오래된 것부터 뺀다) */
  phraseMax: number
  /** 사용 기록(항목 id별 횟수·마지막 시각) 수 */
  usageCount: number
  intents: {
    /** builtin: 앱에 든 기본 목록, user: 사용자가 고친 intents.json */
    source: 'builtin' | 'user'
    /** 사용자 파일을 읽을 때 생긴 문제(순번·까닭만, 파일 내용 없음). 못 읽었으면 source가 builtin */
    errors: string[]
    endings: number
    particles: number
    fillers: number
    rules: IntentRuleView[]
  }
}

/** 지우기 결과: 지운 수와 지운 뒤의 보기. 보낸 창이 다르거나 값이 틀리거나 저장하지 못하면 ok false */
export type NaturalChangeResult = { ok: true; count: number; view: NaturalView } | { ok: false }

/** 단어 목록 파일 열기 결과: opened false는 열 프로그램이 없어 폴더를 연 것 */
export type NaturalOpenResult = { ok: true; opened: boolean } | { ok: false }

/** 기억한 문장 키 길이 상한. 키는 팔레트가 보낸 200자(PICK_QUERY_MAX) 안의 문장에서 공백·끝 기호를 뺀 것이다 */
export const PHRASE_KEY_MAX = PICK_QUERY_MAX

/** 설정 창이 지우라고 보낸 문장 키: 1~200자 문자열만 */
export const parsePhraseKey = (v: unknown): string | null => (typeof v === 'string' && v.length >= 1 && v.length <= PHRASE_KEY_MAX ? v : null)
