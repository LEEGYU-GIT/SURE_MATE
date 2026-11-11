import type { BarShape } from '../../shared/bar/bar-settings'
import type { GlossaryEntry } from '../../shared/glossary/types'
import type { Template } from '../../shared/template/types'
import type { MaskingMode, PaletteItem } from '../../shared/types'
import { barCommandItems } from '../bar/bar-commands'
import { petCommandItems } from '../pet/pet-commands'
import { packCommandItems } from '../glossary/pack-commands'
import { maskingCommandItems } from '../masking/masking-commands'
import { settingsCommandItems } from '../settings/settings-commands'

const firstLine = (s: string): string => s.split('\n', 1)[0].trim()

/**
 * 템플릿(프롬프트·상용구), 명령, 용어를 팔레트 항목으로. 프롬프트 id는 `prompt:<템플릿 id>`, 용어는 `wiki:<용어 id>`.
 * 명령 구역은 가명 처리 명령이 맨 앞이고(모드 명령은 지금 모드를 보여 준다), 그 뒤에 용어 팩·바 모양·말랑 메이트·설정 열기 명령, 나머지 명령.
 * 용어는 설명 첫 줄을 부제로, 별칭을 키워드로, 설명 전체를 검색 본문으로 둔다. 태그는 여러 용어가 같이 쓰므로
 * 별칭처럼 치면 태그가 같은 짧은 용어가 맨 위를 가져간다('오탐'의 태그 '정적분석'). 그래서 본문과 같은 마지막 단계에서만 본다.
 */
export function buildPaletteItems(
  templates: Template[],
  commands: PaletteItem[],
  o: { maskingMode: MaskingMode; glossary: GlossaryEntry[]; barShape: BarShape; petVisible: boolean; petSleeping?: boolean }
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
      keywords: [...e.aliases],
      body: e.definition,
      tags: [...e.tags]
    })
  )
  return [...fromTemplates, ...maskingCommandItems(o.maskingMode), ...packCommandItems(), ...barCommandItems(o.barShape), ...petCommandItems({ visible: o.petVisible, sleeping: o.petSleeping ?? false }), ...settingsCommandItems(), ...commands, ...wiki]
}
