import { homedir } from 'node:os'

/** 로그·화면에 남길 오류 문구. 사용자 폴더 경로(사번·이름이 들어갈 수 있음)는 ~로 가리고 길이를 자른다. */
export function errorText(e: unknown, max = 300): string {
  const text = e instanceof Error ? e.message : String(e)
  return text.split(homedir()).join('~').slice(0, max)
}
