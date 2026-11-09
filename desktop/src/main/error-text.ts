import { homedir } from 'node:os'

/** 로그·화면에 남길 오류 문구. 사용자 폴더 경로(사번·이름이 들어갈 수 있음)는 ~로 가리고 길이를 자른다. */
export function errorText(e: unknown, max = 300): string {
  const text = e instanceof Error ? e.message : String(e)
  return text.split(homedir()).join('~').slice(0, max)
}

/**
 * 로그에 남길 오류 코드(EPERM·EBUSY 등). 코드가 없으면 오류 이름만 남기고 글은 남기지 않는다.
 * 사용자 폴더 밖의 경로(공유 폴더의 팩 파일 이름 등)에도 고객사명이 있을 수 있을 때 쓴다.
 */
export function errorCode(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code
  if (typeof code === 'string' && /^[A-Z0-9_]{1,32}$/.test(code)) return code
  return e instanceof Error ? e.name : 'unknown'
}
