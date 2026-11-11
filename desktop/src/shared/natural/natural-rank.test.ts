import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { buildSearchIndex } from '../search/ranker'
import type { PaletteGroup } from '../types'
import { parseIntentPack, type IntentPack } from './intent-pack'
import { DEFAULT_INTENT_LABELS, INTENT_BONUS, LEARN_BONUS, LEARNED_LABEL, naturalRank, type NaturalHit } from './natural-rank'
import { understand, type Understood } from './understand'

const pack = parseIntentPack(JSON.parse(readFileSync(join(__dirname, '../../../resources/intents.json'), 'utf8'))).pack!

// 가명 명령 넷(실제 제목·키워드)과 다른 구역 항목
const docs: { id: string; group: PaletteGroup; title: string; aliases: string[] }[] = [
  { id: 'cmd.unmask', group: 'command', title: '가명 되돌리기', aliases: ['unmask', 'restore', '복원', '되돌리기', '원래 이름', '가명'] },
  { id: 'cmd.mask-selection', group: 'command', title: '선택한 글 가명 처리', aliases: ['mask', 'masking', '가리기', '익명', '가명'] },
  { id: 'cmd.masking-mode', group: 'command', title: '가명 처리 기본값 바꾸기', aliases: ['masking', 'mode', '모드', '끄기', '켜기', '가명'] },
  { id: 'cmd.open-dictionary', group: 'command', title: '가명 사전 열기', aliases: ['dictionary', 'masking', '사전', '고객사', '가명'] },
  { id: 'prompt:meeting-notes', group: 'prompt', title: '회의록 정리', aliases: ['회의 정리', '회의록', 'meeting'] },
  { id: 'wiki:pseudonymization', group: 'wiki', title: '가명처리', aliases: ['가명 처리'] }
]
const index = buildSearchIndex(docs)
const groupOf = (id: string): PaletteGroup | undefined => docs.find((d) => d.id === id)?.group
const none = new Map<string, string>()
const rankOf = (text: string, learned: ReadonlyMap<string, string> = none): NaturalHit[] =>
  naturalRank(index, understand(text, pack), { pack, groupOf, learned })

it('가산점과 기본 의도 이름', () => {
  expect(INTENT_BONUS).toBe(120)
  expect(LEARN_BONUS).toBe(2000)
  expect(LEARNED_LABEL).toBe('기억한 문장')
  expect(DEFAULT_INTENT_LABELS).toEqual({ prompt: '프롬프트', command: '명령', workspace: '창 배치', snippet: '상용구', wiki: '용어 뜻' })
})

it('규칙 두 개가 같은 문서를 가리키면 240점: "원래 이름으로 돌려줘"는 검색어에 맞지 않아도 가명 되돌리기가 맨 위', () => {
  const hits = rankOf('원래 이름으로 돌려줘')
  // 가명(넓은 규칙)과 가명 되돌리기(좁은 규칙)가 둘 다 id로 가리킨다
  expect(hits[0]).toEqual({ id: 'cmd.unmask', score: 240, title: false, label: '가명 처리', learned: false })
  // 넓은 규칙 하나만 가리키는 나머지 가명 명령은 120점
  expect(hits.filter((h) => h.id !== 'cmd.unmask' && h.id.startsWith('cmd.')).map((h) => [h.score, h.label])).toEqual([
    [120, '가명 처리'],
    [120, '가명 처리'],
    [120, '가명 처리']
  ])
})

it('기본 목록의 가명 규칙은 이름이 모두 가명 처리다(좁은 두 규칙은 점수용): "가명 되돌려줘"', () => {
  const hits = rankOf('가명 되돌려줘')
  // 별칭 '가명' 일치 950 + 가명 120 + 가명 되돌리기 120. 의도 표시는 제목('가명 되돌리기')을 되풀이하지 않는다
  expect(hits[0]).toEqual({ id: 'cmd.unmask', score: 1190, title: false, label: '가명 처리', learned: false })
  expect(hits.find((h) => h.id === 'cmd.open-dictionary')).toMatchObject({ score: 1070, label: '가명 처리' })
  // 아무 규칙도 가리키지 않는 문서는 label 없음
  expect(hits.find((h) => h.id === 'wiki:pseudonymization')).toMatchObject({ score: 900, label: null, learned: false })
})

it('규칙끼리 합산하고 한 규칙은 한 번(구역과 id를 함께 가리켜도), label이 같은 대상 수면 단어 목록 순서', () => {
  const p: IntentPack = {
    fillers: [],
    endings: [],
    particles: [],
    intents: [
      { id: 'wide', label: '넓은 규칙', words: ['x'], targets: [{ group: 'command' }, { id: 'cmd.open' }, { id: 'cmd.open' }] },
      { id: 'narrow-a', label: '좁은 규칙 가', words: ['x'], targets: [{ group: 'command' }] },
      { id: 'narrow-b', label: '좁은 규칙 나', words: ['x'], targets: [{ group: 'command' }] },
      { id: 'not-found', label: '찾지 못한 규칙', words: ['x'], targets: [{ id: 'cmd.other' }] }
    ]
  }
  const i = buildSearchIndex([
    { id: 'cmd.open', title: '열기', aliases: [] },
    { id: 'cmd.other', title: '다른 명령', aliases: [] },
    { id: 'prompt:x', title: '프롬프트', aliases: [] }
  ])
  const groups: Record<string, PaletteGroup> = { 'cmd.open': 'command', 'cmd.other': 'command', 'prompt:x': 'prompt' }
  const u: Understood = { variants: [{ text: '다른', penalty: 0, typo: true }], intents: ['wide', 'narrow-a', 'narrow-b'], key: null, natural: true }
  expect(naturalRank(i, u, { pack: p, groupOf: (id) => groups[id], learned: none })).toEqual([
    // 앞부분 일치 900 + 세 규칙 360(찾지 못한 규칙은 더하지 않음)
    { id: 'cmd.other', score: 1260, title: true, label: '좁은 규칙 가', learned: false },
    // 검색어에 맞지 않지만 id로 지목됨: 넓은 규칙은 id를 두 번, 구역도 가리키지만 한 번만
    { id: 'cmd.open', score: 360, title: false, label: '좁은 규칙 가', learned: false }
  ])
})

it('학습한 문서는 검색어에 맞지 않아도 2,000점을 더해 맨 위, label은 기억한 문장', () => {
  const learned = new Map([['출근세팅해줘', 'prompt:meeting-notes']])
  expect(rankOf('출근 세팅해줘', learned)).toEqual([{ id: 'prompt:meeting-notes', score: 2000, title: false, label: '기억한 문장', learned: true }])
  // 맞는 문서가 있어도 학습한 문서가 맨 위
  const hits = rankOf('가명 되돌려줘', new Map([['가명되돌려줘', 'cmd.open-dictionary']]))
  expect(hits[0]).toEqual({ id: 'cmd.open-dictionary', score: 3070, title: false, label: '기억한 문장', learned: true })
  expect(hits[1]).toMatchObject({ id: 'cmd.unmask', label: '가명 처리', learned: false })
})

it('학습한 id가 색인에 없으면 무시한다', () => {
  expect(rankOf('출근 세팅해줘', new Map([['출근세팅해줘', 'workspace:gone']]))).toEqual([])
  expect(rankOf('가명 되돌려줘', new Map([['가명되돌려줘', 'workspace:gone']]))).toEqual(rankOf('가명 되돌려줘'))
})

it('prefer는 같은 점수에서만 순서를 바꾼다', () => {
  const prefer = (id: string): number => (id === 'cmd.open-dictionary' ? 5 : 0)
  const ids = (h: { id: string }[]): string[] => h.map((x) => x.id)
  const u = understand('가명', pack)
  // 가명 명령 넷이 1070점 동점: prefer가 없으면 짧은 제목, 있으면 prefer 큰 쪽
  expect(ids(naturalRank(index, u, { pack, groupOf, learned: none })).slice(0, 4)).toEqual(['cmd.unmask', 'cmd.open-dictionary', 'cmd.mask-selection', 'cmd.masking-mode'])
  expect(ids(naturalRank(index, u, { pack, groupOf, learned: none, prefer })).slice(0, 4)).toEqual(['cmd.open-dictionary', 'cmd.unmask', 'cmd.mask-selection', 'cmd.masking-mode'])
})
