import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { PACK_FORMAT } from '../../shared/template/pack'
import { deletePersonalTemplate, exportMyTemplatesText, importTemplatePack, MY_TEMPLATES_FILE, readMyTemplates, savePersonalTemplate } from './personal-templates'
import { loadTemplates, TEMPLATES_DIR } from './template-store'

let dir = ''
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-tpl-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const builtin = { format: PACK_FORMAT, version: 1, templates: [{ id: 'meeting-notes', name: '회의록 정리', kind: 'prompt', body: '정리해 줘\n{{selection}}' }] }
const draft = (o: Record<string, unknown> = {}) => ({ name: '주간 보고 다듬기', aliases: ['주간'], kind: 'prompt', body: '다듬어 줘\n{{selection}}', ...o })
const myPath = (): string => join(dir, TEMPLATES_DIR, MY_TEMPLATES_FILE)

it('새 템플릿은 새 id로 내 템플릿 파일에 저장되고 다음에 불러올 때 보인다', async () => {
  const r = await savePersonalTemplate(dir, draft(), () => 'my-1')
  expect(r).toEqual({ ok: true, id: 'my-1' })
  const loaded = await loadTemplates(dir, builtin)
  expect(loaded.templates.map((t) => t.id)).toEqual(['meeting-notes', 'my-1'])
  expect(JSON.parse(await readFile(myPath(), 'utf8')).format).toBe(PACK_FORMAT)
})

it('같은 id로 다시 저장하면 바꾸고, 틀린 템플릿은 쓰지 않고 까닭을 돌려준다', async () => {
  await savePersonalTemplate(dir, draft(), () => 'my-1')
  await savePersonalTemplate(dir, draft({ id: 'my-1', name: '주간 보고 고침' }))
  expect((await readMyTemplates(dir)).templates.map((t) => t.name)).toEqual(['주간 보고 고침'])
  for (const bad of [draft({ name: '' }), draft({ kind: 'macro' }), draft({ body: ' ' }), draft({ id: 'Bad Id' }), 'x'])
    expect((await savePersonalTemplate(dir, bad)).ok).toBe(false)
  expect((await readMyTemplates(dir)).templates).toHaveLength(1)
})

it('기본 템플릿을 고치면 같은 id로 덮고, 지우면 기본값으로 돌아간다', async () => {
  await savePersonalTemplate(dir, draft({ id: 'meeting-notes', name: '회의록 정리(우리 팀)' }))
  expect((await loadTemplates(dir, builtin)).templates.find((t) => t.id === 'meeting-notes')?.name).toBe('회의록 정리(우리 팀)')
  expect(await deletePersonalTemplate(dir, 'meeting-notes')).toEqual({ ok: true })
  expect((await loadTemplates(dir, builtin)).templates.find((t) => t.id === 'meeting-notes')?.name).toBe('회의록 정리')
  expect(await deletePersonalTemplate(dir, 'meeting-notes')).toEqual({ ok: false, reason: 'missing' })
})

it('다른 이름의 개인 템플릿 파일은 건드리지 않는다(Review Focus 4)', async () => {
  await mkdir(join(dir, TEMPLATES_DIR), { recursive: true })
  const other = JSON.stringify({ format: PACK_FORMAT, version: 1, templates: [{ id: 'team-1', name: '팀 상용구', kind: 'snippet', body: '안녕하세요' }] })
  await writeFile(join(dir, TEMPLATES_DIR, 'team.json'), other)
  await savePersonalTemplate(dir, draft(), () => 'my-1')
  expect(await readFile(join(dir, TEMPLATES_DIR, 'team.json'), 'utf8')).toBe(other)
  expect((await loadTemplates(dir, builtin)).templates.map((t) => t.id)).toEqual(['meeting-notes', 'my-1', 'team-1'])
})

it('내 템플릿 파일이 깨져 있으면 저장 전에 사본을 남긴다', async () => {
  await mkdir(join(dir, TEMPLATES_DIR), { recursive: true })
  await writeFile(myPath(), '{broken')
  expect((await readMyTemplates(dir)).errors.length).toBeGreaterThan(0)
  expect((await savePersonalTemplate(dir, draft(), () => 'my-1')).ok).toBe(true)
  expect((await readdir(join(dir, TEMPLATES_DIR))).some((f) => f.startsWith(`${MY_TEMPLATES_FILE}.broken-`))).toBe(true)
})

it('팩 가져오기: 별도 파일(imported-<시각>.json)에 두고, 이미 있는 id는 바뀐 것으로 센다', async () => {
  const pack = JSON.stringify({ format: PACK_FORMAT, version: 1, templates: [{ id: 'meeting-notes', name: '팀 회의록', kind: 'prompt', body: '{{selection}}' }, { id: 'team-x', name: '팀 상용구', kind: 'snippet', body: '안녕' }] })
  const r = await importTemplatePack(dir, pack, ['meeting-notes'], new Date('2026-11-10T13:05:06.789Z'))
  expect(r).toEqual({ ok: true, added: 1, replaced: 1, file: 'imported-2026-11-10T13-05-06-789Z.json' })
  expect((await readdir(join(dir, TEMPLATES_DIR)))).toContain('imported-2026-11-10T13-05-06-789Z.json')
  expect((await loadTemplates(dir, builtin)).templates.find((t) => t.id === 'meeting-notes')?.name).toBe('팀 회의록')
})

it('팩 가져오기: 다른 형식·깨진 JSON·템플릿이 없으면 파일을 만들지 않는다', async () => {
  for (const bad of ['{broken', JSON.stringify({ format: 'x' }), JSON.stringify({ format: PACK_FORMAT, templates: [] })]) expect((await importTemplatePack(dir, bad, [])).ok).toBe(false)
  await expect(readdir(join(dir, TEMPLATES_DIR))).rejects.toThrow()
})

it('내보내기는 내 템플릿 파일의 템플릿만, 다시 가져올 수 있는 팩 형식', async () => {
  await savePersonalTemplate(dir, draft(), () => 'my-1')
  const text = await exportMyTemplatesText(dir)
  expect(JSON.parse(text).templates.map((t: { id: string }) => t.id)).toEqual(['my-1'])
  const other = await mkdtemp(join(tmpdir(), 'sure-mate-tpl-'))
  try {
    expect((await importTemplatePack(other, text, [])).ok).toBe(true)
  } finally {
    await rm(other, { recursive: true, force: true })
  }
})
