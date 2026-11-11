import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { keepBrokenCopy, readJsonFile, type SaveIo, writeJsonAtomic } from '../files/atomic-write'

/**
 * 학습 연결·사용 기록이 함께 쓰는 작은 목록 파일. 처음 쓸 때 한 번 읽어 메모리에 두고, 바꿀 때마다 원자적으로 저장한다.
 * - 읽기·쓰기는 한 번에 하나씩 부른 순서대로 줄을 세운다(마지막 상태가 저장된다). 저장이 실패해도 줄은 이어지고, 실패한 변경은 메모리에도 반영하지 않는다.
 * - update의 fn이 받은 목록을 그대로 돌려주면 바꾼 것이 없으므로 저장하지 않는다(없는 문장 지우기, 빈 목록 비우기).
 * - 깨진 파일이나 일부 항목을 읽지 못한 파일은 읽을 때 `.broken-<시각>` 사본을 남기고(사본을 못 만들어도 이어 간다) 읽은 항목만으로 시작한다.
 */
export function createListStore<T>(o: {
  path: string
  format: string
  /** 파일의 목록 이름(entries·items) */
  field: string
  /** 한 항목을 검사한다. 맞지 않으면 null */
  parse(raw: unknown): T | null
  io?: SaveIo
  now(): Date
}): { read(): Promise<T[]>; update(fn: (list: T[]) => T[]): Promise<void> } {
  let state: T[] | null = null
  let tail: Promise<unknown> = Promise.resolve()

  async function load(): Promise<T[]> {
    if (state) return state
    const r = await readJsonFile(o.path)
    let list: T[] = []
    if (r.kind === 'ok') {
      const v = r.value as Record<string, unknown> | null
      const raw = v && typeof v === 'object' && v.format === o.format && v.version === 1 ? v[o.field] : undefined
      if (Array.isArray(raw)) {
        list = raw.map(o.parse).filter((x): x is T => x !== null)
        if (list.length !== raw.length) await keepBrokenCopy(o.path, o.now()).catch(() => null)
      } else {
        await keepBrokenCopy(o.path, o.now()).catch(() => null)
      }
    } else if (r.kind === 'broken') {
      await keepBrokenCopy(o.path, o.now()).catch(() => null)
    }
    state = list
    return list
  }

  const queued = <R>(fn: () => Promise<R>): Promise<R> => {
    const run = tail.then(fn, fn)
    tail = run.catch(() => undefined)
    return run
  }

  return {
    read: () => queued(async () => [...(await load())]),
    update: (fn) =>
      queued(async () => {
        const list = [...(await load())]
        const next = fn(list)
        if (next === list) return
        await mkdir(dirname(o.path), { recursive: true })
        await writeJsonAtomic(o.path, { format: o.format, version: 1, [o.field]: next }, { io: o.io })
        state = next
      })
  }
}
