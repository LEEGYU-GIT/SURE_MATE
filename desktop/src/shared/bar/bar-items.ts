import { maskingModeLabel } from '../labels'
import type { Template } from '../template/types'
import type { MaskingMode } from '../types'
import type { BarEdge } from './bar-settings'

export type BarItem =
  | { kind: 'logo' | 'workspace' | 'glossary' | 'settings'; id: 'logo' | 'workspace' | 'glossary' | 'settings'; label: string }
  | { kind: 'masking'; id: 'masking'; label: string; mode: MaskingMode }
  | { kind: 'prompt'; id: `prompt:${string}`; label: string; templateId: string; glyph: string }
  | { kind: 'pet'; id: 'pet'; label: string; visible: boolean }
  | { kind: 'separator'; id: `sep:${number}` }

export interface BarViewState {
  shape: 'edge' | 'capsule'
  edge: BarEdge
  items: BarItem[]
  opacity: number
  collapsed: boolean
  busyItem: string | null
}

export interface BuildBarItemsInput {
  pinned: string[]
  templates: Pick<Template, 'id' | 'name' | 'kind'>[]
  maskingMode: MaskingMode
  petVisible: boolean
  paletteHotkey: string | null
}

/** 순서: 로고, 가명 처리 | 고정 프롬프트 | 워크스페이스, 용어 사전 | 펫, 설정. 빈 그룹의 구분선은 생략한다. */
export function buildBarItems(i: BuildBarItemsInput): BarItem[] {
  const prompts: BarItem[] = []
  for (const id of i.pinned) {
    const t = i.templates.find((x) => x.id === id && x.kind === 'prompt')
    if (!t) continue
    prompts.push({ kind: 'prompt', id: `prompt:${t.id}`, label: t.name, templateId: t.id, glyph: Array.from(t.name)[0] ?? '?' })
  }
  const groups: BarItem[][] = [
    [
      { kind: 'logo', id: 'logo', label: i.paletteHotkey ? `팔레트 열기 · ${i.paletteHotkey}` : '팔레트 열기' },
      { kind: 'masking', id: 'masking', label: `가명 처리: ${maskingModeLabel(i.maskingMode)}`, mode: i.maskingMode }
    ],
    prompts,
    [
      { kind: 'workspace', id: 'workspace', label: '워크스페이스' },
      { kind: 'glossary', id: 'glossary', label: '용어 사전에서 찾기' }
    ],
    [
      { kind: 'pet', id: 'pet', label: i.petVisible ? '말랑 메이트 숨기기' : '말랑 메이트 보이기', visible: i.petVisible },
      { kind: 'settings', id: 'settings', label: '설정' }
    ]
  ]
  const out: BarItem[] = []
  for (const g of groups) {
    if (g.length === 0) continue
    if (out.length > 0) out.push({ kind: 'separator', id: `sep:${out.length}` })
    out.push(...g)
  }
  return out
}
