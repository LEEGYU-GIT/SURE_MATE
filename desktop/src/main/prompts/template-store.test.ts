import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { loadTemplates } from './template-store'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-templates-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const pack = (templates: unknown[]): unknown => ({ format: 'sure-mate-templates', version: 1, templates })
const builtin = pack([
  { id: 'meeting', name: '회의록 정리', aliases: [], kind: 'prompt', body: '기본 {{selection}}' },
  { id: 'mail', name: '메일', aliases: [], kind: 'prompt', body: '{{selection}}' }
])

it('개인 폴더가 없으면 기본 팩만', async () => {
  const r = await loadTemplates(dir, builtin)
  expect(r.templates.map((t) => t.id)).toEqual(['meeting', 'mail'])
  expect(r.errors).toEqual([])
})

it('개인 팩의 같은 id가 기본을 덮고(자리는 그대로), 새 id는 뒤에 붙는다', async () => {
  await mkdir(join(dir, 'templates'))
  await writeFile(
    join(dir, 'templates', 'mine.json'),
    JSON.stringify(
      pack([
        { id: 'meeting', name: '회의록 정리(우리 팀)', aliases: [], kind: 'prompt', body: '우리 팀 {{selection}}' },
        { id: 'extra', name: '추가', aliases: [], kind: 'prompt', body: '{{selection}}' }
      ])
    )
  )
  const r = await loadTemplates(dir, builtin)
  expect(r.templates.map((t) => [t.id, t.scope])).toEqual([
    ['meeting', 'personal'],
    ['mail', 'builtin'],
    ['extra', 'personal']
  ])
  expect(r.templates[0].body).toBe('우리 팀 {{selection}}')
})

it('깨진 JSON 파일은 건너뛰고 파일 이름을 오류에 남긴다', async () => {
  await mkdir(join(dir, 'templates'))
  await writeFile(join(dir, 'templates', 'broken.json'), '{oops')
  const r = await loadTemplates(dir, builtin)
  expect(r.templates).toHaveLength(2)
  expect(r.errors.some((e) => e.includes('broken.json'))).toBe(true)
})

it('메모장이 붙이는 BOM이 있어도 읽는다', async () => {
  await mkdir(join(dir, 'templates'))
  await writeFile(join(dir, 'templates', 'bom.json'), '﻿' + JSON.stringify(pack([{ id: 'bom', name: 'BOM', aliases: [], kind: 'prompt', body: '{{selection}}' }])))
  const r = await loadTemplates(dir, builtin)
  expect(r.templates.map((t) => t.id)).toContain('bom')
  expect(r.errors).toEqual([])
})
