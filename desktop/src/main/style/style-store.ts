import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STYLE_LIMITS } from '../../shared/style/style-card'
import type { Template } from '../../shared/template/types'
import { keepBrokenCopy, writeFileAtomic } from '../files/atomic-write'

/**
 * 내 말투 견본(설계 §7-1): `<userData>/style/<종류>.json`. 이 PC에만 두고 프롬프트에는 넣지 않는다
 * (프롬프트에는 견본에서 센 말투 카드만 들어간다). 종류는 템플릿의 {{style:종류}}나 견본 파일에서 온다.
 */
export const STYLE_DIR = 'style'
export const STYLE_FORMAT = 'sure-mate-style'

export interface StyleSample {
  text: string
  /** ISO 시각 */
  addedAt: string
}

/** 종류 이름: 기준 예시와 같은 규칙(글자·숫자로 시작, 글자·숫자·공백·_·-, 40자까지). 경로 문자는 받지 않는다 */
const KIND = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,39}$/u
export const isStyleKind = (kind: string): boolean => KIND.test(kind)
const STYLE_IN_BODY = /\{\{\s*style:([^}]*)\}\}/g

const pathOf = (userData: string, kind: string): string => join(userData, STYLE_DIR, `${kind}.json`)

type Read = { kind: 'ok'; samples: StyleSample[] } | { kind: 'missing' } | { kind: 'broken' }

function readFileState(userData: string, kind: string): Read {
  let text: string
  try {
    text = readFileSync(pathOf(userData, kind), 'utf8')
  } catch {
    return { kind: 'missing' }
  }
  try {
    // 메모장이 붙이는 UTF-8 BOM(U+FEFF)은 JSON.parse가 거부하므로 뗀다
    const v = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) as {
      samples?: unknown
    }
    if (!Array.isArray(v.samples)) return { kind: 'broken' }
    const samples = v.samples
      .filter(
        (s): s is StyleSample =>
          typeof s === 'object' && s !== null && typeof (s as StyleSample).text === 'string'
      )
      .map((s) => ({ text: s.text, addedAt: typeof s.addedAt === 'string' ? s.addedAt : '' }))
    return { kind: 'ok', samples }
  } catch {
    return { kind: 'broken' }
  }
}

/** 이 종류의 견본(없거나 읽지 못하면 빈 목록). 종류 이름이 규칙에 맞지 않으면 파일을 열지 않는다 */
export function readStyleSamples(userData: string, kind: string): StyleSample[] {
  if (!isStyleKind(kind)) return []
  const r = readFileState(userData, kind)
  return r.kind === 'ok' ? r.samples : []
}

/** 템플릿 본문이 쓰는 말투 종류({{style:종류}}) */
export function styleKindsOf(templates: readonly Template[]): Map<string, string[]> {
  const used = new Map<string, string[]>()
  for (const t of templates) {
    for (const m of t.body.matchAll(STYLE_IN_BODY)) {
      const kind = m[1].trim()
      if (!isStyleKind(kind)) continue
      const names = used.get(kind) ?? []
      if (!names.includes(t.name)) names.push(t.name)
      used.set(kind, names)
    }
  }
  return used
}

/** 템플릿 본문의 첫 말투 종류(없으면 null). 'AI 티 지우기'가 마지막에 쓴 프롬프트의 말투를 고를 때 쓴다 */
export function styleKindOfBody(body: string): string | null {
  for (const m of body.matchAll(STYLE_IN_BODY)) {
    const kind = m[1].trim()
    if (isStyleKind(kind)) return kind
  }
  return null
}

/** 설정 창·팔레트의 말투 종류 목록: 템플릿이 쓰는 종류와 견본 파일만 있는 종류. 종류 이름 순 */
export function listStyleKinds(
  templates: readonly Template[],
  userData: string
): { kind: string; samples: number; usedBy: string[] }[] {
  const used = styleKindsOf(templates)
  let files: string[]
  try {
    files = readdirSync(join(userData, STYLE_DIR)).filter((f) => f.toLowerCase().endsWith('.json'))
  } catch {
    files = []
  }
  for (const f of files) {
    const kind = f.slice(0, -5)
    if (isStyleKind(kind) && !used.has(kind)) used.set(kind, [])
  }
  return [...used.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .map(([kind, usedBy]) => ({ kind, samples: readStyleSamples(userData, kind).length, usedBy }))
}

async function writeSamples(userData: string, kind: string, samples: StyleSample[]): Promise<void> {
  await writeFileAtomic(
    pathOf(userData, kind),
    JSON.stringify({ format: STYLE_FORMAT, version: 1, samples }, null, 2)
  )
}

export type AddSampleResult =
  { ok: true; count: number; dropped: boolean } | { ok: false; reason: string }

/**
 * 견본을 하나 더한다. 앞뒤 공백을 떼고 20자 미만·8,000자 초과는 받지 않는다. 같은 글은 다시 넣지 않는다.
 * 30개가 넘으면 가장 오래된 것을 뺀다(dropped). 깨진 파일은 고장 사본을 남기고 새로 쓴다.
 */
export async function addStyleSample(
  userData: string,
  kind: string,
  raw: string,
  now: Date = new Date()
): Promise<AddSampleResult> {
  if (!isStyleKind(kind))
    return {
      ok: false,
      reason: '종류 이름은 글자·숫자로 시작하고 40자까지예요(. / \\ : 는 쓸 수 없어요)'
    }
  const text = raw.replace(/\r\n?/g, '\n').trim()
  const length = [...text].length
  if (length < STYLE_LIMITS.minChars)
    return { ok: false, reason: `견본은 ${STYLE_LIMITS.minChars}자 넘게 골라 주세요` }
  if (length > STYLE_LIMITS.maxChars)
    return {
      ok: false,
      reason: `견본은 ${STYLE_LIMITS.maxChars.toLocaleString('ko-KR')}자까지예요. 나눠서 넣어 주세요`
    }
  const state = readFileState(userData, kind)
  if (state.kind === 'broken') await keepBrokenCopy(pathOf(userData, kind), now)
  const samples = state.kind === 'ok' ? state.samples : []
  if (samples.some((s) => s.text === text)) return { ok: false, reason: '이미 넣은 견본이에요' }
  samples.push({ text, addedAt: now.toISOString() })
  const dropped = samples.length > STYLE_LIMITS.samples
  const kept = dropped ? samples.slice(samples.length - STYLE_LIMITS.samples) : samples
  await writeSamples(userData, kind, kept)
  return { ok: true, count: kept.length, dropped }
}

/** index번째(0부터) 견본을 지운다 */
export async function removeStyleSample(
  userData: string,
  kind: string,
  index: number
): Promise<{ ok: boolean }> {
  if (!isStyleKind(kind) || !Number.isInteger(index) || index < 0) return { ok: false }
  const samples = readStyleSamples(userData, kind)
  if (index >= samples.length) return { ok: false }
  samples.splice(index, 1)
  await writeSamples(userData, kind, samples)
  return { ok: true }
}
