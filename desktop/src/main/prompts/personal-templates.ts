import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PACK_FORMAT, parseTemplatePack } from '../../shared/template/pack'
import type { Template } from '../../shared/template/types'
import { keepBrokenCopy, writeFileAtomic } from '../files/atomic-write'
import { TEMPLATES_DIR } from './template-store'

/**
 * 설정 창에서 만들고 고친 템플릿을 두는 파일(`templates/my-templates.json`). 다른 이름의 개인 템플릿 파일
 * (손으로 넣은 팀 팩 등)은 건드리지 않는다. 기본 템플릿을 고치면 같은 id로 여기에 저장해 덮는다(설계 문서 §5).
 */
export const MY_TEMPLATES_FILE = 'my-templates.json'

const myPath = (userDir: string): string => join(userDir, TEMPLATES_DIR, MY_TEMPLATES_FILE)

/** 팩 파일에 쓰는 모양(scope는 불러오는 곳이 정하므로 빼고, 빈 선택 필드도 뺀다) */
function toPackItem(t: Template): Record<string, unknown> {
  const { scope: _scope, ...rest } = t
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
}

/** 내 템플릿 파일을 읽는다(없으면 빈 목록). 읽지 못한 항목·깨진 JSON은 errors */
export async function readMyTemplates(userDir: string): Promise<{ templates: Template[]; errors: string[] }> {
  let text: string
  try {
    text = await readFile(myPath(userDir), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { templates: [], errors: [] }
    return { templates: [], errors: [`${MY_TEMPLATES_FILE}: 읽지 못함(${(e as NodeJS.ErrnoException).code ?? 'unknown'})`] }
  }
  try {
    return parseTemplatePack(JSON.parse(text.replace(/^\uFEFF/, '')), 'personal')
  } catch (e) {
    return { templates: [], errors: [`${MY_TEMPLATES_FILE}: 읽지 못함(${e instanceof Error ? e.name : 'Error'})`] }
  }
}

async function writeMyTemplates(userDir: string, templates: Template[], hadErrors: boolean, now: Date): Promise<void> {
  if (hadErrors) await keepBrokenCopy(myPath(userDir), now)
  await writeFileAtomic(myPath(userDir), JSON.stringify({ format: PACK_FORMAT, version: 1, templates: templates.map(toPackItem) }, null, 2))
}

const defaultNewId = (): string => `my-${Date.now().toString(36)}`

/**
 * 설정 창 편집기의 저장. 팩 검사를 다시 하고(renderer를 믿지 않는다) 틀리면 쓰지 않는다.
 * id가 없으면 새 id, 있으면 내 파일의 같은 id를 바꾸거나(없으면 더함 — 기본 템플릿 덮기) 뒤에 더한다.
 */
export async function savePersonalTemplate(
  userDir: string,
  draft: unknown,
  newId: () => string = defaultNewId,
  now: Date = new Date()
): Promise<{ ok: true; id: string } | { ok: false; errors: string[] }> {
  if (typeof draft !== 'object' || draft === null || Array.isArray(draft)) return { ok: false, errors: ['템플릿 형식이 맞지 않아요'] }
  const raw = draft as Record<string, unknown>
  const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : newId()
  const parsed = parseTemplatePack({ format: PACK_FORMAT, templates: [{ ...raw, id }] }, 'personal')
  if (parsed.errors.length || parsed.templates.length !== 1) return { ok: false, errors: parsed.errors.map((e) => e.replace(/^1번째 템플릿: /, '')) }
  const current = await readMyTemplates(userDir)
  const t = parsed.templates[0]
  const next = current.templates.some((x) => x.id === id) ? current.templates.map((x) => (x.id === id ? t : x)) : [...current.templates, t]
  await writeMyTemplates(userDir, next, current.errors.length > 0, now)
  return { ok: true, id }
}

/** 내 파일에서 지운다(기본 템플릿을 덮은 것이면 기본값으로 돌아간다). 내 파일에 없으면 missing */
export async function deletePersonalTemplate(userDir: string, id: string, now: Date = new Date()): Promise<{ ok: true } | { ok: false; reason: 'missing' }> {
  const current = await readMyTemplates(userDir)
  if (!current.templates.some((t) => t.id === id)) return { ok: false, reason: 'missing' }
  await writeMyTemplates(
    userDir,
    current.templates.filter((t) => t.id !== id),
    current.errors.length > 0,
    now
  )
  return { ok: true }
}
