export type OutcomeResult = 'placed' | 'off' | 'gone' | 'hung' | 'blocked' | 'failed' | 'timeout' | 'missing' | 'elevated'
export interface WindowOutcome {
  ruleId: string
  app: string
  result: OutcomeResult
  diff?: number
  /** blocked(옮겨지지 않음)일 때 그 창이 관리자 권한인지(모르면 null). 알림은 모를 때만 관리자 권한 창으로 알린다 */
  elevated?: boolean | null
}
export interface RestoreReport {
  total: number
  placed: number
  outcomes: WindowOutcome[]
  gathered: boolean
  ms: number
  maxDiff: number
  /** 끝에 포커스가 시작 때 앞 창에 있는지: 앞 창이 그대로였거나(돌려주지 않음) 돌려줬다. 시작 때 앞 창이 없었으면 false */
  restoredFocus: boolean
}
