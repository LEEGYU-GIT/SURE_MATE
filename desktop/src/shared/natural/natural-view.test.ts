import { describe, expect, it } from 'vitest'
import builtin from '../../../resources/intents.json'
import type { PaletteItem } from '../types'
import { parseIntentPack } from './intent-pack'
import { buildNaturalView, type IntentState, type PhraseEntry } from './natural-view'

// 설정 창 말하듯 입력 탭이 그리는 값(설계 §13 8단계·§14). 문장·항목 이름은 가상 값
const pack = parseIntentPack(builtin).pack!
const items: PaletteItem[] = [
  { id: 'workspace:ws-qa', group: 'workspace', title: 'QA 모드' },
  { id: 'prompt:weekly-report', group: 'prompt', title: '주간 보고 초안' },
  { id: 'cmd.workspace-save', group: 'workspace', title: '지금 배치 저장' },
  { id: 'cmd.unmask', group: 'command', title: '가명 되돌리기' },
  { id: 'cmd.open-dictionary', group: 'command', title: '가명 사전 열기' }
]
const entries: PhraseEntry[] = [
  { key: '출근세팅해줘', id: 'workspace:ws-qa', at: '2026-11-09T09:00:00.000Z' },
  { key: '주간보고띄워줘', id: 'prompt:weekly-report', at: '2026-11-11T09:00:00.000Z' },
  { key: '지난달보고서열어줘', id: 'prompt:deleted', at: '2026-11-10T09:00:00.000Z' },
  { key: '가명풀어줘', id: 'cmd.unmask', at: '시각 아님' }
]
const builtinState: IntentState = { pack, source: 'builtin', errors: [] }
const view = (o: Partial<Parameters<typeof buildNaturalView>[0]> = {}): ReturnType<typeof buildNaturalView> =>
  buildNaturalView({ rev: 3, entries, phraseMax: 300, usageCount: 12, intents: builtinState, items, ...o })

describe('기억한 문장 줄', () => {
  it('최근에 기억한 것부터, 시각을 읽을 수 없는 것은 맨 뒤', () => {
    expect(view().phrases.map((p) => p.key)).toEqual(['주간보고띄워줘', '지난달보고서열어줘', '출근세팅해줘', '가명풀어줘'])
  })

  it('시각이 같으면 파일에서 뒤에 있는 것(나중에 기억한 것)이 먼저', () => {
    const at = '2026-11-11T09:00:00.000Z'
    const same: PhraseEntry[] = [
      { key: '가', id: 'cmd.unmask', at },
      { key: '나', id: 'cmd.unmask', at },
      { key: '다', id: 'cmd.unmask', at }
    ]
    expect(view({ entries: same }).phrases.map((p) => p.key)).toEqual(['다', '나', '가'])
  })

  it('그 문장이 여는 항목의 이름과 구역을 붙이고, 지금 없는 항목은 item이 null', () => {
    const rows = view().phrases
    expect(rows[0]).toEqual({ key: '주간보고띄워줘', item: { title: '주간 보고 초안', group: 'prompt' } })
    expect(rows[1]).toEqual({ key: '지난달보고서열어줘', item: null })
    expect(rows[2]).toEqual({ key: '출근세팅해줘', item: { title: 'QA 모드', group: 'workspace' } })
    // 항목 id는 화면에 보내지 않는다(문장과 항목 이름·구역만)
    expect(Object.keys(rows[0]).sort()).toEqual(['item', 'key'])
  })

  it('기억한 문장이 없으면 빈 목록', () => {
    expect(view({ entries: [] }).phrases).toEqual([])
  })
})

describe('건수와 단어 목록', () => {
  it('기억한 문장 수와 상한, 사용 기록 수, 어미·조사·군말 수, rev', () => {
    const v = view()
    expect(v.rev).toBe(3)
    expect(v.phrases).toHaveLength(4)
    expect(v.phraseMax).toBe(300)
    expect(v.usageCount).toBe(12)
    expect(v.intents).toMatchObject({ source: 'builtin', errors: [], endings: pack.endings.length, particles: pack.particles.length, fillers: pack.fillers.length })
    // 설계 §13 2단계 군말(좀, 그, 저기, 혹시)
    expect(v.intents.fillers).toBe(4)
  })

  it('의도 규칙은 단어 목록 순서대로 이름과 단어를 그대로 싣고, 대상은 구역이나 항목 이름(지금 없으면 null)', () => {
    const rules = view().intents.rules
    expect(rules.map((r) => r.id)).toEqual(pack.intents.map((r) => r.id))
    const prompt = rules.find((r) => r.id === 'prompt')
    expect(prompt).toEqual({ id: 'prompt', label: '프롬프트', words: pack.intents.find((r) => r.id === 'prompt')!.words, targets: [{ group: 'prompt' }] })
    expect(rules.find((r) => r.id === 'workspace-save')?.targets).toEqual([{ title: '지금 배치 저장' }])
    // 가명 처리 규칙: 항목 넷 가운데 둘은 이 미리 보기 항목에 없다
    expect(rules.find((r) => r.id === 'masking')?.targets).toEqual([{ title: '가명 되돌리기' }, { title: null }, { title: null }, { title: '가명 사전 열기' }])
  })

  it('사용자 파일을 쓰는지와 읽을 때 생긴 문제(순번·까닭만)를 그대로 싣는다', () => {
    const user = parseIntentPack({ ...builtin, fillers: ['음'] }).pack!
    const v = view({ intents: { pack: user, source: 'user', errors: ['어미 2번째: 문자열이 아님'] } })
    expect(v.intents).toMatchObject({ source: 'user', errors: ['어미 2번째: 문자열이 아님'], fillers: 1 })
  })
})
