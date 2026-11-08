/** 템플릿별 가명 처리 기본값. 'default'면 설정의 기본 모드를 쓴다. */
export type TemplateMasking = 'default' | 'off' | 'restore' | 'remove'

/** 프롬프트·상용구 템플릿(설계 문서 §7) */
export interface Template {
  id: string
  /** "회의록 정리" */
  name: string
  /** ["회의 정리", "회의록", "미팅"] */
  aliases: string[]
  kind: 'prompt' | 'snippet'
  /** 회의·문서·조사·검증·자동화 등 */
  group?: string
  description?: string
  /** 자리표시자가 들어간 본문 */
  body: string
  /** prompt 전용, 이 템플릿의 기본 가명 처리 모드 */
  masking?: TemplateMasking
  /** 기본 AI 대상 id */
  aiTarget?: string
  scope: 'builtin' | 'personal' | 'imported'
}

/** {{terms}}에 넣을 용어 하나 */
export interface TermDef {
  term: string
  definition: string
}

export interface FillContext {
  /** {{selection}}에 넣을 글(선택한 글·클립보드·직접 입력 중 고른 것) */
  input: string
  clipboard: string
  now: Date
  /** 입력 글에 나온 위키 용어 */
  terms(input: string): TermDef[]
  /** 기준 예시 문서. 없으면 null */
  reference(kind: string): string | null
}

export interface FillResult {
  text: string
  /** 고쳐야 할 문제(모르는 자리표시자 등) */
  warnings: string[]
  /** 알아 두면 좋은 안내(기준 예시가 없어 줄을 뺌 등) */
  notes: string[]
  /** text 안에서 {{selection}}으로 넣은 글의 [시작, 끝) 위치. 미리 보기에서 형광펜으로 칠한다 */
  inputRanges: [number, number][]
}
