import { describe, expect, it } from 'vitest'
import { restoreSummary, saveSummary, WORKSPACE_NOTES } from './messages'
import type { RestoreReport, WindowOutcome } from './restore-result'

const o = (app: string, result: WindowOutcome['result']): WindowOutcome => ({ ruleId: app, app, result })
const report = (outcomes: WindowOutcome[], total: number, extra: Partial<RestoreReport> = {}): RestoreReport => ({
  total,
  placed: outcomes.filter((x) => x.result === 'placed').length,
  outcomes,
  gathered: false,
  ms: 100,
  maxDiff: 0,
  restoredFocus: true,
  ...extra
})

describe('restoreSummary', () => {
  it('모두 배치', () => {
    expect(restoreSummary('QA 모드', report([o('A', 'placed'), o('B', 'placed'), o('C', 'placed')], 3))).toBe('QA 모드 · 창 3개 모두 배치했어요')
  })
  it('일부 못 찾음', () => {
    const r = report([o('A', 'placed'), o('B', 'placed'), o('C', 'placed'), o('D', 'placed'), o('Excel', 'missing')], 5)
    expect(restoreSummary('QA 모드', r)).toBe('QA 모드 · 창 5개 중 4개 배치 · Excel 못 찾음')
  })
  it('모으기 앞에 붙는다', () => {
    expect(restoreSummary('QA 모드', report([o('A', 'placed')], 1, { gathered: true }))).toMatch(/^주 모니터로 모았어요 · /)
  })
  it('관리자 권한 창', () => {
    expect(restoreSummary('QA 모드', report([o('Visual Studio', 'elevated')], 1))).toContain('관리자 권한 창이라 건너뜀: Visual Studio')
  })
  it('이름은 두 개까지, 나머지는 외 N개', () => {
    const r = report([o('Excel', 'missing'), o('Word', 'gone'), o('Slack', 'missing')], 3)
    expect(restoreSummary('QA 모드', r)).toContain('Excel·Word 외 1개 못 찾음')
  })
  it('까닭 순서', () => {
    const r = report([o('F', 'timeout'), o('O', 'off'), o('H', 'hung'), o('B', 'blocked'), o('M', 'gone')], 5)
    expect(restoreSummary('N', r)).toBe('N · 창 5개 중 0개 배치 · M 못 찾음 · 관리자 권한 창이라 건너뜀: B · H 응답 없음 · O 위치가 조금 다름 · F 옮기지 못함')
  })
})

describe('saveSummary / notes', () => {
  const NONE = { minimized: 0, excluded: 0, offscreen: 0, overLimit: 0 }
  it('최소화한 창 안내', () => {
    expect(saveSummary({ name: '배치 1', windows: 5, skipped: { ...NONE, minimized: 2 } })).toBe('배치 1 · 창 5개 배치를 저장했어요 · 최소화된 창 2개는 빼고 저장')
    expect(saveSummary({ name: '배치 1', windows: 5, skipped: NONE })).toBe('배치 1 · 창 5개 배치를 저장했어요')
  })
  it('이름을 붙이지 않고 저장했으면(배치 N) 이름을 바꾸는 곳을 알린다: 설정 창(팔레트 @가 아님)', () => {
    expect(saveSummary({ name: '배치 2', windows: 3, skipped: NONE, renameHint: true })).toBe('배치 2 · 창 3개 배치를 저장했어요 · 이름·단축키는 설정에서 바꿀 수 있어요')
    expect(saveSummary({ name: '배치 2', windows: 3, skipped: { ...NONE, minimized: 1 }, renameHint: true })).toBe(
      '배치 2 · 창 3개 배치를 저장했어요 · 최소화된 창 1개는 빼고 저장 · 이름·단축키는 설정에서 바꿀 수 있어요'
    )
    expect(saveSummary({ name: '배치 2', windows: 3, skipped: NONE, renameHint: false })).not.toContain('@')
  })
  it('고정 문구(설계 §11 질문, Global Constraints의 Win32 안내는 그대로)', () => {
    expect(WORKSPACE_NOTES.gatherQuestion).toBe('다른 모니터 구성에서 저장한 배치예요. 주 모니터로 모을까요?')
    expect(WORKSPACE_NOTES.gatherDetail(2, 1)).toBe('저장할 때 모니터 2대 · 지금 1대')
    expect(WORKSPACE_NOTES.nativeUnavailable).toBe('보안 프로그램이 Win32 기능을 막아 창을 옮기거나 저장할 수 없어요.')
  })
  it('바쁨 안내는 저장·불러오기 어느 쪽이 진행 중이어도 맞는 말이다', () => {
    expect(WORKSPACE_NOTES.busy).toBe('창 배치를 저장하거나 불러오는 중이에요. 끝난 뒤 다시 해 주세요.')
    expect(WORKSPACE_NOTES.busy).not.toContain('옮기는')
  })
  it('안내는 무엇이 문제인지와 어떻게 할지를 함께 말하고, 편집 화면 대신 설정을 가리킨다', () => {
    expect(WORKSPACE_NOTES.noWindows).toBe('저장할 창이 없어요. 최소화한 창은 저장하지 않아요.')
    expect(WORKSPACE_NOTES.limit).toBe('워크스페이스는 30개까지 저장해요. 설정에서 쓰지 않는 것을 지운 뒤 다시 해 주세요.')
    expect(WORKSPACE_NOTES.missing).toBe('워크스페이스를 찾지 못했어요. 이미 지웠을 수 있어요.')
    expect(WORKSPACE_NOTES.empty).toBe('불러올 창이 없어요. 설정에서 창을 하나 이상 포함해 주세요.')
    expect(WORKSPACE_NOTES.saveFailed).toBe('워크스페이스 파일을 저장하지 못했어요. 잠시 뒤 다시 해 주세요.')
    for (const text of Object.values(WORKSPACE_NOTES)) if (typeof text === 'string') expect(text).not.toContain('편집 화면')
  })
})
