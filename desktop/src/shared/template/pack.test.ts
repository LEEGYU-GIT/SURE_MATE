import { expect, it } from 'vitest'
import builtin from '../../../resources/prompts.json'
import { parseTemplatePack } from './pack'

const builtinTemplates = (): ReturnType<typeof parseTemplatePack>['templates'] => parseTemplatePack(builtin, 'builtin').templates

it('기본 프롬프트 팩: 8종, 오류 없음, id 중복 없음, 모두 prompt', () => {
  const { templates, errors } = parseTemplatePack(builtin, 'builtin')
  expect(errors).toEqual([])
  expect(templates).toHaveLength(8)
  expect(new Set(templates.map((t) => t.id)).size).toBe(8)
  expect(templates.every((t) => t.kind === 'prompt' && t.scope === 'builtin')).toBe(true)
})

it('설계 문서 §7 표의 이름 8개를 순서대로 담는다', () => {
  expect(builtinTemplates().map((t) => t.name)).toEqual([
    '회의록 정리',
    '주간보고 초안',
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

it('가명 기본값: 표준·규격 조항 찾기와 협업 문서 요약만 끔, 나머지 6종은 전체 기본값(설정)을 따른다', () => {
  const templates = builtinTemplates()
  expect(templates.filter((t) => t.masking === 'off').map((t) => t.name)).toEqual(['표준·규격 조항 찾기', '협업 문서 요약(실명 유지)'])
  const rest = templates.filter((t) => t.masking !== 'off')
  expect(rest).toHaveLength(6)
  expect(rest.every((t) => t.masking === undefined || t.masking === 'default')).toBe(true)
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
