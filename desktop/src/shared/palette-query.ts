import type { PaletteGroup } from './types'

/** 팔레트 구역 순서와 이름 */
export const PALETTE_GROUPS: { id: PaletteGroup; label: string }[] = [
  { id: 'prompt', label: '프롬프트' },
  { id: 'command', label: '명령' },
  { id: 'workspace', label: '워크스페이스' },
  { id: 'snippet', label: '상용구' },
  { id: 'wiki', label: '위키' }
]

/** 한/영 상태와 상관없이 같은 기호(설계 문서 §6). 전각 기호도 받는다. */
const PREFIXES: Record<string, PaletteGroup> = {
  '/': 'prompt',
  '／': 'prompt',
  '>': 'command',
  '＞': 'command',
  '?': 'wiki',
  '？': 'wiki',
  '!': 'snippet',
  '！': 'snippet',
  '@': 'workspace',
  '＠': 'workspace'
}

/** 검색어 앞의 접두어로 구역을 고르고 나머지를 검색할 글로 돌려준다 */
export function parseQuery(q: string): { scope: PaletteGroup | null; text: string } {
  const trimmed = q.trim()
  const scope = PREFIXES[trimmed.charAt(0)]
  return scope ? { scope, text: trimmed.slice(1).trim() } : { scope: null, text: trimmed }
}
