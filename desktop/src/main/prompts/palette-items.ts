import type { Template } from '../../shared/template/types'
import type { MaskingMode, PaletteItem } from '../../shared/types'
import { maskingCommandItems } from '../masking/masking-commands'

/**
 * 템플릿(프롬프트·상용구)과 명령을 팔레트 항목으로. 프롬프트 id는 `prompt:<템플릿 id>`.
 * 명령 구역은 가명 처리 명령이 맨 앞이고(모드 명령은 지금 모드를 보여 준다), 그 뒤에 나머지 명령.
 */
export function buildPaletteItems(templates: Template[], commands: PaletteItem[], o: { maskingMode: MaskingMode }): PaletteItem[] {
  const fromTemplates = templates.map(
    (t): PaletteItem => ({
      id: `${t.kind}:${t.id}`,
      group: t.kind === 'snippet' ? 'snippet' : 'prompt',
      title: t.name,
      subtitle: t.description,
      keywords: [...t.aliases, ...(t.group ? [t.group] : [])]
    })
  )
  return [...fromTemplates, ...maskingCommandItems(o.maskingMode), ...commands]
}
