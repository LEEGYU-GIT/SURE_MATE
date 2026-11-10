import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

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

/**
 * JSON을 원자적으로 저장한다: 폴더 만들기 → 겹치지 않는 임시 파일에 쓰기 → 디스크에 내리기 →
 * (backup이면 기존 파일을 `.bak`으로 복사) → 이름 바꾸기(재시도). 실패하면 임시 파일을 지우고 오류를 다시 던진다.
 */
export async function writeJsonAtomic(path: string, value: unknown, o: { io?: SaveIo; backup?: boolean } = {}): Promise<void> {
  const io = o.io ?? defaultIo
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${randomUUID()}.tmp`
  try {
    const file = await open(tmp, 'w')
    try {
      await file.writeFile(JSON.stringify(value, null, 2), 'utf8')
      await file.sync()
    } finally {
      await file.close()
    }
    if (o.backup) {
      try {
        await copyFile(path, `${path}.bak`)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      }
    }
    await renameWithRetry(tmp, path, io)
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw e
  }
}

export type JsonRead = { kind: 'missing' } | { kind: 'ok'; value: unknown } | { kind: 'broken'; code: string }

/** JSON 파일을 읽는다. UTF-8 BOM은 떼고, 내용은 오류 문구에 싣지 않으려고 코드만 돌려준다 */
export async function readJsonFile(path: string): Promise<JsonRead> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    return code === 'ENOENT' ? { kind: 'missing' } : { kind: 'broken', code: code ?? 'unknown' }
  }
  try {
    return { kind: 'ok', value: JSON.parse(text.replace(/^﻿/, '')) }
  } catch {
    return { kind: 'broken', code: 'PARSE' }
  }
}

const stamp = (d: Date): string => d.toISOString().replace(/[:.]/g, '-')

/** 덮어쓰기 전에 `<파일>.broken-<시각>` 사본을 남긴다. 파일이 없거나 복사에 실패하면 null */
export async function keepBrokenCopy(path: string, now: Date = new Date()): Promise<string | null> {
  const to = `${path}.broken-${stamp(now)}`
  try {
    await copyFile(path, to)
    return to
  } catch {
    return null
  }
}
