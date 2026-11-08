import { copyFile, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GLOSSARY_FORMAT, parseGlossaryPack } from '../../shared/glossary/pack'
import type { GlossaryEntry } from '../../shared/glossary/types'

/** `%APPDATA%\Sure-Mate\glossary.json`: 사용자가 추가·수정·가져온 용어(로컬 전용) */
export const GLOSSARY_FILE = 'glossary.json'

export interface LoadedGlossary {
  /** 기본 팩과 사용자 용어를 합친 것(같은 id면 사용자 것, 자리는 기본 팩 순서) */
  entries: GlossaryEntry[]
  /** 사용자 파일의 항목(저장할 때 이것을 고쳐 쓴다) */
  userEntries: GlossaryEntry[]
  errors: string[]
}

type ReadUser = { entries: GlossaryEntry[]; errors: string[]; broken: boolean }

async function readUserFile(path: string): Promise<ReadUser> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { entries: [], errors: [], broken: false }
    return { entries: [], errors: [`${GLOSSARY_FILE}: 읽지 못함(${(e as NodeJS.ErrnoException).code ?? 'unknown'})`], broken: true }
  }
  try {
    // 메모장 등이 붙이는 UTF-8 BOM은 JSON.parse가 거부하므로 뗀다
    const r = parseGlossaryPack(JSON.parse(text.replace(/^﻿/, '')), 'user')
    const broken = r.entries.length === 0 && r.errors.length > 0
    return { entries: r.entries, errors: r.errors.map((e) => `${GLOSSARY_FILE}: ${e}`), broken }
  } catch (e) {
    return { entries: [], errors: [`${GLOSSARY_FILE}: 읽지 못함(${e instanceof Error ? e.name : 'Error'})`], broken: true }
  }
}

/** 기본 팩과 사용자 용어를 읽어 합친다. 사용자 파일이 깨졌어도 기본 팩은 쓰고, 파일은 건드리지 않는다 */
export async function loadGlossary(userDir: string, builtin: unknown): Promise<LoadedGlossary> {
  const base = parseGlossaryPack(builtin, 'builtin')
  const user = await readUserFile(join(userDir, GLOSSARY_FILE))
  const byId = new Map(base.entries.map((e) => [e.id, e]))
  for (const e of user.entries) byId.set(e.id, e)
  return { entries: [...byId.values()], userEntries: user.entries, errors: [...base.errors.map((e) => `기본 용어 팩: ${e}`), ...user.errors] }
}

/**
 * 사용자 용어를 저장한다(임시 파일에 쓰고 이름 바꾸기). 지금 파일이 깨져 읽을 수 없으면
 * 덮어쓰기 전에 `glossary.json.broken-<시각>`으로 사본을 남겨 사용자 용어를 잃지 않는다.
 */
export async function saveUserEntries(userDir: string, entries: GlossaryEntry[]): Promise<void> {
  const path = join(userDir, GLOSSARY_FILE)
  if ((await readUserFile(path)).broken) {
    await copyFile(path, `${path}.broken-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  }
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify({ format: GLOSSARY_FORMAT, version: 1, savedAt: new Date().toISOString(), entries }, null, 2), 'utf8')
  await rename(tmp, path)
}

/** 사용자 파일의 수정 시각이 바뀔 때만 다시 읽는다. 오류는 다시 읽을 때마다 한 번 알린다 */
export function createGlossaryCache(
  userDir: string,
  builtin: unknown,
  onErrors: (errors: string[]) => void
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
      if (value.errors.length) onErrors(value.errors)
      cached = { sig, value }
      return value
    },
    invalidate() {
      cached = null
    }
  }
}
