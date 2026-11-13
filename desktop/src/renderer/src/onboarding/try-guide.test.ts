import { describe, expect, it } from 'vitest'
import { UNMASK_COMMAND_TITLE } from '../../../shared/labels'
import type { MaskTerm } from '../../../shared/masking/dictionary'
import { ALL_CATEGORIES, type MaskCategory } from '../../../shared/masking/types'
import { DEFAULT_SETTINGS } from '../../../shared/settings/settings'
import type { MaskingMode } from '../../../shared/types'
import { TRY_MEMO, tryDoneText, tryExpectation, tryNextSteps, tryTarget } from './try-guide'

/** 사용자가 '가명 사전 열기'를 처음 실행할 때 앱이 만드는 가상 예시(main/masking/dictionary-store.ts) */
const EXAMPLE_TERMS: MaskTerm[] = [
  { id: 'example-client-1', category: 'client', canonical: '가상자동차', aliases: ['가상차'] },
  { id: 'example-client-2', category: 'client', canonical: 'XY방산', aliases: [] }
]
const masking = (
  mode: MaskingMode,
  over: Partial<typeof DEFAULT_SETTINGS.masking> = {}
): typeof DEFAULT_SETTINGS.masking => ({ ...DEFAULT_SETTINGS.masking, mode, ...over })
const only = (...on: MaskCategory[]): Record<MaskCategory, boolean> =>
  Object.fromEntries(ALL_CATEGORIES.map((c) => [c, on.includes(c)])) as Record<
    MaskCategory,
    boolean
  >

describe('따라 해 보기 메모(가상 이름만)', () => {
  it('가상 회사·사람 이름과 IP·경로가 들어 있다', () => {
    for (const part of ['가상자동차', 'XY방산', '김가상', '10.0.3.15', 'C:\\가상자동차\\시험결과'])
      expect(TRY_MEMO).toContain(part)
  })
})

describe('tryExpectation: 확인 화면에서 처음 보일 바뀐 부분(앱과 같은 가명 처리 함수로 지금 사전·설정에서 계산)', () => {
  it('처음 설치하면 가명 사전이 비어 있어 회사 이름은 그대로고, IP가 처음 바뀐다', () => {
    expect(tryExpectation({ terms: [], masking: masking('restore') })).toEqual({
      from: '10.0.3.15',
      to: 'IP_1'
    })
  })

  it('가명 사전에 가상자동차가 있으면 맨 앞의 회사 이름이 CLIENT_A로 바뀐다', () => {
    expect(tryExpectation({ terms: EXAMPLE_TERMS, masking: masking('restore') })).toEqual({
      from: '가상자동차',
      to: 'CLIENT_A'
    })
  })

  it('바꾸기만이면 읽기 쉬운 표기(설정에서 바꾼 표기 포함)', () => {
    expect(tryExpectation({ terms: [], masking: masking('remove') })).toEqual({
      from: '10.0.3.15',
      to: '[IP 주소]'
    })
    expect(tryExpectation({ terms: EXAMPLE_TERMS, masking: masking('remove') })).toEqual({
      from: '가상자동차',
      to: '고객사A'
    })
    expect(
      tryExpectation({ terms: [], masking: masking('remove', { removeLabels: { ip: '[서버]' } }) })
    ).toEqual({ from: '10.0.3.15', to: '[서버]' })
  })

  it('끔이거나 바꿀 분류를 모두 껐으면 바뀌는 것이 없다(null)', () => {
    expect(tryExpectation({ terms: EXAMPLE_TERMS, masking: masking('off') })).toBeNull()
    expect(
      tryExpectation({ terms: EXAMPLE_TERMS, masking: masking('restore', { categories: only() }) })
    ).toBeNull()
  })

  it('IP를 끄면 그다음 대상(경로)이 처음 바뀐다', () => {
    expect(
      tryExpectation({ terms: [], masking: masking('restore', { categories: only('path') }) })
    ).toEqual({ from: 'C:\\가상자동차\\시험결과', to: 'PATH_1' })
  })
})

describe('tryTarget: 확인 화면에서 Enter를 누르면 열릴 AI(회의록 정리는 기본 AI를 쓴다)', () => {
  const targets = [
    { id: 'claude', name: 'Claude', url: 'https://claude.ai' },
    { id: 'copy', name: '복사만' },
    { id: 'custom-llm', name: '사내 LLM', url: 'https://llm.example.com' }
  ]
  it('주소가 있으면 그 AI 창이 열린다. 복사만이면 열리는 창이 없다. 모르는 id는 Claude', () => {
    expect(tryTarget({ defaultTarget: 'custom-llm', targets })).toEqual({
      name: '사내 LLM',
      opens: true
    })
    expect(tryTarget({ defaultTarget: 'copy', targets })).toEqual({ name: '복사만', opens: false })
    expect(tryTarget({ defaultTarget: 'gone', targets })).toEqual({ name: 'Claude', opens: true })
  })
})

describe('해낸 뒤: 무엇이 클립보드에 있는지(tryDoneText)와 다음에 할 일(tryNextSteps)', () => {
  const claude = { name: 'Claude', opens: true }
  const ip = { from: '10.0.3.15', to: 'IP_1' }

  it('되찾기 명령 이름은 팔레트 명령의 실제 제목이다', () => {
    expect(UNMASK_COMMAND_TITLE).toBe('가명 되돌리기')
  })

  it('바꾸고 되돌리기: 열린 AI 창에 붙여넣고, AI가 쓴 글을 복사한 뒤 가명 되돌리기(바뀐 것의 실제 예)', () => {
    expect(tryNextSteps({ mode: 'restore', target: claude, swap: ip })).toEqual([
      'Claude 창에 Ctrl+V로 붙여넣어요.',
      'AI가 쓴 글을 복사한 뒤 팔레트에서 ‘가명 되돌리기’를 실행하면 IP_1이 10.0.3.15로 돌아와요.'
    ])
    expect(
      tryNextSteps({
        mode: 'restore',
        target: claude,
        swap: { from: '가상자동차', to: 'CLIENT_A' }
      })[1]
    ).toBe(
      'AI가 쓴 글을 복사한 뒤 팔레트에서 ‘가명 되돌리기’를 실행하면 CLIENT_A가 가상자동차로 돌아와요.'
    )
    expect(tryDoneText({ mode: 'restore', swap: ip })).toBe(
      '임시 이름으로 바꾼 프롬프트가 클립보드에 있어요.'
    )
  })

  it('바꾸기만: 되돌리지 않는다고 알린다. 끔: 붙여넣기만', () => {
    expect(
      tryNextSteps({ mode: 'remove', target: claude, swap: { from: '10.0.3.15', to: '[IP 주소]' } })
    ).toEqual([
      'Claude 창에 Ctrl+V로 붙여넣어요.',
      '‘바꾸기만’이라 AI가 쓴 글에도 바꾼 이름이 그대로 남아요.'
    ])
    expect(tryNextSteps({ mode: 'off', target: claude, swap: null })).toEqual([
      'Claude 창에 Ctrl+V로 붙여넣어요.'
    ])
    expect(tryDoneText({ mode: 'off', swap: null })).toBe(
      '가명 처리가 꺼져 있어 원문 그대로 복사했어요.'
    )
  })

  it('바꿀 것이 없으면(분류를 모두 끔) 되돌릴 것도 없다고 보고 붙여넣기만', () => {
    expect(tryNextSteps({ mode: 'restore', target: claude, swap: null })).toEqual([
      'Claude 창에 Ctrl+V로 붙여넣어요.'
    ])
    expect(tryDoneText({ mode: 'restore', swap: null })).toBe(
      '바꿀 이름이 없어 원문 그대로 복사했어요.'
    )
  })

  it('복사만이면 열린 창이 없으니 붙여넣을 곳에서 Ctrl+V', () => {
    expect(
      tryNextSteps({ mode: 'off', target: { name: '복사만', opens: false }, swap: null })
    ).toEqual(['붙여넣을 곳에서 Ctrl+V를 눌러요.'])
  })
})
