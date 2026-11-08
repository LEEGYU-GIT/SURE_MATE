import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { readReference } from './references'

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
