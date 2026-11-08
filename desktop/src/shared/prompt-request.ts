import type { PromptRequest, PromptSource } from './ipc-channels'
import type { MaskingMode } from './types'

/** 직접 입력으로 받을 최대 길이 */
export const MAX_INPUT_CHARS = 200000
const MAX_DISABLED_KEYS = 200

const SOURCES: readonly PromptSource[] = ['selection', 'clipboard', 'input']
const MODES: readonly MaskingMode[] = ['off', 'restore', 'remove']

/** renderer에서 온 요청을 검사한다. 틀리면 null */
export function parsePromptRequest(raw: unknown): PromptRequest | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { source, input, target, masking, disabledKeys } = raw as Record<string, unknown>
  if (!SOURCES.includes(source as PromptSource) || typeof target !== 'string' || !target) return null
  if (masking !== undefined && !MODES.includes(masking as MaskingMode)) return null
  if (
    disabledKeys !== undefined &&
    (!Array.isArray(disabledKeys) || disabledKeys.length > MAX_DISABLED_KEYS || !disabledKeys.every((k) => typeof k === 'string' && k.length <= 200))
  ) {
    return null
  }
  const extra = {
    ...(masking !== undefined ? { masking: masking as MaskingMode } : {}),
    ...(disabledKeys !== undefined ? { disabledKeys: disabledKeys as string[] } : {})
  }
  if (source !== 'input') return { source: source as PromptSource, target, ...extra }
  if (input !== undefined && (typeof input !== 'string' || input.length > MAX_INPUT_CHARS)) return null
  return { source: 'input', input: (input as string | undefined) ?? '', target, ...extra }
}
