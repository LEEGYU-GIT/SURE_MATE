import { createHash } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type IntentPack, parseIntentPack } from '../../shared/natural/intent-pack'
import type { IntentState } from '../../shared/natural/natural-view'
import { readJsonFile } from '../files/atomic-write'

/** `%APPDATA%\Sure-Mate\intents.json`: 사용자가 고친 말하듯 입력 단어 목록(있으면 기본 목록 대신 쓴다) */
export const INTENTS_FILE = 'intents.json'

const EMPTY: IntentPack = { fillers: [], endings: [], particles: [], intents: [] }

/** 단어 목록 JSON의 지문(읽은 값을 다시 JSON으로 바꾼 글의 SHA-256). 들여쓰기·BOM이 달라도 내용이 같으면 같다 */
export const intentsFingerprint = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/**
 * 지금까지 설치 파일에 넣은 기본 목록(resources/intents.json)의 지문(2026-11-10, 11-11, 11-13). 사용자 파일이 이 가운데 하나와 같으면
 * '단어 목록 열기'가 만든 뒤 고치지 않은 사본이므로 지금 기본 목록을 쓴다 — 사본을 그대로 쓰면 그 뒤에 더한 기본 규칙
 * (11-13의 '프로그램 열기' 등)이 영영 보이지 않는다(사용자 파일은 기본 목록과 합치지 않는다). 기본 목록을 바꾸면 새 지문을 더한다
 * (intent-store.test.ts가 지금 기본 목록의 지문이 여기에 있는지 확인한다)
 */
export const BUILTIN_INTENTS_FINGERPRINTS: ReadonlySet<string> = new Set([
  'd0f5087ec4fbc7c51a38f2c7be360ead8fefb00492b0c2eba8faa8dd8f97bfdb',
  'ab2c8c808852beb10492b7c85adf224838ffdab8876f9b8c79636e293f74df2f',
  'df4e648bde17466763cb232922a7f4d65269088a63a7a73c47b5b87e78c53ce4'
])

async function signature(path: string): Promise<string> {
  try {
    const s = await stat(path)
    return `${s.mtimeMs}:${s.size}`
  } catch {
    return 'none'
  }
}

/**
 * 사용자 목록이 있고 읽을 수 있으면 그것만 쓴다(기본 목록과 합치지 않는다). 없거나 못 읽거나 고치지 않은 기본 목록 사본이면 기본 목록.
 * 일부 값을 뺀 경우와 못 읽은 경우는 다시 읽을 때마다 한 번 알린다(내용은 싣지 않는다). 수정 시각·크기가 바뀔 때만 다시 읽는다.
 * 읽은 결과는 읽기 전에 잰 수정 시각·크기로 기억한다. 편집기가 저장하는 중에 읽어 깨진 결과를 얻었으면, 저장이 끝난 파일은 수정 시각·크기가
 * 달라 다음에 다시 읽는다(읽은 뒤에 재면 깨진 결과를 다 저장된 파일의 것으로 기억한다).
 * state는 설정 창 말하듯 입력 탭이 쓴다: 지금 목록과 출처, 마지막으로 읽을 때 생긴 문제(알림과 같은 글에서 파일 이름만 뺀 것).
 */
export function createIntentCache(
  userDir: string,
  builtin: unknown,
  onErrors: (errors: string[]) => void
): { get(): Promise<IntentPack>; state(): Promise<IntentState>; invalidate(): void } {
  const path = join(userDir, INTENTS_FILE)
  const base = parseIntentPack(builtin).pack ?? EMPTY
  let cached: { sig: string; state: IntentState } | null = null
  const state = async (): Promise<IntentState> => {
    const sig = await signature(path)
    if (cached && cached.sig === sig) return cached.state
    const r = await readJsonFile(path)
    const next: IntentState = { pack: base, source: 'builtin', errors: [] }
    if (r.kind === 'broken') next.errors = [`읽지 못함(${r.code})`]
    // 고치지 않은 기본 목록 사본(예전 판 포함)은 지금 기본 목록으로 읽는다(BUILTIN_INTENTS_FINGERPRINTS)
    else if (r.kind === 'ok' && !BUILTIN_INTENTS_FINGERPRINTS.has(intentsFingerprint(r.value))) {
      const p = parseIntentPack(r.value)
      if (p.pack) {
        next.pack = p.pack
        next.source = 'user'
      }
      next.errors = p.errors
    }
    if (next.errors.length) onErrors(next.errors.map((e) => `${INTENTS_FILE}: ${e}`))
    cached = { sig, state: next }
    return next
  }
  return {
    get: async () => (await state()).pack,
    state,
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
