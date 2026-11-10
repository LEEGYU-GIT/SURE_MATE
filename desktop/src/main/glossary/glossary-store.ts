import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { GLOSSARY_FORMAT, parseGlossaryPack } from '../../shared/glossary/pack'
import type { GlossaryEntry } from '../../shared/glossary/types'
import { RENAME_RETRY_MS, type SaveIo, writeJsonAtomic } from '../storage/atomic-json'

/** `%APPDATA%\Sure-Mate\glossary.json`: 사용자가 추가·수정·가져온 용어(로컬 전용) */
export const GLOSSARY_FILE = 'glossary.json'

export interface LoadedGlossary {
  /** 기본 팩과 사용자 용어를 합친 것(같은 id면 사용자 것, 자리는 기본 팩 순서) */
  entries: GlossaryEntry[]
  /** 사용자 파일의 항목(저장할 때 이것을 고쳐 쓴다) */
  userEntries: GlossaryEntry[]
  /** 사용자 파일이 있는데 항목을 하나도 읽지 못함(깨진 JSON, 다른 형식, 읽기 실패) */
  userBroken: boolean
  errors: string[]
  /** errors 가운데 읽었지만 링크·태그·별칭 일부를 뺀 항목 수(entries에 있다). 나머지는 건너뛴 항목이나 읽지 못한 파일 */
  trimmed: number
}

type ReadUser = { entries: GlossaryEntry[]; errors: string[]; trimmed: number; broken: boolean }

async function readUserFile(path: string): Promise<ReadUser> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { entries: [], errors: [], trimmed: 0, broken: false }
    return { entries: [], errors: [`${GLOSSARY_FILE}: 읽지 못함(${(e as NodeJS.ErrnoException).code ?? 'unknown'})`], trimmed: 0, broken: true }
  }
  try {
    // 메모장 등이 붙이는 UTF-8 BOM은 JSON.parse가 거부하므로 뗀다
    const r = parseGlossaryPack(JSON.parse(text.replace(/^﻿/, '')), 'user')
    const broken = r.entries.length === 0 && r.errors.length > 0
    return { entries: r.entries, errors: r.errors.map((e) => `${GLOSSARY_FILE}: ${e}`), trimmed: r.trimmed, broken }
  } catch (e) {
    return { entries: [], errors: [`${GLOSSARY_FILE}: 읽지 못함(${e instanceof Error ? e.name : 'Error'})`], trimmed: 0, broken: true }
  }
}

/** 기본 팩과 사용자 용어를 읽어 합친다. 사용자 파일이 깨졌어도 기본 팩은 쓰고, 파일은 건드리지 않는다 */
export async function loadGlossary(userDir: string, builtin: unknown): Promise<LoadedGlossary> {
  const base = parseGlossaryPack(builtin, 'builtin')
  const user = await readUserFile(join(userDir, GLOSSARY_FILE))
  const byId = new Map(base.entries.map((e) => [e.id, e]))
  for (const e of user.entries) byId.set(e.id, e)
  return {
    entries: [...byId.values()],
    userEntries: user.entries,
    userBroken: user.broken,
    errors: [...base.errors.map((e) => `기본 용어 팩: ${e}`), ...user.errors],
    trimmed: base.trimmed + user.trimmed
  }
}

export { RENAME_RETRY_MS, type SaveIo }

const stamp = (): string => new Date().toISOString().replace(/[:.]/g, '-')

/**
 * 사용자 용어를 저장한다(`writeJsonAtomic`: 임시 파일 → 디스크 반영 → 이름 바꾸기).
 * 지금 파일을 읽을 때 문제가 있었으면(깨졌거나, 일부 항목을 건너뛰었거나 줄였으면) 덮어쓰기 전에
 * `glossary.json.broken-<시각>`으로 사본을 남겨, 읽지 못한 사용자 용어를 잃지 않는다.
 */
export async function saveUserEntries(userDir: string, entries: GlossaryEntry[], io?: SaveIo): Promise<void> {
  await mkdir(userDir, { recursive: true })
  const path = join(userDir, GLOSSARY_FILE)
  if ((await readUserFile(path)).errors.length > 0) await copyFile(path, `${path}.broken-${stamp()}`)
  await writeJsonAtomic(path, { format: GLOSSARY_FORMAT, version: 1, savedAt: new Date().toISOString(), entries }, { io })
}

/**
 * 사용자 파일의 수정 시각이 바뀔 때만 다시 읽는다. 오류는 다시 읽을 때마다 한 번 알린다.
 * trimmed는 errors 가운데 일부 값만 빼고 읽은 항목 수(알림이 그 용어를 건너뛰었다고 하지 않게)
 */
export function createGlossaryCache(
  userDir: string,
  builtin: unknown,
  onErrors: (errors: string[], trimmed: number) => void
): { get(): Promise<LoadedGlossary>; invalidate(): void } {
  let cached: { sig: string; value: LoadedGlossary } | null = null
  return {
    async get() {
      let sig = 'none'
      try {
        const s = await stat(join(userDir, GLOSSARY_FILE))
        sig = `${s.mtimeMs}:${s.size}`
      } catch {
        // 파일이 없으면 기본 팩만
      }
      if (cached && cached.sig === sig) return cached.value
      const value = await loadGlossary(userDir, builtin)
      if (value.errors.length) onErrors(value.errors, value.trimmed)
      cached = { sig, value }
      return value
    },
    invalidate() {
      cached = null
    }
  }
}
