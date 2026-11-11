import { readdirSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Template } from '../../shared/template/types'
import { writeFileAtomic } from '../files/atomic-write'

/** 종류 이름: 글자·숫자로 시작하고 글자·숫자·공백·_·-만. 경로 문자(. / \ :)는 받지 않는다. */
const KIND = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,39}$/u

/**
 * 기준 예시 문서 `<userData>/references/<종류>.txt`를 읽는다(설계 문서 §7). 없으면 null.
 * 종류 이름은 사용자 템플릿에서 오므로, 폴더 밖을 가리키는 이름은 파일을 열지 않고 null.
 */
export function readReference(userData: string, kind: string): string | null {
  if (!KIND.test(kind)) return null
  try {
    return readFileSync(join(userData, 'references', `${kind}.txt`), 'utf8').replace(/^\uFEFF/, '')
  } catch {
    return null
  }
}

/** 기준 예시 문서 길이: warn을 넘으면 경고(설계 문서 §7 권장 4,000자), max를 넘으면 저장하지 않는다 */
export const REFERENCE_LIMITS = { warn: 4000, max: 20000 } as const
const REFERENCE_DIR = 'references'
const REF_IN_BODY = /\{\{\s*reference:([^}]*)\}\}/g

/**
 * 설정 창의 기준 예시 목록: 템플릿 본문이 쓰는 종류({{reference:종류}}, 사용처 이름과 함께)와 파일만 있는 종류.
 * 파일이 없으면 length는 null(그 줄은 프롬프트에서 빠진다). 종류 이름 순.
 */
export function listReferenceKinds(templates: Template[], userData: string): { kind: string; length: number | null; usedBy: string[] }[] {
  const used = new Map<string, string[]>()
  for (const t of templates) {
    for (const m of t.body.matchAll(REF_IN_BODY)) {
      const kind = m[1].trim()
      if (!KIND.test(kind)) continue
      const names = used.get(kind) ?? []
      if (!names.includes(t.name)) names.push(t.name)
      used.set(kind, names)
    }
  }
  let files: string[] = []
  try {
    files = readdirSync(join(userData, REFERENCE_DIR)).filter((f) => f.toLowerCase().endsWith('.txt'))
  } catch {
    files = []
  }
  for (const f of files) {
    const kind = f.slice(0, -4)
    if (KIND.test(kind) && !used.has(kind)) used.set(kind, [])
  }
  return [...used.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .map(([kind, usedBy]) => {
      const text = readReference(userData, kind)
      return { kind, length: text === null ? null : [...text].length, usedBy }
    })
}

/** 기준 예시 문서 저장(원자적). 종류 이름은 경로 문자를 받지 않는다 */
export async function saveReference(userData: string, kind: string, text: string): Promise<{ ok: true; warning?: string } | { ok: false; reason: string }> {
  if (!KIND.test(kind)) return { ok: false, reason: '종류 이름은 글자·숫자로 시작하고 40자까지예요(. / \\ : 는 쓸 수 없어요)' }
  const length = [...text].length
  if (length > REFERENCE_LIMITS.max) return { ok: false, reason: `기준 예시는 ${REFERENCE_LIMITS.max.toLocaleString('ko-KR')}자까지예요` }
  await writeFileAtomic(join(userData, REFERENCE_DIR, `${kind}.txt`), text)
  return length > REFERENCE_LIMITS.warn ? { ok: true, warning: `${REFERENCE_LIMITS.warn.toLocaleString('ko-KR')}자가 넘어요. AI가 받는 글이 길어져요` } : { ok: true }
}

export async function deleteReference(userData: string, kind: string): Promise<{ ok: true } | { ok: false; reason: 'bad-kind' | 'missing' }> {
  if (!KIND.test(kind)) return { ok: false, reason: 'bad-kind' }
  if (readReference(userData, kind) === null) return { ok: false, reason: 'missing' }
  await rm(join(userData, REFERENCE_DIR, `${kind}.txt`), { force: true })
  return { ok: true }
}
