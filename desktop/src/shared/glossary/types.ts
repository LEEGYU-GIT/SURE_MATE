/** 용어 사전 항목(설계 문서 §9) */
export interface GlossaryEntry {
  /** 기본 팩은 읽기 쉬운 고정 id, 사용자가 새로 만든 항목은 uuid v4 */
  id: string
  /** 1~60자 */
  term: string
  aliases: string[]
  /** 1,000자 이하, 줄바꿈 허용 */
  definition: string
  /** 500자 이하 */
  example?: string
  /** 5개 이하, http/https만 */
  links: { title: string; url: string }[]
  /** 5개 이하 */
  tags: string[]
  /** 닉네임(선택) */
  author?: string
  source: 'builtin' | 'user' | 'imported'
  updatedAt: string
  version: number
}

/** 추가·수정 화면이 보내는 내용(id·출처·시각·판은 main이 정한다) */
export type WikiDraft = Pick<GlossaryEntry, 'term' | 'aliases' | 'definition' | 'links' | 'tags'> & { example?: string }

export type WikiSaveResult =
  | { ok: true; entry: GlossaryEntry }
  | { ok: false; duplicate?: Pick<GlossaryEntry, 'id' | 'term' | 'definition'>; errors?: string[] }

/** 설계 문서 §9의 제한. 별칭 수·길이와 닉네임 길이는 설계에 없어 넉넉히 정했다 */
export const GLOSSARY_LIMITS = {
  term: 60,
  definition: 1000,
  example: 500,
  links: 5,
  tags: 5,
  tag: 30,
  aliases: 20,
  alias: 60,
  linkTitle: 100,
  url: 2000,
  author: 40
} as const
