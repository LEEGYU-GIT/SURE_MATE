import { join } from 'node:path'
import type { PhraseEntry } from '../../shared/natural/natural-view'
import type { SaveIo } from '../files/atomic-write'
import { createListStore } from './list-store'

/** `%APPDATA%\Sure-Mate\phrase-map.json`: 기억한 문장(정규화한 키) → 항목 id(로컬 전용, 설계 §13 8단계) */
export const PHRASES_FILE = 'phrase-map.json'
export const PHRASES_FORMAT = 'sure-mate-phrases'
export const PHRASE_MAX = 300

type Entry = PhraseEntry

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

export interface PhraseStore {
  /** 문장 키 → 항목 id(팔레트 검색 문맥) */
  all(): Promise<Map<string, string>>
  /** 파일 순서 그대로(설정 창 보기) */
  entries(): Promise<PhraseEntry[]>
  learn(key: string, id: string): Promise<void>
  /** 그 문장을 지운다. 없으면 false(파일을 다시 쓰지 않는다) */
  remove(key: string): Promise<boolean>
  /** 모두 지우고 지운 수를 준다(비어 있으면 0, 파일을 쓰지 않는다) */
  clear(): Promise<number>
}

/** 읽기·기억하기·지우기는 모두 같은 줄에서 부른 순서대로 처리하고, 바꿀 때마다 원자적으로 저장한다(list-store) */
export function createPhraseStore(userDir: string, o: { io?: SaveIo; now?: () => Date } = {}): PhraseStore {
  const now = o.now ?? ((): Date => new Date())
  const store = createListStore<Entry>({ path: join(userDir, PHRASES_FILE), format: PHRASES_FORMAT, field: 'entries', parse, io: o.io, now })
  return {
    async all() {
      return new Map((await store.read()).map((e) => [e.key, e.id]))
    },
    entries: () => store.read(),
    learn: (key, id) => store.update((list) => trimOldest([...list.filter((e) => e.key !== key), { key, id, at: now().toISOString() }], PHRASE_MAX, (e) => e.at)),
    async remove(key) {
      let removed = false
      await store.update((list) => {
        const next = list.filter((e) => e.key !== key)
        if (next.length === list.length) return list
        removed = true
        return next
      })
      return removed
    },
    async clear() {
      let count = 0
      await store.update((list) => {
        count = list.length
        return list.length > 0 ? [] : list
      })
      return count
    }
  }
}
