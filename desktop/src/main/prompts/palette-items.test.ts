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

const MASKING_IDS = ['cmd.unmask', 'cmd.mask-selection', 'cmd.masking-mode', 'cmd.open-dictionary', 'cmd.open-intents']
/** 말하듯 입력 단어 목록 열기는 가명 사전 열기 다음(MASKING_IDS 끝), 용어 팩 명령은 그 다음 */
const PACK_IDS = ['cmd.glossary-export', 'cmd.glossary-import']
/** 바 모양 명령은 용어 팩 명령 다음 */
const BAR_IDS = ['cmd.bar-shape']
/** 말랑 메이트 명령은 바 모양 명령 바로 뒤 */
const PET_IDS = ['cmd.pet-visible', 'cmd.pet-control', 'cmd.pet-sleep']
/** 설정 열기 명령은 바 모양 명령 다음, 그 뒤에 30초 따라 해 보기 */
const SETTINGS_IDS = ['cmd.open-settings', 'cmd.open-try']

it('프롬프트는 템플릿 순서대로 prompt:<id>, 부제는 설명, 키워드는 별칭과 그룹, 명령은 뒤에', () => {
  const items = buildPaletteItems([t({ id: 'b', name: '나', description: '설명', aliases: ['별칭'], group: '회의' }), t({ id: 'a', name: '가' })], commands, {
    maskingMode: 'restore',
    glossary: [],
    barShape: 'edge',
    petVisible: true
  })
  expect(items.map((i) => i.id)).toEqual(['prompt:b', 'prompt:a', ...MASKING_IDS, ...PACK_IDS, ...BAR_IDS, ...PET_IDS, ...SETTINGS_IDS, 'dev.listWindows'])
  expect(items[0]).toMatchObject({ group: 'prompt', title: '나', subtitle: '설명', keywords: ['별칭', '회의'] })
})

it('상용구 템플릿은 상용구 구역으로', () => {
  expect(buildPaletteItems([t({ id: 's', kind: 'snippet', name: '결함 리포트' })], [], { maskingMode: 'restore', glossary: [], barShape: 'edge', petVisible: true })[0]).toMatchObject({ id: 'snippet:s', group: 'snippet' })
})

it('가명 처리 명령 4개를 명령 구역 맨 앞에 넣고, 모드 명령은 지금 모드와 누르면 바뀔 모드를 보여 준다', () => {
  const items = buildPaletteItems([], commands, { maskingMode: 'restore', glossary: [], barShape: 'edge', petVisible: true })
  expect(items.map((i) => i.id)).toEqual([...MASKING_IDS, ...PACK_IDS, ...BAR_IDS, ...PET_IDS, ...SETTINGS_IDS, 'dev.listWindows'])
  expect(items.every((i) => i.group === 'command')).toBe(true)
  expect(items.find((i) => i.id === 'cmd.masking-mode')?.subtitle).toBe('지금: 바꾸고 되돌리기 · 누르면 바꾸기만')
  // 영문으로 쳐도 찾는다(스모크 시험은 영문만 칠 수 있다)
  expect(items.find((i) => i.id === 'cmd.unmask')?.keywords).toContain('unmask')
})

it('용어는 위키 구역에: 제목은 용어, 부제는 설명 첫 줄, 키워드는 별칭만, 본문은 설명, 태그는 따로', () => {
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
  const items = buildPaletteItems([], [], { maskingMode: 'restore', glossary, barShape: 'edge', petVisible: true })
  expect(items.find((i) => i.id === 'wiki:mcdc')).toEqual({
    id: 'wiki:mcdc',
    group: 'wiki',
    title: 'MC/DC',
    subtitle: '조건마다 결정을 독립적으로 바꾸는지 보는 커버리지',
    keywords: ['MCDC'],
    body: '조건마다 결정을 독립적으로 바꾸는지 보는 커버리지\n둘째 줄',
    tags: ['커버리지']
  })
})

it('워크스페이스 항목(저장 명령 포함)은 명령 다음, 위키 앞에', () => {
  const glossary: GlossaryEntry[] = [
    { id: 'mcdc', term: 'MC/DC', aliases: [], definition: '커버리지', links: [], tags: [], source: 'builtin', updatedAt: '2026-11-09T00:00:00.000Z', version: 1 }
  ]
  const workspaces: PaletteItem[] = [
    { id: 'cmd.workspace-save', group: 'workspace', title: '지금 배치 저장' },
    { id: 'workspace:ws-qa', group: 'workspace', title: 'QA 모드', subtitle: '창 3개', keywords: ['qa'] }
  ]
  const items = buildPaletteItems([t({ id: 'a', name: '가' })], commands, { maskingMode: 'restore', glossary, barShape: 'edge', petVisible: true, workspaces })
  expect(items.map((i) => i.id)).toEqual([
    'prompt:a',
    ...MASKING_IDS,
    ...PACK_IDS,
    ...BAR_IDS,
    ...PET_IDS,
    ...SETTINGS_IDS,
    'dev.listWindows',
    'cmd.workspace-save',
    'workspace:ws-qa',
    'wiki:mcdc'
  ])
  expect(items.find((i) => i.id === 'workspace:ws-qa')).toEqual(workspaces[1])
})

it('(M4) 말랑 메이트가 졸고 있으면 재우기 대신 깨우기 명령', () => {
  const items = buildPaletteItems([], [], { maskingMode: 'restore', glossary: [], barShape: 'edge', petVisible: true, petSleeping: true })
  expect(items.filter((i) => i.id.startsWith('cmd.pet-')).map((i) => i.id)).toEqual(['cmd.pet-visible', 'cmd.pet-control', 'cmd.pet-wake'])
})

it('바 모양 명령이 명령 구역에 있고 부제가 지금 모양을 보여 준다', () => {
  const items = buildPaletteItems([], [], { maskingMode: 'restore', glossary: [], barShape: 'off', petVisible: true })
  expect(items.find((i) => i.id === 'cmd.bar-shape')).toMatchObject({ group: 'command', subtitle: '지금: 끔 · 누르면 가장자리 띠' })
})
