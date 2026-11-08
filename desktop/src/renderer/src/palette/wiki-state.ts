import type { GlossaryEntry } from '../../../shared/glossary/types'
import type { KeyInfo } from './confirm-state'

export type WikiAction = { type: 'copy' } | { type: 'back' } | { type: 'edit' } | { type: 'link'; index: number }

const LINK_KEYS: Record<string, number> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
  Numpad1: 0,
  Numpad2: 1,
  Numpad3: 2,
  Numpad4: 3,
  Numpad5: 4
}

/** 위키 상세 화면의 키. 한글 조합 중이면 아무것도 하지 않고, 자동 반복된 Enter로는 복사하지 않는다 */
export function wikiKeyToAction(k: Omit<KeyInfo, 'shiftKey' | 'altKey'> & Partial<Pick<KeyInfo, 'shiftKey' | 'altKey'>>, entry: Pick<GlossaryEntry, 'links'>): WikiAction | null {
  if (k.isComposing) return null
  if (k.code === 'Escape' || k.key === 'Escape') return { type: 'back' }
  if (k.code === 'Enter' || k.code === 'NumpadEnter') return k.repeat ? null : { type: 'copy' }
  if (k.code === 'KeyE' && !k.ctrlKey) return { type: 'edit' }
  const index = LINK_KEYS[k.code]
  if (index !== undefined && index < entry.links.length) return { type: 'link', index }
  return null
}

const SOURCE_LABELS: Record<GlossaryEntry['source'], string> = { builtin: '기본 용어', user: '내 용어', imported: '가져온 용어' }

export const sourceLabel = (source: GlossaryEntry['source']): string => SOURCE_LABELS[source]
