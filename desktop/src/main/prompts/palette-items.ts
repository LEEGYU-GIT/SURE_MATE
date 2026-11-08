import type { Template } from '../../shared/template/types'
import type { PaletteItem } from '../../shared/types'

/** 템플릿(프롬프트·상용구)과 명령을 팔레트 항목으로. 프롬프트 id는 `prompt:<템플릿 id>` */
export function buildPaletteItems(templates: Template[], commands: PaletteItem[]): PaletteItem[] {
  const fromTemplates = templates.map(
    (t): PaletteItem => ({
      id: `${t.kind}:${t.id}`,
      group: t.kind === 'snippet' ? 'snippet' : 'prompt',
      title: t.name,
      subtitle: t.description,
      keywords: [...t.aliases, ...(t.group ? [t.group] : [])]
    })
  )
  return [...fromTemplates, ...commands]
}
