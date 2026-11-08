import { expect, it } from 'vitest'
import type { Template } from '../../shared/template/types'
import type { PaletteItem } from '../../shared/types'
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

it('프롬프트는 템플릿 순서대로 prompt:<id>, 부제는 설명, 키워드는 별칭과 그룹, 명령은 뒤에', () => {
  const items = buildPaletteItems([t({ id: 'b', name: '나', description: '설명', aliases: ['별칭'], group: '회의' }), t({ id: 'a', name: '가' })], commands)
  expect(items.map((i) => i.id)).toEqual(['prompt:b', 'prompt:a', 'dev.listWindows'])
  expect(items[0]).toMatchObject({ group: 'prompt', title: '나', subtitle: '설명', keywords: ['별칭', '회의'] })
})

it('상용구 템플릿은 상용구 구역으로', () => {
  expect(buildPaletteItems([t({ id: 's', kind: 'snippet', name: '결함 리포트' })], [])[0]).toMatchObject({ id: 'snippet:s', group: 'snippet' })
})
