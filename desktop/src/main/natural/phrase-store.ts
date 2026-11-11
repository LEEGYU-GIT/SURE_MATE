import { join } from 'node:path'
import type { SaveIo } from '../files/atomic-write'
import { createListStore } from './list-store'

/** `%APPDATA%\Sure-Mate\phrase-map.json`: 기억한 문장(정규화한 키) → 항목 id(로컬 전용, 설계 §13 8단계) */
export const PHRASES_FILE = 'phrase-map.json'
export const PHRASES_FORMAT = 'sure-mate-phrases'
export const PHRASE_MAX = 300

interface Entry {
  key: string
  id: string
  at: string
}

function parse(raw: unknown): Entry | null {
  if (typeof raw !== 'object' || raw === null) return null
  const e = raw as Record<string, unknown>
  if (typeof e.key !== 'string' || !e.key || typeof e.id !== 'string' || !e.id || typeof e.at !== 'string') return null
  return { key: e.key, id: e.id, at: e.at }
}

/** 오래된(at이 작은) 것부터 빼서 max개로 맞춘다. at을 읽을 수 없으면 가장 오래된 것으로, 같으면 앞쪽부터 */
export function trimOldest<T>(list: T[], max: number, at: (x: T) => string): T[] {
  const time = (x: T): number => {
    const t = Date.parse(at(x))
    return Number.isFinite(t) ? t : -Infinity
  }
  const out = [...list]
  while (out.length > max) {
    let oldest = 0
    for (let i = 1; i < out.length; i++) if (time(out[i]) < time(out[oldest])) oldest = i
    out.splice(oldest, 1)
  }
  return out
}

export function createPhraseStore(
  userDir: string,
  o: { io?: SaveIo; now?: () => Date } = {}
): { all(): Promise<Map<string, string>>; learn(key: string, id: string): Promise<void> } {
  const now = o.now ?? ((): Date => new Date())
  const store = createListStore<Entry>({ path: join(userDir, PHRASES_FILE), format: PHRASES_FORMAT, field: 'entries', parse, io: o.io, now })
  return {
    async all() {
      return new Map((await store.read()).map((e) => [e.key, e.id]))
    },
    learn: (key, id) => store.update((list) => trimOldest([...list.filter((e) => e.key !== key), { key, id, at: now().toISOString() }], PHRASE_MAX, (e) => e.at))
  }
}
