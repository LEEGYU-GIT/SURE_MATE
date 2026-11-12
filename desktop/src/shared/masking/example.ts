import type { MaskingMode } from '../types'
import { findTerms, type MaskTerm } from './dictionary'
import { MappingTable } from './mapping-table'
import { maskText } from './mask'
import { findPatterns } from './patterns'
import { ALL_CATEGORIES, type MaskCategory } from './types'
import { unmaskText } from './unmask'

/**
 * 가명 처리 설명용 예시(첫 실행 안내·설정 창). 가상 이름만 쓰고, 사용자 가명 사전과 상관없이 늘 같은 결과를 보인다.
 * 실제 가명 처리 함수(maskText·unmaskText)로 만들어 화면의 표기(CLIENT_A, IP_1, 고객사A…)가 앱이 쓰는 것과 어긋나지 않게 한다.
 */
const EXAMPLE_TERMS: MaskTerm[] = [{ id: 'example-client', category: 'client', canonical: '가상자동차', aliases: [] }]
const ALL_ON = Object.fromEntries(ALL_CATEGORIES.map((c) => [c, true])) as Record<MaskCategory, boolean>

/** 보낼 글(원문) */
export const MASKING_EXAMPLE_TEXT = '가상자동차 브레이크 시험 결과를 10.0.3.15 서버에 올렸어요'
/** AI가 원문을 받았다면 썼을 글. 되돌리기 예시는 이 글을 가린 것이 AI가 쓴 글이라고 본다 */
const EXAMPLE_ANSWER = '가상자동차 브레이크 시험은 모두 통과했고, 결과 파일은 10.0.3.15 서버에 있어요'

export interface MaskingExampleView {
  /** 보낼 글(원문) */
  original: string
  /** AI에 가는 글 */
  sent: string
  /** AI가 쓴 글(AI는 바뀐 이름만 안다) */
  answer: string
  /** 가명 되돌리기를 한 글. 바꾸고 되돌리기에서만 있다 */
  restored: string | null
  /** 바꾼 것: 원래 이름 → 바뀐 이름(원문 순서) */
  swaps: { from: string; to: string }[]
}

const detect = (text: string): ReturnType<typeof findTerms> => [...findTerms(text, EXAMPLE_TERMS), ...findPatterns(text, { internalDomains: [] })]

export function maskingExample(mode: MaskingMode): MaskingExampleView {
  if (mode === 'off') return { original: MASKING_EXAMPLE_TEXT, sent: MASKING_EXAMPLE_TEXT, answer: EXAMPLE_ANSWER, restored: null, swaps: [] }
  // 같은 대응표로 원문과 AI 글을 가려 같은 이름이 같은 가명이 되게 한다(실제 대응표와 같은 규칙)
  const table = new MappingTable({ now: () => 0, ttlMs: 3_600_000 })
  const options = { mode, categories: ALL_ON, disabledKeys: [] }
  const sent = maskText(MASKING_EXAMPLE_TEXT, detect(MASKING_EXAMPLE_TEXT), options, table)
  const answer = maskText(EXAMPLE_ANSWER, detect(EXAMPLE_ANSWER), options, table).text
  return {
    original: MASKING_EXAMPLE_TEXT,
    sent: sent.text,
    answer,
    restored: mode === 'restore' ? unmaskText(answer, table).text : null,
    swaps: sent.applied.map((a) => ({ from: a.original, to: a.replacement }))
  }
}

/** 글을 강조할 낱말과 나머지로 나눈다(긴 낱말부터, 겹치지 않게). 화면이 강조 조각만 칠한다 */
export function splitHighlights(text: string, words: string[]): { text: string; hit: boolean }[] {
  const wanted = [...new Set(words.filter((w) => w.length > 0))].sort((a, b) => b.length - a.length)
  const out: { text: string; hit: boolean }[] = []
  let plain = ''
  let i = 0
  while (i < text.length) {
    const word = wanted.find((w) => text.startsWith(w, i))
    if (word) {
      if (plain) out.push({ text: plain, hit: false })
      plain = ''
      out.push({ text: word, hit: true })
      i += word.length
    } else {
      plain += text[i]
      i++
    }
  }
  if (plain) out.push({ text: plain, hit: false })
  return out
}
