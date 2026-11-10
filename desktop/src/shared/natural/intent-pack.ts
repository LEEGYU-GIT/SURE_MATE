// 말하듯 입력 단어 목록(설계 §13). 기본본은 resources/intents.json, 사용자가 고칠 수 있다.
import { PALETTE_GROUPS } from '../palette-query'
import type { PaletteGroup } from '../types'

export const INTENTS_FORMAT = 'sure-mate-intents'

export type IntentTarget = { group: PaletteGroup } | { id: string }
export interface IntentRule {
  id: string
  label: string
  words: string[]
  targets: IntentTarget[]
}
export interface IntentPack {
  fillers: string[]
  endings: string[]
  particles: string[]
  intents: IntentRule[]
}

export const INTENT_LIMITS = { list: 300, word: 20, rules: 40, words: 100, targets: 20, label: 20 }

const RULE_ID = /^[a-z0-9-]{1,40}$/
const GROUPS = new Set<string>(PALETTE_GROUPS.map((g) => g.id))

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 문자열 목록 정리: NFC·앞뒤 공백 제거, 빈 값·긴 값·중복 제외. 오류에는 항목 순번만 남긴다 */
function cleanList(raw: unknown, name: string, max: number, errors: string[]): string[] {
  if (!Array.isArray(raw)) {
    errors.push(`${name}: 목록이 아님`)
    return []
  }
  const out: string[] = []
  const seen = new Set<string>()
  raw.forEach((item, i) => {
    if (typeof item !== 'string') return void errors.push(`${name} ${i + 1}번째: 문자열이 아님`)
    const w = item.normalize('NFC').trim()
    if (!w) return void errors.push(`${name} ${i + 1}번째: 빈 값`)
    if (w.length > INTENT_LIMITS.word) return void errors.push(`${name} ${i + 1}번째: ${INTENT_LIMITS.word}자 초과`)
    if (seen.has(w)) return void errors.push(`${name} ${i + 1}번째: 중복`)
    if (out.length >= max) return void errors.push(`${name} ${i + 1}번째: ${max}개 초과`)
    seen.add(w)
    out.push(w)
  })
  return out
}

function parseTargets(raw: unknown, label: string, errors: string[]): IntentTarget[] {
  if (!Array.isArray(raw)) return []
  const out: IntentTarget[] = []
  raw.forEach((t, i) => {
    if (out.length >= INTENT_LIMITS.targets) return
    if (isObject(t) && typeof t.group === 'string' && GROUPS.has(t.group)) out.push({ group: t.group as PaletteGroup })
    else if (isObject(t) && typeof t.id === 'string' && t.id.length >= 1 && t.id.length <= 200) out.push({ id: t.id })
    else errors.push(`${label} 대상 ${i + 1}번째: 알 수 없는 대상`)
  })
  return out
}

export function parseIntentPack(raw: unknown): { pack: IntentPack | null; errors: string[] } {
  const errors: string[] = []
  if (!isObject(raw) || raw.format !== INTENTS_FORMAT || raw.version !== 1) {
    return { pack: null, errors: ['단어 목록 형식이나 판이 다름'] }
  }
  const fillers = cleanList(raw.fillers, '군말', INTENT_LIMITS.list, errors)
  const endings = cleanList(raw.endings, '어미', INTENT_LIMITS.list, errors)
  const particles = cleanList(raw.particles, '조사', INTENT_LIMITS.list, errors)

  const intents: IntentRule[] = []
  const ids = new Set<string>()
  const rules = Array.isArray(raw.intents) ? raw.intents : []
  rules.forEach((r, i) => {
    const n = `규칙 ${i + 1}번째`
    if (intents.length >= INTENT_LIMITS.rules) return void errors.push(`${n}: ${INTENT_LIMITS.rules}개 초과`)
    if (!isObject(r)) return void errors.push(`${n}: 객체가 아님`)
    if (typeof r.id !== 'string' || !RULE_ID.test(r.id)) return void errors.push(`${n}: id 형식이 맞지 않음`)
    if (ids.has(r.id)) return void errors.push(`규칙 ${r.id}: id 중복`)
    const label = typeof r.label === 'string' ? r.label.normalize('NFC').trim() : ''
    if (label.length < 1 || label.length > INTENT_LIMITS.label) return void errors.push(`규칙 ${r.id}: 이름 길이가 맞지 않음`)
    const words = cleanList(r.words, `규칙 ${r.id} 단어`, INTENT_LIMITS.words, errors)
    const targets = parseTargets(r.targets, `규칙 ${r.id}`, errors)
    if (targets.length === 0) return void errors.push(`규칙 ${r.id}: 대상이 없어 제외`)
    ids.add(r.id)
    intents.push({ id: r.id, label, words, targets })
  })

  if (intents.length === 0) {
    errors.push('쓸 수 있는 규칙이 없음')
    return { pack: null, errors }
  }
  if (fillers.length + endings.length + particles.length === 0) {
    errors.push('쓸 수 있는 목록이 없음')
    return { pack: null, errors }
  }
  return { pack: { fillers, endings, particles, intents }, errors }
}
