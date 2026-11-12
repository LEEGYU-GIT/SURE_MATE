export type OutcomeResult = 'placed' | 'off' | 'gone' | 'hung' | 'blocked' | 'failed' | 'timeout' | 'missing' | 'elevated'
export interface WindowOutcome {
  ruleId: string
  app: string
  result: OutcomeResult
  diff?: number
  /** blocked(옮겨지지 않음)일 때 그 창이 관리자 권한인지(모르면 null). 알림은 모를 때만 관리자 권한 창으로 알린다 */
  elevated?: boolean | null
}
/** 불러오기 끝에 포커스를 준 창. start: 시작 때 앞 창, workspace: 이번에 올린 맨 위 워크스페이스 창 */
export type FocusTarget = 'start' | 'workspace'
export interface RestoreReport {
  total: number
  placed: number
  outcomes: WindowOutcome[]
  gathered: boolean
  ms: number
  maxDiff: number
  /** 끝에 고른 창(focusTarget)이 맨 앞이고 포커스가 있는지: 이미 앞 창이라 올리기만 했거나 포커스를 줬다. 고른 창이 없으면 false */
  restoredFocus: boolean
  /**
   * 끝에 포커스를 준 창(2026-11-12 판정). start는 시작 때 앞 창(이번에 올린 워크스페이스 창·Sure-Mate 자신의 창이거나, 올린 창이 없을 때),
   * workspace는 그 밖일 때의 맨 위 복원 창, null은 줄 창이 없었다. 실행기는 늘 채운다(실행기 밖에서 만든 결과에는 없을 수 있다)
   */
  focusTarget?: FocusTarget | null
}
