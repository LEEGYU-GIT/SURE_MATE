import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MASK_DICTIONARY_FORMAT, parseMaskDictionary, type MaskTerm } from '../../shared/masking/dictionary'

/** `%APPDATA%\Sure-Mate\masking-dictionary.json`(로컬 전용, 설계 문서 §8) */
export const MASK_DICTIONARY_FILE = 'masking-dictionary.json'

/** 처음 열 때 넣어 두는 가상 예시. 실제 고객사 이름은 사용자가 직접 넣는다 */
const EXAMPLE = {
  format: MASK_DICTIONARY_FORMAT,
  version: 1,
  terms: [
    { id: 'example-client-1', category: 'client', canonical: '가상자동차', aliases: ['가상차'] },
    { id: 'example-client-2', category: 'client', canonical: 'XY방산', aliases: [] }
  ]
}

/** 사전을 읽는다. 없으면 빈 사전, 읽지 못하면 빈 사전과 이유 */
export async function loadMaskDictionary(userDir: string): Promise<{ terms: MaskTerm[]; errors: string[] }> {
  let text: string
  try {
    text = await readFile(join(userDir, MASK_DICTIONARY_FILE), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { terms: [], errors: [] }
    return { terms: [], errors: [`가명 사전을 읽지 못함(${(e as NodeJS.ErrnoException).code ?? 'unknown'})`] }
  }
  try {
    return parseMaskDictionary(JSON.parse(text.replace(/^﻿/, '')))
  } catch (e) {
    return { terms: [], errors: [`가명 사전을 읽지 못함(${e instanceof Error ? e.name : 'Error'})`] }
  }
}

/** 사전 파일이 없으면 가상 예시로 만들고 경로를 돌려준다(이미 있으면 그대로) */
export async function ensureMaskDictionaryFile(userDir: string): Promise<string> {
  const path = join(userDir, MASK_DICTIONARY_FILE)
  await mkdir(userDir, { recursive: true })
  try {
    await writeFile(path, JSON.stringify(EXAMPLE, null, 2), { encoding: 'utf8', flag: 'wx' })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
  }
  return path
}
