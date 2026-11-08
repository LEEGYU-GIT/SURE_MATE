import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseTemplatePack } from '../../shared/template/pack'
import type { Template } from '../../shared/template/types'

/**
 * 기본 팩과 개인 템플릿(`<userDir>/templates/*.json`)을 불러온다.
 * 같은 id면 개인 것이 이기되 목록 자리는 기본 팩 순서를 따른다. 읽지 못한 파일은 건너뛰고 errors에 남긴다.
 */
export async function loadTemplates(userDir: string, builtin: unknown): Promise<{ templates: Template[]; errors: string[] }> {
  const base = parseTemplatePack(builtin, 'builtin')
  const errors = base.errors.map((e) => `기본 팩: ${e}`)
  const byId = new Map<string, Template>()
  for (const t of base.templates) byId.set(t.id, t)

  const dir = join(userDir, 'templates')
  let files: string[] = []
  try {
    files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.json')).sort()
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') errors.push(`개인 템플릿 폴더를 읽지 못함: ${(e as NodeJS.ErrnoException).code ?? 'unknown'}`)
  }

  for (const file of files) {
    try {
      // 메모장 등이 붙이는 UTF-8 BOM은 JSON.parse가 거부하므로 뗀다
      const text = (await readFile(join(dir, file), 'utf8')).replace(/^﻿/, '')
      const pack = parseTemplatePack(JSON.parse(text), 'personal')
      errors.push(...pack.errors.map((e) => `${file}: ${e}`))
      for (const t of pack.templates) byId.set(t.id, t)
    } catch (e) {
      errors.push(`${file}: 읽지 못함(${e instanceof Error ? e.name : 'Error'})`)
    }
  }
  return { templates: [...byId.values()], errors }
}
