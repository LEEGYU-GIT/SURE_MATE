import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type IntentPack, parseIntentPack } from '../../shared/natural/intent-pack'
import { readJsonFile } from '../files/atomic-write'

/** `%APPDATA%\Sure-Mate\intents.json`: 사용자가 고친 말하듯 입력 단어 목록(있으면 기본 목록 대신 쓴다) */
export const INTENTS_FILE = 'intents.json'

const EMPTY: IntentPack = { fillers: [], endings: [], particles: [], intents: [] }

async function signature(path: string): Promise<string> {
  try {
    const s = await stat(path)
    return `${s.mtimeMs}:${s.size}`
  } catch {
    return 'none'
  }
}

/**
 * 사용자 목록이 있고 읽을 수 있으면 그것만 쓴다(기본 목록과 합치지 않는다). 없거나 못 읽으면 기본 목록.
 * 일부 값을 뺀 경우와 못 읽은 경우는 다시 읽을 때마다 한 번 알린다(내용은 싣지 않는다). 수정 시각·크기가 바뀔 때만 다시 읽는다.
 */
export function createIntentCache(
  userDir: string,
  builtin: unknown,
  onErrors: (errors: string[]) => void
): { get(): Promise<IntentPack>; invalidate(): void } {
  const path = join(userDir, INTENTS_FILE)
  const base = parseIntentPack(builtin).pack ?? EMPTY
  let cached: { sig: string; pack: IntentPack } | null = null
  return {
    async get() {
      const sig = await signature(path)
      if (cached && cached.sig === sig) return cached.pack
      const r = await readJsonFile(path)
      let pack = base
      if (r.kind === 'broken') onErrors([`${INTENTS_FILE}: 읽지 못함(${r.code})`])
      else if (r.kind === 'ok') {
        const p = parseIntentPack(r.value)
        if (p.pack) pack = p.pack
        if (p.errors.length) onErrors(p.errors.map((e) => `${INTENTS_FILE}: ${e}`))
      }
      cached = { sig: await signature(path), pack }
      return pack
    },
    invalidate() {
      cached = null
    }
  }
}

/** 사용자 목록이 없을 때만 기본 목록을 2칸 들여쓰기로 기록하고(이미 있으면 그대로) 경로를 돌려준다 */
export async function ensureUserIntents(userDir: string, builtin: unknown): Promise<string> {
  const path = join(userDir, INTENTS_FILE)
  await mkdir(userDir, { recursive: true })
  try {
    await writeFile(path, JSON.stringify(builtin, null, 2), { encoding: 'utf8', flag: 'wx' })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
  }
  return path
}
