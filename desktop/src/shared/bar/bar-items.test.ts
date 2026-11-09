import { describe, expect, it } from 'vitest'
import builtin from '../../../resources/prompts.json'
import { buildBarItems, type BarItem } from './bar-items'

const templates = builtin.templates as { id: string; name: string; kind: 'prompt' | 'snippet' }[]
const base = {
  pinned: ['meeting-notes', 'req-to-testcase', 'static-analysis'],
  templates,
  maskingMode: 'restore' as const,
  petVisible: true,
  paletteHotkey: 'Alt+`' as string | null
}
const kinds = (items: BarItem[]): string[] => items.map((i) => i.kind)

describe('buildBarItems', () => {
  it('기본 고정 3개의 순서와 id', () => {
    const items = buildBarItems(base)
    expect(kinds(items)).toEqual(['logo', 'masking', 'separator', 'prompt', 'prompt', 'prompt', 'separator', 'workspace', 'glossary', 'separator', 'pet', 'settings'])
    expect(items.filter((i) => i.kind === 'prompt').map((i) => i.id)).toEqual(['prompt:meeting-notes', 'prompt:req-to-testcase', 'prompt:static-analysis'])
    const first = items.find((i) => i.kind === 'prompt')
    // 이름표는 이름 뒤에 누르면 하는 일을 붙인다(이름표에서는 흐린 보조 글로 보인다)
    expect(first).toMatchObject({ label: '회의록 정리 · 선택한 글로 실행', glyph: '회', templateId: 'meeting-notes' })
  })

  it('없는 id와 상용구 id는 제외', () => {
    const items = buildBarItems({ ...base, pinned: ['nope', 'defect-report', 'polish'] })
    expect(items.filter((i) => i.kind === 'prompt').map((i) => i.id)).toEqual(['prompt:polish'])
  })

  it('고정이 없으면 구분선이 연속되거나 양 끝에 오지 않는다', () => {
    const items = buildBarItems({ ...base, pinned: [] })
    expect(kinds(items)).toEqual(['logo', 'masking', 'separator', 'workspace', 'glossary', 'separator', 'pet', 'settings'])
  })

  it('모든 id가 서로 다르다', () => {
    const ids = buildBarItems(base).map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('이름표 문구', () => {
    const label = (i: Parameters<typeof buildBarItems>[0], kind: string): string | undefined =>
      (buildBarItems(i).find((x) => x.kind === kind) as { label?: string } | undefined)?.label
    expect(label({ ...base, maskingMode: 'off' }, 'masking')).toBe('가명 처리: 끔')
    expect(label(base, 'logo')).toBe('팔레트 열기 · Alt+`')
    expect(label({ ...base, paletteHotkey: null }, 'logo')).toBe('팔레트 열기')
    expect(label({ ...base, petVisible: false }, 'pet')).toBe('말랑 메이트 보이기')
    expect(label(base, 'pet')).toBe('말랑 메이트 숨기기')
    expect(label(base, 'workspace')).toBe('워크스페이스')
    expect(label(base, 'glossary')).toBe('용어 사전에서 찾기')
    expect(label(base, 'settings')).toBe('설정')
  })
})
