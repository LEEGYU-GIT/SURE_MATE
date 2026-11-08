import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Template } from '../../shared/template/types'
import { loadTemplates, TEMPLATES_DIR } from './template-store'

export interface TemplateCache {
  /** 지금 템플릿 목록. 개인 템플릿 파일이 바뀌었으면 다시 읽는다 */
  get(): Promise<Template[]>
}

/** 개인 템플릿 폴더의 .json 파일 이름·수정 시각·크기. 폴더가 없으면 빈 문자열 */
async function signature(dir: string): Promise<string> {
  let files: string[]
  try {
    files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.json')).sort()
  } catch {
    return ''
  }
  const parts = await Promise.all(
    files.map(async (f) => {
      try {
        const s = await stat(join(dir, f))
        return `${f}:${s.mtimeMs}:${s.size}`
      } catch {
        return `${f}:?`
      }
    })
  )
  return parts.join('|')
}

/**
 * 템플릿을 파일이 바뀌었을 때만 다시 읽는다(설계 문서 §7: 템플릿 파일을 고치면 앱을 다시 켜지 않아도 반영).
 * 팔레트를 열 때마다 부르므로 바뀌지 않았으면 폴더 목록과 수정 시각만 본다.
 * 읽지 못한 파일은 다시 읽을 때마다 onErrors로 한 번 알린다(같은 상태로 다시 열면 알리지 않는다).
 */
export function createTemplateCache(
  userDir: string,
  builtin: unknown,
  onErrors: (errors: string[]) => void,
  load: (dir: string, builtin: unknown) => Promise<{ templates: Template[]; errors: string[] }> = loadTemplates
): TemplateCache {
  let cached: { sig: string; templates: Template[] } | null = null
  return {
    async get() {
      const sig = await signature(join(userDir, TEMPLATES_DIR))
      if (cached && cached.sig === sig) return cached.templates
      const r = await load(userDir, builtin)
      if (r.errors.length) onErrors(r.errors)
      cached = { sig, templates: r.templates }
      return r.templates
    }
  }
}
