import { expect, it } from 'vitest'
import builtin from '../../../resources/prompts.json'
import { parseTemplatePack } from './pack'

const allBuiltin = (): ReturnType<typeof parseTemplatePack>['templates'] => parseTemplatePack(builtin, 'builtin').templates
const builtinTemplates = (): ReturnType<typeof parseTemplatePack>['templates'] => allBuiltin().filter((t) => t.kind === 'prompt')

it('기본 팩: 프롬프트 9종, 오류 없음, id 중복 없음', () => {
  const { templates, errors } = parseTemplatePack(builtin, 'builtin')
  expect(errors).toEqual([])
  expect(templates.filter((t) => t.kind === 'prompt')).toHaveLength(9)
  expect(new Set(templates.map((t) => t.id)).size).toBe(templates.length)
  expect(templates.every((t) => t.scope === 'builtin')).toBe(true)
})

it('기본 상용구 2종: 결함 리포트·메일 서명, 가명 처리 자리 없음', () => {
  const snippets = allBuiltin().filter((t) => t.kind === 'snippet')
  expect(snippets.map((t) => t.id)).toEqual(['defect-report', 'mail-signature'])
  expect(snippets[0].aliases).toEqual(['이슈', '결함', 'issue', 'bug'])
  expect(snippets[1].aliases).toEqual(['서명', 'signature'])
})

it('설계 문서 §7 표의 이름 9개를 순서대로 담는다', () => {
  expect(builtinTemplates().map((t) => t.name)).toEqual([
    '회의록 정리',
    '주간보고 초안',
    'Ttree 근무 기록 → 주간보고',
    '메일·문의 요약과 회신 초안',
    '문장 다듬기',
    '요구사항 → 테스트 케이스',
    '정적분석 위반 분석·소명 초안',
    '표준·규격 조항 찾기',
    '협업 문서 요약(실명 유지)'
  ])
})

it('기본 프롬프트는 모두 입력 자리, 추측 금지, 초안 안내, 용어 자리를 담는다', () => {
  for (const t of builtinTemplates()) {
    expect(t.body, t.name).toContain('{{selection}}')
    expect(t.body, t.name).toContain('추측하지')
    expect(t.body, t.name).toContain('초안')
    expect(t.body, t.name).toContain('{{terms}}')
  }
})

it('가명 기본값: 표준·규격 조항 찾기와 협업 문서 요약만 끔, 나머지 7종은 전체 기본값(설정)을 따른다', () => {
  const templates = builtinTemplates()
  expect(templates.filter((t) => t.masking === 'off').map((t) => t.name)).toEqual(['표준·규격 조항 찾기', '협업 문서 요약(실명 유지)'])
  const rest = templates.filter((t) => t.masking !== 'off')
  expect(rest).toHaveLength(7)
  expect(rest.every((t) => t.masking === undefined || t.masking === 'default')).toBe(true)
})

it('내 말투 자리: 회의록 정리·주간보고 초안·Ttree 근무 기록·메일 회신만, 입력(---) 앞에 둔다', () => {
  const styled = builtinTemplates()
    .map((t) => ({ id: t.id, kinds: [...t.body.matchAll(/\{\{style:([^}]*)\}\}/g)].map((m) => m[1]), body: t.body }))
    .filter((t) => t.kinds.length)
  expect(styled.map((t) => [t.id, t.kinds])).toEqual([
    ['meeting-notes', ['회의록']],
    ['weekly-report', ['주간보고']],
    ['ttree-worklog', ['주간보고']],
    ['mail-reply', ['메일']]
  ])
  for (const t of styled) expect(t.body.indexOf('{{style:'), t.id).toBeLessThan(t.body.indexOf('---\n입력:'))
})

it('기본 프롬프트마다 영문 입력용 별칭이 하나 이상 있다', () => {
  for (const t of builtinTemplates()) expect(t.aliases.some((a) => /^[a-z]+$/.test(a)), t.name).toBe(true)
})

it('잘못된 항목은 건너뛰고 이유를 남긴다', () => {
  const ok = { id: 'ok', name: '좋음', aliases: [], kind: 'prompt', body: '{{selection}}' }
  const raw = {
    format: 'sure-mate-templates',
    version: 1,
    templates: [
      ok,
      { ...ok, id: 'Bad Id' },
      { ...ok, id: 'empty-name', name: '' },
      { ...ok, id: 'long-name', name: '가'.repeat(41) },
      { ...ok, id: 'long-body', body: 'x'.repeat(20001) },
      { ...ok, id: 'bad-masking', masking: 'maybe' },
      'not an object'
    ]
  }
  const r = parseTemplatePack(raw, 'personal')
  expect(r.templates.map((t) => t.id)).toEqual(['ok'])
  expect(r.templates[0].scope).toBe('personal')
  expect(r.errors).toHaveLength(6)
})

it('형식이 다르면 전체를 거절한다', () => {
  expect(parseTemplatePack({ format: 'other', templates: [] }, 'imported').errors[0]).toContain('형식')
  expect(parseTemplatePack(null, 'imported').templates).toEqual([])
})
