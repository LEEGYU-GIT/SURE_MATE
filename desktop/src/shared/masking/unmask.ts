import { repickParticle } from '../josa'
import type { MappingTable } from './mapping-table'

// AI 답에 남은 가명 토큰을 원래 이름으로 되돌린다(설계 문서 §8 대응표와 되돌리기).
// AI는 CLIENT_A를 Client_A, CLIENT A, [CLIENT_A], client-a처럼 바꿔 쓰기도 해서 조금 바뀐 모양도 찾는다.

/** 구분자(공백·_·-)가 있는 이름 토큰: 대소문자 무시 */
const ENTITY_SPACED = /(?<![A-Za-z0-9])(client|project|person|system)[\s_-]+([a-z]{1,2})(?![A-Za-z0-9])/gi
/** 구분자 없이 붙여 쓴 이름 토큰(CLIENTA): 대문자만. 영어 낱말 clients·systems를 토큰으로 잘못 보지 않게 */
const ENTITY_TIGHT = /(?<![A-Za-z0-9])(CLIENT|PROJECT|PERSON|SYSTEM)([A-Z]{1,2})(?![A-Za-z0-9])/g
/** 패턴 토큰: _·-만 허용(문장 속 "IP 1개"를 토큰으로 보지 않게) */
const PATTERN_TOKEN = /(?<![A-Za-z0-9])(ip|path|email|phone|url)[_-]?(\d{1,4})(?![A-Za-z0-9])/gi

interface Hit {
  start: number
  end: number
  token: string
}

function findTokens(text: string): Hit[] {
  const hits: Hit[] = []
  for (const re of [ENTITY_SPACED, ENTITY_TIGHT, PATTERN_TOKEN]) {
    for (const m of text.matchAll(re)) {
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

/** [CLIENT_A], ( CLIENT_A )처럼 짝이 맞는 괄호로 둘러싸였으면 괄호까지 넓힌다 */
function widenToBrackets(text: string, h: Hit): Hit {
  let s = h.start
  while (text[s - 1] === ' ') s--
  let e = h.end
  while (text[e] === ' ') e++
  const open = text[s - 1]
  const close = text[e]
  if ((open === '[' && close === ']') || (open === '(' && close === ')')) return { ...h, start: s - 1, end: e + 1 }
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
