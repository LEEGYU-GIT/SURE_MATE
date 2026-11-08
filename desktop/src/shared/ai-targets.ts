/** 프롬프트를 붙여넣을 AI(설계 문서 §7). url이 없으면 복사만 한다. */
export interface AiTarget {
  id: string
  name: string
  url?: string
}

export const BUILTIN_AI_TARGETS: readonly AiTarget[] = [
  { id: 'claude', name: 'Claude', url: 'https://claude.ai' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com' },
  { id: 'copy', name: '복사만' }
]

export const FALLBACK_AI_TARGET = 'claude'

/** 기본 브라우저로 열어도 되는 주소인지(http/https만) */
export function isOpenableUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 설정 파일의 사용자 AI 대상 중 올바른 것만(id·이름·http/https 주소) */
export function sanitizeAiTargets(raw: unknown): AiTarget[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((v): AiTarget[] => {
    if (!isObj(v)) return []
    const { id, name, url } = v
    if (typeof id !== 'string' || !id.trim() || typeof name !== 'string' || !name.trim()) return []
    if (typeof url !== 'string' || !isOpenableUrl(url)) return []
    return [{ id: id.trim(), name: name.trim(), url }]
  })
}

/** 기본 대상 뒤에 사용자 대상. 기본과 id가 겹치면 기본이 이긴다. */
export function allAiTargets(custom: AiTarget[]): AiTarget[] {
  const builtinIds = new Set(BUILTIN_AI_TARGETS.map((t) => t.id))
  return [...BUILTIN_AI_TARGETS, ...custom.filter((t) => !builtinIds.has(t.id))]
}

/** 이번 실행에서 고른 것 > 템플릿 기본값 > 설정 기본값 > Claude 순으로, 목록에 있는 첫 대상 */
export function pickAiTarget(o: { override?: string; template?: string; defaultId: string; targets: AiTarget[] }): AiTarget {
  for (const id of [o.override, o.template, o.defaultId, FALLBACK_AI_TARGET]) {
    const found = id ? o.targets.find((t) => t.id === id) : undefined
    if (found) return found
  }
  return BUILTIN_AI_TARGETS[0]
}
