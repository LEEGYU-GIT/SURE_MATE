import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 종류 이름: 글자·숫자로 시작하고 글자·숫자·공백·_·-만. 경로 문자(. / \ :)는 받지 않는다. */
const KIND = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,39}$/u

/**
 * 기준 예시 문서 `<userData>/references/<종류>.txt`를 읽는다(설계 문서 §7). 없으면 null.
 * 종류 이름은 사용자 템플릿에서 오므로, 폴더 밖을 가리키는 이름은 파일을 열지 않고 null.
 */
export function readReference(userData: string, kind: string): string | null {
  if (!KIND.test(kind)) return null
  try {
    return readFileSync(join(userData, 'references', `${kind}.txt`), 'utf8').replace(/^﻿/, '')
  } catch {
    return null
  }
}
