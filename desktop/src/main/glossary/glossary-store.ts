import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { GLOSSARY_FORMAT, parseGlossaryPack } from '../../shared/glossary/pack'
import type { GlossaryEntry } from '../../shared/glossary/types'

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

/** 저장할 때 쓰는 파일 기능(시험에서 이름 바꾸기 실패를 흉내 내려고 주입한다) */
export interface SaveIo {
  rename(from: string, to: string): Promise<void>
  sleep(ms: number): Promise<void>
}

const defaultIo: SaveIo = {
  rename,
  sleep: async (ms) => {
    await delay(ms)
  }
}

/** 이름 바꾸기를 다시 해 보기 전에 기다리는 시간(모두 합쳐 1초 안) */
export const RENAME_RETRY_MS = [50, 100, 200, 400]
/** Windows에서 백신·검색 색인·동기화 프로그램이 파일을 잠깐 잡고 있을 때 나는 오류 */
const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES'])

async function renameWithRetry(from: string, to: string, io: SaveIo): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await io.rename(from, to)
      return
    } catch (e) {
      if (!RETRYABLE.has((e as NodeJS.ErrnoException).code ?? '') || attempt >= RENAME_RETRY_MS.length) throw e
      await io.sleep(RENAME_RETRY_MS[attempt])
    }
  }
}

const stamp = (): string => new Date().toISOString().replace(/[:.]/g, '-')

/**
 * 사용자 용어를 저장한다(겹치지 않는 임시 파일에 쓰고 디스크에 내린 뒤 이름 바꾸기).
 * 지금 파일을 읽을 때 문제가 있었으면(깨졌거나, 일부 항목을 건너뛰었거나 줄였으면) 덮어쓰기 전에
 * `glossary.json.broken-<시각>`으로 사본을 남겨, 읽지 못한 사용자 용어를 잃지 않는다.
 */
export async function saveUserEntries(userDir: string, entries: GlossaryEntry[], io: SaveIo = defaultIo): Promise<void> {
  await mkdir(userDir, { recursive: true })
  const path = join(userDir, GLOSSARY_FILE)
  if ((await readUserFile(path)).errors.length > 0) await copyFile(path, `${path}.broken-${stamp()}`)
  const tmp = `${path}.${randomUUID()}.tmp`
  try {
    const file = await open(tmp, 'w')
    try {
      await file.writeFile(JSON.stringify({ format: GLOSSARY_FORMAT, version: 1, savedAt: new Date().toISOString(), entries }, null, 2), 'utf8')
      await file.sync()
    } finally {
      await file.close()
    }
    await renameWithRetry(tmp, path, io)
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw e
  }
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
