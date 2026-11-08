import { expect, it } from 'vitest'
import { allAiTargets, BUILTIN_AI_TARGETS, isOpenableUrl, pickAiTarget, sanitizeAiTargets } from './ai-targets'

it('http/https 주소만 연다', () => {
  expect(isOpenableUrl('https://claude.ai')).toBe(true)
  expect(isOpenableUrl('http://llm.intra.example/chat')).toBe(true)
  expect(isOpenableUrl('javascript:alert(1)')).toBe(false)
  expect(isOpenableUrl('file:///c:/x')).toBe(false)
  expect(isOpenableUrl('not a url')).toBe(false)
})

it('기본 AI 대상 4개(설계 문서 §7)', () => {
  expect(BUILTIN_AI_TARGETS.map((t) => [t.id, t.name, t.url ?? null])).toEqual([
    ['claude', 'Claude', 'https://claude.ai'],
    ['chatgpt', 'ChatGPT', 'https://chatgpt.com'],
    ['gemini', 'Gemini', 'https://gemini.google.com'],
    ['copy', '복사만', null]
  ])
})

it('사용자 대상은 기본 뒤에 붙고, 기본과 id가 같으면 기본이 이긴다', () => {
  const list = allAiTargets([
    { id: 'claude', name: '가짜', url: 'https://evil.example' },
    { id: 'intra', name: '사내 LLM', url: 'https://llm.intra.example' }
  ])
  expect(list.map((t) => t.id)).toEqual(['claude', 'chatgpt', 'gemini', 'copy', 'intra'])
  expect(list[0].name).toBe('Claude')
})

it('고를 대상: 이번 실행 > 템플릿 > 기본값 > claude, 없는 id는 다음 단계로', () => {
  const targets = allAiTargets([])
  expect(pickAiTarget({ override: 'gemini', template: 'chatgpt', defaultId: 'copy', targets }).id).toBe('gemini')
  expect(pickAiTarget({ template: 'chatgpt', defaultId: 'copy', targets }).id).toBe('chatgpt')
  expect(pickAiTarget({ defaultId: 'copy', targets }).id).toBe('copy')
  expect(pickAiTarget({ override: 'nope', template: 'nope', defaultId: 'nope', targets }).id).toBe('claude')
})

it('사용자 대상 검사: id·이름이 있고 주소가 http/https일 때만', () => {
  const list = sanitizeAiTargets([
    { id: 'ok', name: '사내', url: 'https://x.example' },
    { id: 'bad-url', name: '나쁨', url: 'javascript:alert(1)' },
    { id: '', name: '빈 id', url: 'https://x.example' },
    { name: 'id 없음' },
    'not object',
    { id: 'nourl', name: '주소 없음' }
  ])
  expect(list.map((t) => t.id)).toEqual(['ok'])
})
