import { join } from 'node:path'
import type { UsageRecord } from '../../shared/natural/usage'
import type { SaveIo } from '../files/atomic-write'
import { createListStore } from './list-store'
import { trimOldest } from './phrase-store'

/** `%APPDATA%\Sure-Mate\usage.json`: 항목 id별 실행 횟수·마지막 시각(로컬 전용). 입력한 문장은 담지 않는다 */
export const USAGE_FILE = 'usage.json'
export const USAGE_FORMAT = 'sure-mate-usage'
export const USAGE_MAX = 200

interface Item {
  id: string
  count: number
  lastAt: string
}

function parse(raw: unknown): Item | null {
  if (typeof raw !== 'object' || raw === null) return null
  const e = raw as Record<string, unknown>
  if (typeof e.id !== 'string' || !e.id || typeof e.lastAt !== 'string') return null
  if (typeof e.count !== 'number' || !Number.isInteger(e.count) || e.count < 1) return null
  return { id: e.id, count: e.count, lastAt: e.lastAt }
}

export interface UsageStore {
  all(): Promise<Map<string, UsageRecord>>
  record(id: string): Promise<void>
  /** 모두 지우고 지운 수를 준다(설정 창 [사용 기록 지우기]. 비어 있으면 0, 파일을 쓰지 않는다) */
  clear(): Promise<number>
}

/** 읽기·기록·지우기는 모두 같은 줄에서 부른 순서대로 처리하고, 바꿀 때마다 원자적으로 저장한다(list-store) */
export function createUsageStore(userDir: string, o: { io?: SaveIo; now?: () => Date } = {}): UsageStore {
  const now = o.now ?? ((): Date => new Date())
  const store = createListStore<Item>({ path: join(userDir, USAGE_FILE), format: USAGE_FORMAT, field: 'items', parse, io: o.io, now })
  return {
    async all() {
      return new Map((await store.read()).map((i) => [i.id, { count: i.count, lastAt: i.lastAt }]))
    },
    // 고친 항목은 맨 뒤로 보낸다(같은 시각이어도 방금 쓴 항목이 먼저 빠지지 않게)
    record: (id) =>
      store.update((list) => {
        const prev = list.find((i) => i.id === id)
        return trimOldest([...list.filter((i) => i.id !== id), { id, count: (prev?.count ?? 0) + 1, lastAt: now().toISOString() }], USAGE_MAX, (i) => i.lastAt)
      }),
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
