import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, open, rename, rm } from 'node:fs/promises'
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
 * 원자적 저장(설계 문서 §16): 겹치지 않는 임시 파일에 쓰고 디스크에 내린 뒤 이름을 바꾼다.
 * 이름 바꾸기가 잠깐 막히면(EPERM·EBUSY·EACCES) 50·100·200·400ms 뒤 다시 하고, 끝내 안 되면 임시 파일을 지우고 던진다.
 */
export async function writeFileAtomic(path: string, text: string, io: SaveIo = defaultIo): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${randomUUID()}.tmp`
  try {
    const file = await open(tmp, 'w')
    try {
      await file.writeFile(text, 'utf8')
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

/** 깨진 파일 사본 이름에 붙이는 시각(파일 이름에 쓸 수 없는 : . 은 - 로) */
export const brokenStamp = (now: Date): string => now.toISOString().replace(/[:.]/g, '-')

/**
 * 읽을 때 문제가 있었던 사용자 파일을 덮어쓰기 전에 `<이름>.broken-<시각>` 사본을 남긴다(읽지 못한 항목을 잃지 않게).
 * 원본은 그대로 두고 사본 경로를 돌려준다. 원본이 없으면 null.
 */
export async function keepBrokenCopy(path: string, now: Date = new Date()): Promise<string | null> {
  const copy = `${path}.broken-${brokenStamp(now)}`
  try {
    await copyFile(path, copy)
    return copy
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}
