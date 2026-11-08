/** 가명 처리 분류(설계 문서 §8). 앞 넷은 사전, 뒤 다섯은 패턴으로 찾는다 */
export type MaskCategory = 'client' | 'project' | 'person' | 'system' | 'ip' | 'path' | 'email' | 'phone' | 'url'

export const ENTITY_CATEGORIES = ['client', 'project', 'person', 'system'] as const
export const PATTERN_CATEGORIES = ['ip', 'path', 'email', 'phone', 'url'] as const
export const ALL_CATEGORIES: readonly MaskCategory[] = [...ENTITY_CATEGORIES, ...PATTERN_CATEGORIES]

export type EntityCategory = (typeof ENTITY_CATEGORIES)[number]

/** 확인 화면에 보여 줄 찾은 대상 하나(키마다 하나) */
export interface MaskItem {
  key: string
  category: MaskCategory
  original: string
  /** 바꾼 표시. 끔이거나 이번 실행에서 껐으면 null */
  replacement: string | null
  count: number
  enabled: boolean
}

/** 글에서 찾은 가릴 대상 하나. [start, end)는 원문 위치 */
export interface Detection {
  start: number
  end: number
  category: MaskCategory
  original: string
  /** 같은 대상을 묶는 값. 사전은 `<분류>:<사전 id>`(별칭도 같은 키), 패턴은 `<분류>:<정규화한 원문>` */
  key: string
}
