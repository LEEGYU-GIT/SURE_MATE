import { expect, it } from 'vitest'
import type { Template } from '../../../shared/template/types'
import { insertPlaceholder, previewTemplate, templateSource } from './template-editor'

it('자리표시자는 커서 자리에 넣고, 고른 글이 있으면 바꾼다', () => {
  expect(insertPlaceholder('정리해 줘\n', 6, 6, '{{selection}}')).toEqual({ body: '정리해 줘\n{{selection}}', caret: 19 })
  expect(insertPlaceholder('A [여기] B', 2, 6, '{{date}}')).toEqual({ body: 'A {{date}} B', caret: 10 })
})

it('미리 보기: 가상 회의 메모를 넣고, 모르는 자리표시자·선택한 글 자리가 없음은 경고로', () => {
  const ok = previewTemplate('회의록으로 정리해 줘\n{{selection}}')
  expect(ok.text).toContain('가상자동차')
  expect(ok.warnings).toEqual([])
  expect(previewTemplate('정리 {{unknown}}').warnings.length).toBeGreaterThan(0)
})

it('출처: 기본, 기본을 고침, 내 것, 다른 파일', () => {
  const t = (id: string, scope: Template['scope']): Template => ({ id, name: id, aliases: [], kind: 'prompt', body: 'x', scope })
  const mine = new Set(['meeting-notes', 'my-1'])
  const builtinIds = new Set(['meeting-notes', 'polish'])
  expect(templateSource(t('polish', 'builtin'), mine, builtinIds)).toBe('builtin')
  expect(templateSource(t('meeting-notes', 'personal'), mine, builtinIds)).toBe('builtin-edited')
  expect(templateSource(t('my-1', 'personal'), mine, builtinIds)).toBe('mine')
  expect(templateSource(t('team-1', 'personal'), mine, builtinIds)).toBe('other')
  expect(templateSource(t('pack-1', 'imported'), mine, builtinIds)).toBe('other')
})
