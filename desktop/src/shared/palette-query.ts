import type { ShownPayload } from './ipc-channels'
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

/**
 * 팔레트를 보일 때 시작할 검색어와 열 용어 상세.
 * 검색 화면은 main이 준 검색어로 시작한다(바의 용어 사전 단추는 '?'). 확인 화면·개발 출력은 빈 검색어.
 * 용어 상세(wikiId)는 위키 카드의 '팔레트에서 열기'가 채운다: 빈 검색어 위에 그 용어 상세를 연다(Esc로 목록).
 */
export function shownView(p: ShownPayload): { query: string; wikiId: string | null } {
  if (p.mode === 'wiki') return { query: '', wikiId: p.id }
  return { query: p.mode === 'search' ? (p.query ?? '') : '', wikiId: null }
}
