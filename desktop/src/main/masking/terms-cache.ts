import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { MaskTerm } from '../../shared/masking/dictionary'
import { loadMaskDictionary, MASK_DICTIONARY_FILE } from './dictionary-store'

/**
 * 가명 사전을 파일 수정 시각이 바뀔 때만 다시 읽는다(확인 화면은 미리 보기를 자주 부른다).
 * 사전 오류는 onErrors로 넘긴다(이름이 들어 있을 수 있으니 부르는 쪽은 건수만 기록한다).
 */
export function createTermsCache(
  userDir: string,
  onErrors: (errors: string[]) => void,
  load: (dir: string) => Promise<{ terms: MaskTerm[]; errors: string[] }> = loadMaskDictionary
): () => Promise<MaskTerm[]> {
  let cached: { mtimeMs: number; terms: MaskTerm[] } | null = null
  return async () => {
    let mtimeMs: number
    try {
      mtimeMs = (await stat(join(userDir, MASK_DICTIONARY_FILE))).mtimeMs
    } catch {
      cached = null
      return []
    }
    if (cached && cached.mtimeMs === mtimeMs) return cached.terms
    const r = await load(userDir)
    if (r.errors.length) onErrors(r.errors)
    cached = { mtimeMs, terms: r.terms }
    return r.terms
  }
}
