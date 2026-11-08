import { expect, it } from 'vitest'
import type { Template } from '../../shared/template/types'
import type { PaletteItem } from '../../shared/types'
import type { GlossaryEntry } from '../../shared/glossary/types'
import { buildPaletteItems } from './palette-items'

const t = (over: Partial<Template>): Template => ({
  id: 'x',
  name: 'X',
  aliases: [],
  kind: 'prompt',
  body: '{{selection}}',
  scope: 'builtin',
  ...over
})
const commands: PaletteItem[] = [{ id: 'dev.listWindows', group: 'command', title: '개발: 창 목록' }]

const MASKING_IDS = ['cmd.unmask', 'cmd.mask-selection', 'cmd.masking-mode', 'cmd.open-dictionary']
/** 용어 팩 명령은 가명 처리 명령 다음 */
const PACK_IDS = ['cmd.glossary-export', 'cmd.glossary-import']

it('프롬프트는 템플릿 순서대로 prompt:<id>, 부제는 설명, 키워드는 별칭과 그룹, 명령은 뒤에', () => {
  const items = buildPaletteItems([t({ id: 'b', name: '나', description: '설명', aliases: ['별칭'], group: '회의' }), t({ id: 'a', name: '가' })], commands, {
    maskingMode: 'restore',
    glossary: []
  })
  expect(items.map((i) => i.id)).toEqual(['prompt:b', 'prompt:a', ...MASKING_IDS, ...PACK_IDS, 'dev.listWindows'])
  expect(items[0]).toMatchObject({ group: 'prompt', title: '나', subtitle: '설명', keywords: ['별칭', '회의'] })
})

it('상용구 템플릿은 상용구 구역으로', () => {
  expect(buildPaletteItems([t({ id: 's', kind: 'snippet', name: '결함 리포트' })], [], { maskingMode: 'restore', glossary: [] })[0]).toMatchObject({ id: 'snippet:s', group: 'snippet' })
})

it('가명 처리 명령 4개를 명령 구역 맨 앞에 넣고, 모드 명령은 지금 모드와 누르면 바뀔 모드를 보여 준다', () => {
  const items = buildPaletteItems([], commands, { maskingMode: 'restore', glossary: [] })
  expect(items.map((i) => i.id)).toEqual([...MASKING_IDS, ...PACK_IDS, 'dev.listWindows'])
  expect(items.every((i) => i.group === 'command')).toBe(true)
  expect(items.find((i) => i.id === 'cmd.masking-mode')?.subtitle).toBe('지금: 가명 후 되돌리기 · 누르면 결과에서 빼기')
  // 영문으로 쳐도 찾는다(스모크 시험은 영문만 칠 수 있다)
  expect(items.find((i) => i.id === 'cmd.unmask')?.keywords).toContain('unmask')
})

it('용어는 위키 구역에: 제목은 용어, 부제는 설명 첫 줄, 키워드는 별칭과 태그, 본문은 설명', () => {
  const glossary: GlossaryEntry[] = [
    {
      id: 'mcdc',
      term: 'MC/DC',
      aliases: ['MCDC'],
      definition: '조건마다 결정을 독립적으로 바꾸는지 보는 커버리지\n둘째 줄',
      links: [],
      tags: ['커버리지'],
      source: 'builtin',
      updatedAt: '2026-11-09T00:00:00.000Z',
      version: 1
    }
  ]
  const items = buildPaletteItems([], [], { maskingMode: 'restore', glossary })
  expect(items.find((i) => i.id === 'wiki:mcdc')).toEqual({
    id: 'wiki:mcdc',
    group: 'wiki',
    title: 'MC/DC',
    subtitle: '조건마다 결정을 독립적으로 바꾸는지 보는 커버리지',
    keywords: ['MCDC', '커버리지'],
    body: '조건마다 결정을 독립적으로 바꾸는지 보는 커버리지\n둘째 줄'
  })
})
