import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INTENTS_FORMAT, parseIntentPack } from './intent-pack'

const raw = JSON.parse(readFileSync(join(__dirname, '../../../resources/intents.json'), 'utf8'))

// 설계 §13 원문
const FILLERS = ['좀', '그', '저기', '혹시']
const ENDINGS = ['해주실래요', '해주세요', '해줘', '해봐', '주세요', '줘', '부탁해', '보여줘', '알려줘', '가르쳐줘', '설명해줘', '찾아줘', '검색해줘', '정리해줘', '요약해줘', '뭐예요', '뭔가요', '무엇인가요', '뭐야', '뭐지', '이란', '란', '바꿔줘', '바꿔', '전환해줘', '켜줘', '켜', '꺼줘', '열어줘', '실행해줘', '띄워줘', '불러와줘', '복원해줘', '저장해줘', '만들어줘', '작성해줘', '써줘', '복사해줘', '가려줘', '되돌려줘']
const PARTICLES = ['으로부터', '에서부터', '으로서', '으로써', '이라는', '라는', '이라고', '라고', '이랑', '랑', '하고', '에게서', '에게', '한테', '에서는', '에서도', '에서', '에는', '에도', '으로는', '로는', '으로', '로', '까지', '부터', '처럼', '보다', '마다', '이나', '나', '이란', '란', '의', '은', '는', '이', '가', '을', '를', '와', '과', '도', '만', '에']
const INTENT_WORDS: Record<string, string[]> = {
  prompt: ['정리', '요약', '초안', '작성', '다듬기', '교정', '테스트 케이스', '소명', '조항', '분석', '프롬프트', 'AI', '클로드', 'GPT', '제미나이'],
  wiki: ['뜻', '의미', '정의', '용어', '약어', '풀네임', '뭐야', '이란'],
  workspace: ['워크스페이스', '레이아웃', '배치', '화면', '모드', '전환', '바꿔', '켜', '복원', '불러와'],
  'workspace-save': ['저장', '기억', '현재 배치'],
  snippet: ['양식', '서식', '상용구', '붙여', '템플릿'],
  masking: ['가명', '마스킹', '익명', '가려', '되돌려', '원래 이름'],
  settings: ['설정', '단축키', '사이드패널', '위치', '내보내기', '가져오기']
}
// 지시로 추가한 어미
const EXTRA_ENDINGS = ['보여주세요', '알려주세요', '가르쳐주세요', '설명해주세요', '찾아주세요', '검색해주세요', '정리해주세요', '요약해주세요', '바꿔주세요', '전환해주세요', '켜주세요', '꺼주세요', '열어주세요', '실행해주세요', '띄워주세요', '불러와주세요', '복원해주세요', '저장해주세요', '만들어주세요', '작성해주세요', '써주세요', '복사해주세요', '가려주세요', '되돌려주세요', '붙여넣어줘', '붙여넣어주세요', '붙여넣어', '붙여줘', '붙여주세요']

describe('기본 단어 목록', () => {
  const { pack, errors } = parseIntentPack(raw)

  it('오류 없이 읽힌다', () => {
    expect(errors).toEqual([])
    expect(pack).not.toBeNull()
    expect(INTENTS_FORMAT).toBe('sure-mate-intents')
  })

  it('군말·조사는 설계 원문과 같다', () => {
    expect(pack!.fillers).toEqual(FILLERS)
    expect(pack!.particles).toEqual(PARTICLES)
  })

  it('어미는 설계 원문과 추가분을 모두 포함한다', () => {
    for (const e of [...ENDINGS, ...EXTRA_ENDINGS]) expect(pack!.endings).toContain(e)
  })

  it('규칙 id는 서로 다르고 설계 단어를 모두 포함한다', () => {
    const ids = pack!.intents.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const [id, words] of Object.entries(INTENT_WORDS)) {
      const rule = pack!.intents.find((r) => r.id === id)!
      for (const w of words) expect(rule.words).toContain(w)
    }
  })

  it('가명 분류의 좁은 규칙 두 개', () => {
    const get = (id: string) => pack!.intents.find((r) => r.id === id)!
    expect(get('unmask').targets).toEqual([{ id: 'cmd.unmask' }])
    expect(get('mask-selection').words).toEqual(['가려'])
    expect(get('workspace-save').targets).toEqual([{ id: 'cmd.workspace-save' }])
  })
})

describe('parseIntentPack 검증', () => {
  const base = () => ({
    format: 'sure-mate-intents',
    version: 1,
    fillers: ['좀'],
    endings: ['줘'],
    particles: ['는'],
    intents: [{ id: 'a', label: '가', words: ['뜻'], targets: [{ group: 'wiki' }] }]
  })

  it('형식이 다르면 pack null', () => {
    expect(parseIntentPack({ ...base(), format: 'x' }).pack).toBeNull()
    expect(parseIntentPack(null).pack).toBeNull()
    expect(parseIntentPack('abc').pack).toBeNull()
  })

  it('21자 단어·숫자·중복·빈 값은 제외하고 오류 문구에 단어 내용이 없다', () => {
    const long = '가'.repeat(21)
    const r = parseIntentPack({ ...base(), fillers: ['좀', ' 좀 ', long, 5, ''], endings: ['줘', '비밀단어'.repeat(6)] })
    expect(r.pack!.fillers).toEqual(['좀'])
    expect(r.pack!.endings).toEqual(['줘'])
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.errors.join('\n')).not.toContain('비밀단어')
    expect(r.errors.join('\n')).not.toContain(long)
  })

  it('모르는 group은 대상에서 제외, 대상이 없는 규칙은 제외', () => {
    const b = base()
    ;(b as { intents: unknown[] }).intents = [
      { id: 'a', label: '가', words: ['뜻'], targets: [{ group: 'wiki' }, { group: 'nope' } as never] },
      { id: 'b', label: '나', words: ['뜻'], targets: [{ group: 'nope' } as never] },
      { id: 'a', label: '중복', words: ['뜻'], targets: [{ id: 'cmd.x' }] },
      { id: 'BAD ID', label: '다', words: ['뜻'], targets: [{ id: 'cmd.x' }] }
    ]
    const r = parseIntentPack(b)
    expect(r.pack!.intents.map((x) => x.id)).toEqual(['a'])
    expect(r.pack!.intents[0].targets).toEqual([{ group: 'wiki' }])
    expect(r.errors.length).toBeGreaterThanOrEqual(3)
  })

  it('규칙이 모두 비면 null', () => {
    expect(parseIntentPack({ ...base(), intents: [] }).pack).toBeNull()
  })

  it('목록은 300개까지', () => {
    const many = Array.from({ length: 400 }, (_, i) => `단${i}`)
    expect(parseIntentPack({ ...base(), endings: many }).pack!.endings).toHaveLength(300)
  })
})
