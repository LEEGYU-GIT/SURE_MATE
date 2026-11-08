import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { MaskTerm } from '../../shared/masking/dictionary'
import { loadMaskDictionary, MASK_DICTIONARY_FILE } from './dictionary-store'

/** 가명 사전의 지금 상태. errors는 건너뛴 항목·읽지 못한 파일의 건수 */
export interface DictionaryState {
  terms: MaskTerm[]
  errors: number
}

/**
 * 가명 사전을 파일 수정 시각이 바뀔 때만 다시 읽는다(확인 화면은 미리 보기를 자주 부른다).
 * 사전 오류는 다시 읽을 때마다 onErrors로 한 번 넘긴다(이름이 들어 있을 수 있으니 부르는 쪽은 로그에 건수만 남긴다).
 */
export function createTermsCache(
  userDir: string,
  onErrors: (errors: string[]) => void,
  load: (dir: string) => Promise<{ terms: MaskTerm[]; errors: string[] }> = loadMaskDictionary
): () => Promise<DictionaryState> {
  let cached: { mtimeMs: number; state: DictionaryState } | null = null
  return async () => {
    let mtimeMs: number
    try {
      mtimeMs = (await stat(join(userDir, MASK_DICTIONARY_FILE))).mtimeMs
    } catch {
      cached = null
      return { terms: [], errors: 0 }
    }
    if (cached && cached.mtimeMs === mtimeMs) return cached.state
    const r = await load(userDir)
    if (r.errors.length) onErrors(r.errors)
    cached = { mtimeMs, state: { terms: r.terms, errors: r.errors.length } }
    return cached.state
  }
}
