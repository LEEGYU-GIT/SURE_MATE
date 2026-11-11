import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { keepBrokenCopy, readJsonFile, type SaveIo, writeJsonAtomic } from '../files/atomic-write'

/**
 * 학습 연결·사용 기록이 함께 쓰는 작은 목록 파일. 처음 쓸 때 한 번 읽어 메모리에 두고, 바꿀 때마다 원자적으로 저장한다.
 * - 읽기·쓰기는 한 번에 하나씩 부른 순서대로 줄을 세운다(마지막 상태가 저장된다). 저장이 실패해도 줄은 이어지고, 실패한 변경은 메모리에도 반영하지 않는다.
 * - update의 fn이 받은 목록을 그대로 돌려주면 바꾼 것이 없으므로 저장하지 않는다(없는 문장 지우기, 빈 목록 비우기).
 * - 파일을 읽지 못하면(EBUSY·EPERM·EIO 등 깨진 내용이 아닌 까닭) 그 부름은 오류 코드만 담아 던지고 아무것도 기억하지 않는다.
 *   다음 부름이 다시 읽는다(백신·DLP 프로그램의 잠깐 잠금을 빈 목록으로 알고 다음 저장이 파일을 덮어쓰지 않게). 부르는 쪽은 이미 대신할 동작이 있다:
 *   팔레트는 M4 검색, 선택 기록은 natural.pickError 로그, 설정 창 탭은 다시 시도, 지우기는 ok:false.
 * - 깨진 파일(JSON이 아님, 형식·판이 다름, 일부 항목만 읽힘)은 `.broken-<시각>` 사본을 남기고 읽은 항목만으로 시작한다. 사본을 만들지 못하면
 *   읽기는 이어 가되 이번 실행 동안 파일을 덮어쓰지 않는다(바꾸는 update는 던진다). 다음 실행이 사본을 다시 만든다.
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
  /** 깨진 파일의 사본을 남기지 못했다(이번 실행 동안 저장하지 않는다) */
  let keepFile = false
  let tail: Promise<unknown> = Promise.resolve()

  async function load(): Promise<T[]> {
    if (state) return state
    const r = await readJsonFile(o.path)
    // 내용이 아니라 읽기가 실패했다: 기억하지 않고 던진다(경로·내용 없이 코드만)
    if (r.kind === 'broken' && r.code !== 'PARSE') throw Object.assign(new Error(`목록 파일을 읽지 못함(${r.code})`), { code: r.code })
    let list: T[] = []
    let broken = r.kind === 'broken'
    if (r.kind === 'ok') {
      const v = r.value as Record<string, unknown> | null
      const raw = v && typeof v === 'object' && v.format === o.format && v.version === 1 ? v[o.field] : undefined
      if (Array.isArray(raw)) {
        list = raw.map(o.parse).filter((x): x is T => x !== null)
        broken = list.length !== raw.length
      } else {
        broken = true
      }
    }
    if (broken) {
      try {
        await keepBrokenCopy(o.path, o.now())
      } catch {
        keepFile = true
      }
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
        if (keepFile) throw new Error('깨진 목록 파일의 사본을 남기지 못해 이번 실행에서는 저장하지 않음')
        await mkdir(dirname(o.path), { recursive: true })
        await writeJsonAtomic(o.path, { format: o.format, version: 1, [o.field]: next }, { io: o.io })
        state = next
      })
  }
}
