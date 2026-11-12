import { describe, expect, it } from 'vitest'
import builtinGlossary from '../../../resources/glossary.json'
import builtinIntents from '../../../resources/intents.json'
import builtinPrompts from '../../../resources/prompts.json'
import { buildPaletteIndex, EMPTY_SEARCH_CONTEXT, filterItems, searchPalette, WIKI_ADD_ID, withWikiAdd, type SearchContext } from '../../renderer/src/palette/filter-items'
import { parseGlossaryPack } from '../../shared/glossary/pack'
import type { GlossaryEntry } from '../../shared/glossary/types'
import { parseIntentPack } from '../../shared/natural/intent-pack'
import { ENGLISH_WORDS } from '../../shared/natural/test-english-words'
import { understand } from '../../shared/natural/understand'
import type { UsageRecord } from '../../shared/natural/usage'
import { parseTemplatePack } from '../../shared/template/pack'
import { monitorFingerprint } from '../../shared/workspace/monitors'
import { L, P } from '../../shared/workspace/test-monitors'
import { testWorkspace } from '../../shared/workspace/test-workspaces'
import { workspacePaletteItems } from '../workspace/workspace-items'
import { buildPaletteItems } from './palette-items'

// 설치 파일에 들어가는 실제 기본 자료(프롬프트·상용구 팩, 용어 팩, 말하듯 입력 단어 목록)로 말하듯 입력 전체를 돌린다(설계 §13 완료 기준)
const templates = parseTemplatePack(builtinPrompts, 'builtin').templates
const glossary = parseGlossaryPack(builtinGlossary, 'builtin').entries
/** 원형 유지 규칙을 시험하는 사용자 용어(가상) */
const testTerm = (id: string, term: string): GlossaryEntry => ({
  id,
  term,
  aliases: [],
  definition: '시험용 가상 용어',
  links: [],
  tags: [],
  source: 'user',
  updatedAt: '2026-11-11T00:00:00.000Z',
  version: 1
})
const userTerms = [testTerm('u-exact', '정확'), testTerm('u-accuracy', '정확도'), testTerm('u-mean', '평균')]
// 워크스페이스 세 개(가상 이름). 배치는 워크스페이스 시험의 시험 지문 배치(test-workspaces.ts, 가상 창 제목)
const workspaces = workspacePaletteItems(
  [
    testWorkspace({ id: 'ws-qa', name: 'QA 모드', aliases: ['qa', '시험', '테스트'] }),
    testWorkspace({ id: 'ws-report', name: '보고서 모드', aliases: ['보고'] }),
    testWorkspace({ id: 'ws-meeting', name: '회의 모드', aliases: ['미팅 화면'] })
  ],
  monitorFingerprint([P, L])
)
// 펫 명령은 M6을 합치며 들어왔다(petVisible: true). 워크스페이스 항목은 "지금 배치 저장"(cmd.workspace-save)과 위 세 개
const items = buildPaletteItems(templates, [], { maskingMode: 'restore', glossary: [...glossary, ...userTerms], barShape: 'edge', petVisible: true, workspaces })
const index = buildPaletteIndex(items)
const pack = parseIntentPack(builtinIntents).pack!
const NOW = Date.parse('2026-11-11T09:00:00.000Z')
const ctx: SearchContext = { pack, learned: new Map(), usage: new Map(), now: NOW }
const search = (q: string, c: SearchContext = ctx): ReturnType<typeof searchPalette> => searchPalette(items, q, index, c)
const top = (q: string, c?: SearchContext): string | undefined => search(q, c).items[0]?.id

/**
 * 문장 표(설계 §13 완료 기준 "문장 40개 이상의 표로 Vitest를 돌려 모두 맨 위 후보가 맞는다"). 51줄.
 * 정확도·평가·결과 줄은 원형 유지 규칙을 지킨다: 원형을 버리거나 감점이 없으면 '정확'(u-exact)이,
 * 1음절 어간을 허용하면 '평균'(u-mean)·'결함 리포트'가 맨 위로 온다.
 */
const TABLE: [sentence: string, top: string][] = [
  ['회의록 정리해줘', 'prompt:meeting-notes'],
  ['회의록 좀 정리해 주세요', 'prompt:meeting-notes'],
  ['회의록 정리해줘!!', 'prompt:meeting-notes'],
  ['회의록을', 'prompt:meeting-notes'],
  ['클로드로 회의록 정리', 'prompt:meeting-notes'],
  ['주간보고 초안 작성해줘', 'prompt:weekly-report'],
  ['메일 회신 초안 써줘', 'prompt:mail-reply'],
  ['문장 다듬기 해줘', 'prompt:polish'],
  ['요구사항으로 테스트 케이스 만들어줘', 'prompt:req-to-testcase'],
  ['정적분석 소명 초안', 'prompt:static-analysis'],
  ['ISO 26262 조항 찾아줘', 'prompt:standard-clause'],
  ['협업 문서 요약해줘', 'prompt:collab-summary'],
  ['요약해줘', 'prompt:collab-summary'],
  ['mcdc 뭐야', 'wiki:mcdc'],
  ['MC/DC가 뭐야?', 'wiki:mcdc'],
  ['ISO26262는', 'wiki:iso-26262'],
  ['ASIL이란', 'wiki:asil'],
  ['오탐 뜻 알려줘', 'wiki:false-positive'],
  ['정적분석이 뭐야', 'wiki:static-analysis'],
  ['ㅈㅈㅂㅅ', 'wiki:static-analysis'],
  ['정적분삭', 'wiki:static-analysis'],
  ['wjdwjrqnstjr', 'wiki:static-analysis'],
  ['HARA 풀네임', 'wiki:hara'],
  ['커버리지가 뭐지', 'wiki:code-coverage'],
  ['혹시 커버리지 뜻 좀 알려주세요', 'wiki:code-coverage'],
  ['보고서 모드로 바꿔줘', 'workspace:ws-report'],
  ['qhrhtj ahemfh qkRnjwnj', 'workspace:ws-report'],
  ['회의모드로바꿔줘', 'workspace:ws-meeting'],
  ['회의 화면 불러와줘', 'workspace:ws-meeting'],
  ['QA 모드 켜줘', 'workspace:ws-qa'],
  ['qa로 전환', 'workspace:ws-qa'],
  ['시험 배치로 복원', 'workspace:ws-qa'],
  ['지금 배치 저장해줘', 'cmd.workspace-save'],
  ['현재 배치 기억해줘', 'cmd.workspace-save'],
  ['배치 저장', 'cmd.workspace-save'],
  ['이슈 양식', 'snippet:defect-report'],
  ['결함 리포트 붙여줘', 'snippet:defect-report'],
  ['메일 서명', 'snippet:mail-signature'],
  ['서명 붙여넣어줘', 'snippet:mail-signature'],
  ['가명 되돌려줘', 'cmd.unmask'],
  ['원래 이름으로 돌려줘', 'cmd.unmask'],
  ['rkaud ehlehffuwnj', 'cmd.unmask'],
  ['선택한 글 가려줘', 'cmd.mask-selection'],
  ['가명 처리 꺼줘', 'cmd.masking-mode'],
  ['마스킹 사전 열어줘', 'cmd.open-dictionary'],
  ['용어 팩 내보내기', 'cmd.glossary-export'],
  ['바 모양 바꿔줘', 'cmd.bar-shape'],
  ['정확도', 'wiki:u-accuracy'],
  ['평가', 'wiki:hara'],
  ['결과', 'wiki:str'],
  ['ghldmlfhr wjdflgownj', 'prompt:meeting-notes']
]

it('기본 자료가 모두 읽힌다(시험 전제)', () => {
  expect(templates.length).toBeGreaterThan(0)
  expect(glossary.length).toBeGreaterThan(100)
  expect(pack.intents.length).toBeGreaterThan(0)
  expect(TABLE.length).toBeGreaterThanOrEqual(40)
})

describe('문장 표: 맨 위 후보', () => {
  it.each(TABLE)('%s → %s', (sentence, id) => {
    expect(top(sentence)).toBe(id)
  })
})

it('(Review Focus 4) 낱말·영어 낱말·초성·오타·치는 중인 글은 말하듯 입력을 켜도 M4 검색과 맨 위가 같다', () => {
  for (const q of ['mcdc', 'misra', 'meeting', 'mail', 'qa', 'test', 'ㅈㅈㅂㅅ', '정적분삭', '정ㅈ', '정적분서', '커버리지', '정적분석', '회의']) {
    const m4 = filterItems(items, q, index, EMPTY_SEARCH_CONTEXT)
    expect(top(q), q).toBe(m4[0]?.id)
    // 맨 위뿐 아니라 목록 전체가 같다(의도 단어도 조사도 없는 낱말은 변형 검색어가 원문 하나)
    expect(search(q).items.map((i) => i.id), q).toEqual(m4.map((i) => i.id))
  }
  for (const q of ['ㅈ', 'ㅅ', 's', 'ㅎ', '회']) {
    expect(search(q).items.some((i) => i.group === 'wiki'), q).toBe(false)
  }
})

describe('영문 자판 바꾸기는 영어 낱말 검색을 바꾸지 않는다', () => {
  it("'word'는 바꾼 '잭ㅇ'으로 용어를 끌어오지 않아 '직접 추가하기'만 남는다(M4와 같다)", () => {
    expect(search('word').items).toEqual([])
    expect(withWikiAdd(search('word').items, 'word').map((i) => i.id)).toEqual([WIKI_ADD_ID])
  })

  it('흔한 영어 낱말·약어 109개는 M4 검색에 없는 줄을 더하지 않는다', () => {
    for (const w of ENGLISH_WORDS) {
      const m4 = filterItems(items, w, index, EMPTY_SEARCH_CONTEXT).map((i) => i.id)
      expect(
        search(w)
          .items.map((i) => i.id)
          .filter((id) => !m4.includes(id)),
        w
      ).toEqual([])
    }
  })
})

it('요청 어미를 떼고 한 글자만 남는 낱말(이란·자란·불켜·혼란·파란·전란·반란·켜켜)은 M4 검색과 목록이 같다', () => {
  for (const q of ['이란', '자란', '불켜', '혼란', '파란', '전란', '반란', '켜켜']) {
    const m4 = filterItems(items, q, index, EMPTY_SEARCH_CONTEXT)
    expect(search(q).items.map((i) => i.id), q).toEqual(m4.map((i) => i.id))
  }
})

it('의도 표시: 맨 위 후보에 가장 좁은 찾은 규칙의 이름, 없으면 구역 기본 이름', () => {
  expect(search('가명 되돌려줘').top).toEqual({ id: 'cmd.unmask', label: '가명 처리' })
  expect(search('선택한 글 가려줘').top).toEqual({ id: 'cmd.mask-selection', label: '가명 처리' })
  expect(search('정확도').top).toEqual({ id: 'wiki:u-accuracy', label: '용어 뜻' })
  expect(search('회의록 정리해줘').top).toEqual({ id: 'prompt:meeting-notes', label: '프롬프트' })
  expect(search('이슈 양식').top).toEqual({ id: 'snippet:defect-report', label: '상용구' })
  expect(search('보고서 모드로 바꿔줘').top).toEqual({ id: 'workspace:ws-report', label: '창 배치' })
  expect(search('현재 배치 기억해줘').top).toEqual({ id: 'cmd.workspace-save', label: '창 배치' })
  // 접두어 검색은 규칙을 찾지 않고 이 워크스페이스를 id로 가리키는 규칙도 없으므로 구역 기본 이름
  expect(search('@QA').top).toEqual({ id: 'workspace:ws-qa', label: '창 배치' })
})

it('의도 표시는 맨 위 항목의 제목을 되풀이하지 않는다(문장 표 전체)', () => {
  for (const [sentence] of TABLE) {
    const s = search(sentence)
    const title = items.find((i) => i.id === s.top?.id)?.title
    expect(s.top?.label, sentence).toBeTruthy()
    expect(s.top?.label, sentence).not.toBe(title)
  }
})

it('학습: 기억한 문장은 검색어에 맞지 않아도 맨 위이고 의도 표시는 기억한 문장', () => {
  const learned = new Map([['출근세팅해줘', 'snippet:mail-signature']])
  const s = search('출근 세팅해줘', { ...ctx, learned })
  expect(s.items[0].id).toBe('snippet:mail-signature')
  expect(s.top).toEqual({ id: 'snippet:mail-signature', label: '기억한 문장' })
  expect(s.key).toBe('출근세팅해줘')
  expect(top('출근 세팅해줘')).not.toBe('snippet:mail-signature')
})

it('학습: 워크스페이스 QA 모드도 같다(학습 키는 팔레트 선택 기록이 저장할 때 쓰는 understand의 key)', () => {
  // main의 createPickHandler가 phrase-map.json에 저장하는 키와 같은 함수로 만든다
  const key = understand('출근세팅해줘', pack).key
  expect(key).toBe('출근세팅해줘')
  const learned = new Map([[key!, 'workspace:ws-qa']])
  const s = search('출근 세팅해줘', { ...ctx, learned })
  expect(s.items[0].id).toBe('workspace:ws-qa')
  expect(s.top).toEqual({ id: 'workspace:ws-qa', label: '기억한 문장' })
  expect(s.key).toBe(key)
  expect(top('출근 세팅해줘')).not.toBe('workspace:ws-qa')
})

it('사용 기록: 같은 점수면 자주·최근 쓴 항목이 먼저("가명"은 네 가명 명령이 동점)', () => {
  expect(search('가명').items.slice(0, 4).map((i) => i.id)).toEqual(['cmd.unmask', 'cmd.open-dictionary', 'cmd.mask-selection', 'cmd.masking-mode'])
  const usage = new Map<string, UsageRecord>([['cmd.open-dictionary', { count: 5, lastAt: new Date(NOW).toISOString() }]])
  expect(top('가명', { ...ctx, usage })).toBe('cmd.open-dictionary')
})

it('빈 검색어: 최근 실행 항목 5개가 최근 순으로 맨 앞(지금 없는 id는 건너뜀)', () => {
  const at = (minutes: number): string => new Date(NOW - minutes * 60_000).toISOString()
  const usage = new Map<string, UsageRecord>([
    ['prompt:polish', { count: 1, lastAt: at(4) }],
    ['snippet:mail-signature', { count: 2, lastAt: at(1) }],
    ['wiki:mcdc', { count: 1, lastAt: at(2) }],
    ['cmd.removed-command', { count: 7, lastAt: at(3) }],
    ['cmd.bar-shape', { count: 1, lastAt: at(5) }],
    ['prompt:meeting-notes', { count: 3, lastAt: at(6) }]
  ])
  const s = search('', { ...ctx, usage })
  expect(s.recent).toEqual(['snippet:mail-signature', 'wiki:mcdc', 'prompt:polish', 'cmd.bar-shape', 'prompt:meeting-notes'])
  expect(s.items.slice(0, 5).map((i) => i.id)).toEqual(s.recent)
  const listed = s.items.map((i) => i.id)
  expect(new Set(listed).size).toBe(listed.length)
  expect(listed.length).toBeLessThanOrEqual(50)
})

/** 속도 시험용 가상 낱말의 음절 40개. 자리마다 다르게 돌려 세 음절을 고르므로 i < 64,000이면 이름이 서로 다르다(실제 용어가 아니다) */
const SYLLABLES = [...'가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초코토']
const fakeName = (i: number): string =>
  [i % 40, Math.floor(i / 40) % 40, Math.floor(i / 1600) % 40].map((d, k) => SYLLABLES[(d * 7 + k * 13) % 40]).join('')
/** 가상 영문 약어(소문자 세 글자, i < 17,576이면 서로 다르다) */
const fakeAbbr = (i: number): string => [i % 26, Math.floor(i / 26) % 26, Math.floor(i / 676) % 26].map((d) => String.fromCharCode(97 + d)).join('')

/** 기본 자료에 가상 용어 2,000개를 더한 팔레트 항목과 색인(속도 시험 둘이 같이 쓴다. 처음 부를 때 한 번 만든다) */
let bigSet: { big: ReturnType<typeof buildPaletteItems>; bigIndex: ReturnType<typeof buildPaletteIndex> } | null = null
function withFakeTerms(): NonNullable<typeof bigSet> {
  if (bigSet) return bigSet
  // 가상 용어 2,000개(설명 '시험용 가상 용어'). 기본 용어 팩처럼(별칭 평균 2.4개) 별칭 둘(띄어 쓴 이름, 영문 약어)을 둔다
  const fake = Array.from({ length: 2000 }, (_, i): GlossaryEntry => {
    const name = fakeName(i)
    return { ...testTerm(`u-fake-${i}`, name), aliases: [`${name.slice(0, 2)} ${name.slice(2)}`, fakeAbbr(i)] }
  })
  expect(new Set(fake.map((e) => e.term)).size).toBe(2000)
  const big = buildPaletteItems(templates, [], { maskingMode: 'restore', glossary: [...glossary, ...userTerms, ...fake], barShape: 'edge', petVisible: true, workspaces })
  // 팔레트는 색인을 항목이 바뀔 때만 만들어 두고(Palette.tsx의 useMemo) 글자를 칠 때마다 searchPalette만 다시 돌린다.
  // 그래서 색인 만들기는 재지 않고 searchPalette 한 번(문장 이해·점수·정렬·50줄 자르기)만 잰다
  bigSet = { big, bigIndex: buildPaletteIndex(big) }
  return bigSet
}

// 이름이 '속도'로 시작하는 시험은 vitest.config.ts의 speed 묶음이 다른 시험이 모두 끝난 뒤 따로 잰다(CPU를 나눠 쓰지 않게)
it('속도(설계 §16 "용어 2,000개에서 검색 갱신 50ms 이내"): 시험 용어 2,000개를 더해 문장 표 51개를 5번씩 잰 문장당 평균의 중앙값이 50ms 미만', () => {
  const { big, bigIndex } = withFakeTerms()
  const run = (q: string): void => void searchPalette(big, q, bigIndex, ctx)
  expect(TABLE).toHaveLength(51)
  for (const [sentence] of TABLE) run(sentence) // 데우기 한 번
  const total = new Array<number>(TABLE.length).fill(0)
  for (let round = 0; round < 5; round++) {
    TABLE.forEach(([sentence], i) => {
      const start = performance.now()
      run(sentence)
      total[i] += performance.now() - start
    })
  }
  const means = total.map((t) => t / 5)
  const median = [...means].sort((a, b) => a - b)[Math.floor(means.length / 2)]
  expect(median).toBeLessThan(50)
}, 60_000)

it('속도: 입력칸 상한(200자)까지 친 한글 문장도 시험 용어 2,000개에서 5번 잰 중앙값이 50ms 미만', () => {
  const { big, bigIndex } = withFakeTerms()
  const sentence = '회의록 좀 정리해 주세요 그리고 주간보고 초안도 작성해 주시고 메일 회신 초안도 써 주세요 '.repeat(5).slice(0, 200)
  expect(sentence).toHaveLength(200)
  searchPalette(big, sentence, bigIndex, ctx) // 데우기 한 번
  const times: number[] = []
  for (let round = 0; round < 5; round++) {
    const start = performance.now()
    searchPalette(big, sentence, bigIndex, ctx)
    times.push(performance.now() - start)
  }
  const median = [...times].sort((a, b) => a - b)[2]
  expect(median).toBeLessThan(50)
}, 60_000)
