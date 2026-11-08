import { repickParticle } from '../josa'
import type { MappingTable } from './mapping-table'

// AI 답에 남은 가명 토큰을 원래 이름으로 되돌린다(설계 문서 §8 대응표와 되돌리기).
// AI는 CLIENT_A를 Client_A, CLIENT A, [CLIENT_A], client-a처럼 바꿔 쓰기도 해서 조금 바뀐 모양도 찾는다.

/**
 * 구분자(공백·_·-)가 있는 이름 토큰: 대소문자 무시. 다만 두 글자 꼬리는 대문자만 받는다
 * ('client is', 'client_id', 'project of' 같은 영어·코드를 토큰으로 잘못 보지 않게).
 */
const ENTITY_SPACED = /(?<![A-Za-z0-9])(client|project|person|system)[\s_-]+([a-z]{1,2})(?![A-Za-z0-9])/gi
/** 구분자 없이 붙여 쓴 이름 토큰(CLIENTA): 대문자만. 복수형 CLIENTS·SYSTEMS는 토큰이 아니다 */
const ENTITY_TIGHT = /(?<![A-Za-z0-9])(CLIENT|PROJECT|PERSON|SYSTEM)([A-RT-Z]|[A-Z]{2})(?![A-Za-z0-9])/g
/** 패턴 토큰: _·- 구분자가 있으면 대소문자 무시(문장 속 "IP 1개"는 토큰이 아님) */
const PATTERN_SEPARATED = /(?<![A-Za-z0-9])(ip|path|email|phone|url)[_-](\d{1,4})(?![A-Za-z0-9])/gi
/** 구분자 없이 붙여 쓴 패턴 토큰(IP1): 대문자만. 코드 속 변수 path1·ip1을 실제 값으로 바꾸지 않게 */
const PATTERN_TIGHT = /(?<![A-Za-z0-9])(IP|PATH|EMAIL|PHONE|URL)(\d{1,4})(?![A-Za-z0-9])/g

interface Hit {
  start: number
  end: number
  token: string
}

function findTokens(text: string): Hit[] {
  const hits: Hit[] = []
  for (const re of [ENTITY_SPACED, ENTITY_TIGHT, PATTERN_SEPARATED, PATTERN_TIGHT]) {
    for (const m of text.matchAll(re)) {
      if (re === ENTITY_SPACED && m[2].length === 2 && m[2] !== m[2].toUpperCase()) continue
      const start = m.index ?? 0
      hits.push({ start, end: start + m[0].length, token: `${m[1].toUpperCase()}_${m[2].toUpperCase()}` })
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end)
  const out: Hit[] = []
  let lastEnd = -1
  for (const h of hits) {
    if (h.start >= lastEnd) {
      out.push(h)
      lastEnd = h.end
    }
  }
  return out
}

/** 글 속 토큰 모양(대소문자·구분자를 맞춘 CLIENT_A 꼴). 가릴 때 원문에 이미 있는 모양을 피하는 데 쓴다 */
export function tokensIn(text: string): Set<string> {
  return new Set(findTokens(text).map((h) => h.token))
}

/**
 * [CLIENT_A], [ CLIENT_A ]처럼 짝이 맞는 대괄호로 둘러싸였으면 대괄호까지 넓힌다.
 * 소괄호는 AI가 붙인 진짜 괄호 설명인 경우가 많아 남긴다('고객사(CLIENT_A)' → '고객사(가상자동차)').
 */
function widenToBrackets(text: string, h: Hit): Hit {
  let s = h.start
  while (text[s - 1] === ' ') s--
  let e = h.end
  while (text[e] === ' ') e++
  if (text[s - 1] === '[' && text[e] === ']') return { ...h, start: s - 1, end: e + 1 }
  return h
}

/**
 * 글 속 토큰을 대응표로 되돌린다. 되돌린 이름 바로 뒤 조사는 이름의 받침에 맞게 다시 고른다.
 * 대응표에 없는 토큰(AI가 지어낸 CLIENT_C 등)은 그대로 두고 unknownTokens에 한 번씩 담는다.
 */
export function unmaskText(text: string, table: MappingTable): { text: string; restored: number; unknownTokens: string[] } {
  let out = ''
  let pos = 0
  let restored = 0
  const unknown: string[] = []
  for (const hit of findTokens(text)) {
    if (hit.start < pos) continue
    const found = table.lookup(hit.token)
    if (!found) {
      if (!unknown.includes(hit.token)) unknown.push(hit.token)
      continue
    }
    const h = widenToBrackets(text, hit)
    if (h.start < pos) continue
    out += text.slice(pos, h.start) + found.original
    pos = h.end
    restored++
    const particle = repickParticle(found.original, text.slice(pos, pos + 3))
    if (particle) {
      out += particle.particle
      pos += particle.length
    }
  }
  out += text.slice(pos)
  return { text: out, restored, unknownTokens: unknown }
}
