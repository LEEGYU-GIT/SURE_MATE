import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { Template } from '../../shared/template/types'
import { deleteReference, listReferenceKinds, readReference, REFERENCE_LIMITS, saveReference } from './references'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-refs-'))
  await mkdir(join(dir, 'references'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

it('references/<종류>.txt를 읽고 BOM을 뗀다', async () => {
  await writeFile(join(dir, 'references', '회의록.txt'), '\uFEFF잘 쓴 회의록')
  expect(readReference(dir, '회의록')).toBe('잘 쓴 회의록')
})

it('없으면 null', () => {
  expect(readReference(dir, '주간보고')).toBeNull()
})

it('종류 이름에 경로 문자가 있으면 읽지 않는다', async () => {
  await writeFile(join(dir, 'secret.txt'), '비밀')
  for (const kind of ['../secret', 'a/b', 'a\\b', '', 'C:\\x', '.']) expect(readReference(dir, kind), kind).toBeNull()
})

const tpl = (id: string, name: string, body: string): Template => ({ id, name, aliases: [], kind: 'prompt', body, scope: 'builtin' })

it('목록: 템플릿이 쓰는 종류(사용처와 함께)와 파일만 있는 종류, 없는 파일은 길이 null', async () => {
  await writeFile(join(dir, 'references', '회의록.txt'), '잘 쓴 회의록')
  await writeFile(join(dir, 'references', '주간보고.txt'), '보고서 예시')
  const list = listReferenceKinds([tpl('meeting-notes', '회의록 정리', '{{reference:회의록}}\n{{selection}}'), tpl('test', '시험 항목', '{{ reference:시험 항목 }} {{selection}}')], dir)
  expect(list).toEqual([
    { kind: '시험 항목', length: null, usedBy: ['시험 항목'] },
    { kind: '주간보고', length: 6, usedBy: [] },
    { kind: '회의록', length: 7, usedBy: ['회의록 정리'] }
  ])
})

it('저장: 종류 이름에 경로 문자가 있으면 거절, 너무 길면 거절, 4,000자 넘으면 경고만', async () => {
  for (const bad of ['../x', 'a/b', 'a\\b', 'c:x', '.hidden']) expect((await saveReference(dir, bad, '글')).ok).toBe(false)
  expect((await saveReference(dir, '회의록', 'x'.repeat(REFERENCE_LIMITS.max + 1))).ok).toBe(false)
  expect(await saveReference(dir, '회의록', 'x'.repeat(REFERENCE_LIMITS.warn + 1))).toMatchObject({ ok: true, warning: expect.stringContaining('4,000') })
  expect(await saveReference(dir, '회의록', '잘 쓴 회의록')).toEqual({ ok: true })
  expect(await readFile(join(dir, 'references', '회의록.txt'), 'utf8')).toBe('잘 쓴 회의록')
  expect(await readdir(dir)).toEqual(['references'])
})

it('지우기: 파일을 지우고, 없으면 missing', async () => {
  await saveReference(dir, '회의록', '글')
  expect(await deleteReference(dir, '회의록')).toEqual({ ok: true })
  expect(readReference(dir, '회의록')).toBeNull()
  expect(await deleteReference(dir, '회의록')).toEqual({ ok: false, reason: 'missing' })
  expect(await deleteReference(dir, '../settings')).toEqual({ ok: false, reason: 'bad-kind' })
})
