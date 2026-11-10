export type OutcomeResult = 'placed' | 'off' | 'gone' | 'hung' | 'blocked' | 'failed' | 'timeout' | 'missing' | 'elevated'
export interface WindowOutcome {
  ruleId: string
  app: string
  result: OutcomeResult
  diff?: number
}
export interface RestoreReport {
  total: number
  placed: number
  outcomes: WindowOutcome[]
  gathered: boolean
  ms: number
  maxDiff: number
  restoredFocus: boolean
}
