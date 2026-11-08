import type { GlossaryEntry } from '../../shared/glossary/types'
import type { Template } from '../../shared/template/types'
import type { MaskingMode, PaletteItem } from '../../shared/types'
import { packCommandItems } from '../glossary/pack-commands'
import { maskingCommandItems } from '../masking/masking-commands'

const firstLine = (s: string): string => s.split('\n', 1)[0].trim()

/**
 * 템플릿(프롬프트·상용구), 명령, 용어를 팔레트 항목으로. 프롬프트 id는 `prompt:<템플릿 id>`, 용어는 `wiki:<용어 id>`.
 * 명령 구역은 가명 처리 명령이 맨 앞이고(모드 명령은 지금 모드를 보여 준다), 그 뒤에 나머지 명령.
 * 용어는 설명 첫 줄을 부제로, 별칭·태그를 키워드로, 설명 전체를 검색 본문으로 둔다.
 */
export function buildPaletteItems(
  templates: Template[],
  commands: PaletteItem[],
  o: { maskingMode: MaskingMode; glossary: GlossaryEntry[] }
): PaletteItem[] {
  const fromTemplates = templates.map(
    (t): PaletteItem => ({
      id: `${t.kind}:${t.id}`,
      group: t.kind === 'snippet' ? 'snippet' : 'prompt',
      title: t.name,
      subtitle: t.description,
      keywords: [...t.aliases, ...(t.group ? [t.group] : [])]
    })
  )
  const wiki = o.glossary.map(
    (e): PaletteItem => ({
      id: `wiki:${e.id}`,
      group: 'wiki',
      title: e.term,
      subtitle: firstLine(e.definition),
      keywords: [...e.aliases, ...e.tags],
      body: e.definition
    })
  )
  return [...fromTemplates, ...maskingCommandItems(o.maskingMode), ...packCommandItems(), ...commands, ...wiki]
}
