import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MASK_DICTIONARY_FORMAT, parseMaskDictionary, type MaskTerm } from '../../shared/masking/dictionary'
import { keepBrokenCopy, writeFileAtomic } from '../files/atomic-write'

/** `%APPDATA%\Sure-Mate\masking-dictionary.json`(로컬 전용, 설계 문서 §8) */
export const MASK_DICTIONARY_FILE = 'masking-dictionary.json'

/** 처음 열 때 넣어 두는 가상 예시. 실제 고객사 이름은 사용자가 직접 넣는다 */
const EXAMPLE = {
  format: MASK_DICTIONARY_FORMAT,
  version: 1,
  terms: [
    { id: 'example-client-1', category: 'client', canonical: '가상자동차', aliases: ['가상차'] },
    { id: 'example-client-2', category: 'client', canonical: 'XY방산', aliases: [] }
  ]
}

/** 사전을 읽는다. 없으면 빈 사전, 읽지 못하면 빈 사전과 이유 */
export async function loadMaskDictionary(userDir: string): Promise<{ terms: MaskTerm[]; errors: string[] }> {
  let text: string
  try {
    text = await readFile(join(userDir, MASK_DICTIONARY_FILE), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { terms: [], errors: [] }
    return { terms: [], errors: [`가명 사전을 읽지 못함(${(e as NodeJS.ErrnoException).code ?? 'unknown'})`] }
  }
  try {
    return parseMaskDictionary(JSON.parse(text.replace(/^\uFEFF/, '')))
  } catch (e) {
    return { terms: [], errors: [`가명 사전을 읽지 못함(${e instanceof Error ? e.name : 'Error'})`] }
  }
}

/** 사전 파일이 없으면 가상 예시로 만들고 경로를 돌려준다(이미 있으면 그대로) */
export async function ensureMaskDictionaryFile(userDir: string): Promise<string> {
  const path = join(userDir, MASK_DICTIONARY_FILE)
  await mkdir(userDir, { recursive: true })
  try {
    await writeFile(path, JSON.stringify(EXAMPLE, null, 2), { encoding: 'utf8', flag: 'wx' })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
  }
  return path
}

const dictionaryText = (terms: MaskTerm[]): string => JSON.stringify({ format: MASK_DICTIONARY_FORMAT, version: 1, terms }, null, 2)

/**
 * 설정 창의 가명 사전 저장(설계 문서 §8). 사전 형식 검사를 다시 하고(renderer를 믿지 않는다) 틀린 항목이 하나라도 있으면 쓰지 않는다.
 * 지금 파일을 읽을 때 오류가 있었으면 덮기 전에 사본을 남긴다. 원자적으로 쓴다.
 */
export async function saveMaskDictionary(userDir: string, terms: unknown, now: Date = new Date()): Promise<{ ok: true; count: number } | { ok: false; errors: string[] }> {
  if (!Array.isArray(terms)) return { ok: false, errors: ['가명 사전 형식이 맞지 않아요'] }
  const parsed = parseMaskDictionary({ format: MASK_DICTIONARY_FORMAT, terms })
  if (parsed.errors.length) return { ok: false, errors: parsed.errors }
  const path = join(userDir, MASK_DICTIONARY_FILE)
  if ((await loadMaskDictionary(userDir)).errors.length) await keepBrokenCopy(path, now)
  await writeFileAtomic(path, dictionaryText(parsed.terms))
  return { ok: true, count: parsed.terms.length }
}

const sameName = (a: MaskTerm, b: MaskTerm): boolean => a.category === b.category && a.canonical.toLowerCase() === b.canonical.toLowerCase()

/**
 * 받은 사전 파일을 지금 사전에 더한다. 같은 분류·이름은 건너뛰고, id가 겹치면 새 id를 준다.
 * 다른 형식이거나 깨졌으면 아무것도 바꾸지 않는다.
 */
export async function importMaskDictionary(userDir: string, text: string, now: Date = new Date()): Promise<{ ok: true; added: number; skipped: number } | { ok: false; errors: string[] }> {
  let raw: unknown
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    return { ok: false, errors: ['가명 사전 파일을 읽지 못했어요(JSON이 깨짐)'] }
  }
  const incoming = parseMaskDictionary(raw)
  if (incoming.terms.length === 0) return { ok: false, errors: incoming.errors.length ? incoming.errors : ['가져올 항목이 없어요'] }
  const current = (await loadMaskDictionary(userDir)).terms
  const ids = new Set(current.map((t) => t.id))
  const merged = [...current]
  let skipped = 0
  for (const t of incoming.terms) {
    if (merged.some((m) => sameName(m, t))) {
      skipped++
      continue
    }
    let id = t.id
    for (let n = 2; ids.has(id); n++) id = `${t.id}-${n}`
    ids.add(id)
    merged.push({ ...t, id })
  }
  const saved = await saveMaskDictionary(userDir, merged, now)
  return saved.ok ? { ok: true, added: merged.length - current.length, skipped } : saved
}

/** 내보낼 사전 글(다시 가져올 수 있는 형식) */
export async function exportMaskDictionaryText(userDir: string): Promise<string> {
  return dictionaryText((await loadMaskDictionary(userDir)).terms)
}
