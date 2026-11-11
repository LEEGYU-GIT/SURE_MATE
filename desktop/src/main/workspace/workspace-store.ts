import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { isWorkspacesFile, parseWorkspaces } from '../../shared/workspace/workspace-file'
import { type Workspace, WORKSPACES_FORMAT } from '../../shared/workspace/types'
import { keepBrokenCopy, readJsonFile, type SaveIo, writeJsonAtomic } from '../files/atomic-write'

/** `%APPDATA%\Sure-Mate\workspaces.json`: 저장한 워크스페이스(로컬 전용) */
export const WORKSPACES_FILE = 'workspaces.json'
const RECOVERED = 'workspaces.json을 읽지 못해 백업에서 복구했어요'

/** 깨진 파일 사본을 남긴다. 복사하지 못해도(null) 읽기·.bak 복구·저장은 이어 간다 */
const keepCopy = (path: string): Promise<string | null> => keepBrokenCopy(path).catch(() => null)

export interface LoadedWorkspaces {
  workspaces: Workspace[]
  errors: string[]
  recovered: boolean
}

type Read = { state: 'missing' } | { state: 'bad'; code: string } | { state: 'ok'; workspaces: Workspace[]; errors: string[] }

async function readOne(path: string): Promise<Read> {
  const r = await readJsonFile(path)
  if (r.kind === 'missing') return { state: 'missing' }
  if (r.kind === 'broken') return { state: 'bad', code: r.code }
  if (!isWorkspacesFile(r.value)) return { state: 'bad', code: 'FORMAT' }
  return { state: 'ok', ...parseWorkspaces(r.value) }
}

/** 파일을 읽는다. 본 파일을 못 읽으면 사본을 남기고 .bak을 같은 규칙으로 읽는다 */
export async function loadWorkspaces(dir: string): Promise<LoadedWorkspaces> {
  const path = join(dir, WORKSPACES_FILE)
  const main = await readOne(path)
  if (main.state === 'missing') return { workspaces: [], errors: [], recovered: false }
  if (main.state === 'ok') return { workspaces: main.workspaces, errors: main.errors, recovered: false }
  await keepCopy(path)
  const bak = await readOne(`${path}.bak`)
  if (bak.state === 'ok') return { workspaces: bak.workspaces, errors: [RECOVERED, ...bak.errors], recovered: true }
  return { workspaces: [], errors: [`${WORKSPACES_FILE}: 읽지 못함(${main.code})`], recovered: false }
}

/**
 * 저장한다(`writeJsonAtomic`, 이전 파일은 .bak). 지금 파일에 문제가 있었으면(깨졌거나 일부 항목을 건너뜀)
 * 덮어쓰기 전에 `workspaces.json.broken-<시각>` 사본을 남긴다. 깨진 파일은 .bak으로 밀어내지 않는다.
 */
export async function saveWorkspaces(dir: string, list: Workspace[], io?: SaveIo): Promise<void> {
  await mkdir(dir, { recursive: true })
  const path = join(dir, WORKSPACES_FILE)
  const cur = await readOne(path)
  const unhealthy = cur.state === 'bad' || (cur.state === 'ok' && cur.errors.length > 0)
  if (unhealthy) await keepCopy(path)
  await writeJsonAtomic(path, { format: WORKSPACES_FORMAT, version: 1, savedAt: new Date().toISOString(), workspaces: list }, { io, backup: cur.state !== 'bad' })
}

async function signature(path: string): Promise<string> {
  try {
    const s = await stat(path)
    return `${s.mtimeMs}:${s.size}`
  } catch {
    return 'none'
  }
}

/** 안쪽까지 얼린다(캐시 목록은 여러 곳이 함께 쓰므로 한 곳이 고쳐 다른 곳·파일과 어긋나지 않게) */
function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.freeze(v)
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k])
  }
  return v
}

/**
 * 수정 시각·크기가 바뀔 때만 다시 읽는다. 오류는 다시 읽을 때마다 한 번 알린다. save 뒤에는 저장한 목록을 돌려준다.
 * get이 주는 목록은 얼려 둔 것이고(고치면 TypeError), save는 넘긴 목록의 사본을 얼려 둔다(부른 쪽이 나중에 고쳐도 그대로).
 */
export function createWorkspaceCache(
  dir: string,
  onErrors: (errors: string[]) => void
): { get(): Promise<Workspace[]>; save(list: Workspace[]): Promise<void>; invalidate(): void } {
  const path = join(dir, WORKSPACES_FILE)
  let cached: { sig: string; value: Workspace[] } | null = null
  return {
    async get() {
      const sig = await signature(path)
      if (cached && cached.sig === sig) return cached.value
      const r = await loadWorkspaces(dir)
      if (r.errors.length) onErrors(r.errors)
      const value = deepFreeze(r.workspaces)
      cached = { sig: await signature(path), value }
      return value
    },
    async save(list) {
      cached = null
      const value = deepFreeze(structuredClone(list))
      await saveWorkspaces(dir, value)
      cached = { sig: await signature(path), value }
    },
    invalidate() {
      cached = null
    }
  }
}
