import type { PromptRequest, PromptSource } from './ipc-channels'

/** 직접 입력으로 받을 최대 길이 */
export const MAX_INPUT_CHARS = 200000

const SOURCES: readonly PromptSource[] = ['selection', 'clipboard', 'input']

/** renderer에서 온 요청을 검사한다. 틀리면 null */
export function parsePromptRequest(raw: unknown): PromptRequest | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { source, input, target } = raw as Record<string, unknown>
  if (!SOURCES.includes(source as PromptSource) || typeof target !== 'string' || !target) return null
  if (source !== 'input') return { source: source as PromptSource, target }
  if (input !== undefined && (typeof input !== 'string' || input.length > MAX_INPUT_CHARS)) return null
  return { source: 'input', input: (input as string | undefined) ?? '', target }
}
