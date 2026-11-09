import { expect, it } from 'vitest'
import { wikiSaveErrorText } from '../../../shared/glossary/save-error'
import type { GlossaryEntry } from '../../../shared/glossary/types'
import { entryToForm, formToDraft, saveRejected, type WikiForm } from './wiki-form'

const form = (over: Partial<WikiForm> = {}): WikiForm => ({
  term: 'MC/DC',
  aliases: 'MCDC, 변경 조건/결정 커버리지',
  definition: '조건마다 결정을 독립적으로 바꾸는지 보는 커버리지',
  example: '',
  links: '',
  tags: '커버리지',
  ...over
})

it('쉼표로 나눈 별칭·태그와 "제목 | 주소" 링크 줄을 항목으로 바꾼다', () => {
  const r = formToDraft(form({ links: '설명 문서 | https://example.com/a\nhttps://example.com/b' }))
  expect(r.errors).toEqual([])
  expect(r.draft).toEqual({
    term: 'MC/DC',
    aliases: ['MCDC', '변경 조건/결정 커버리지'],
    definition: '조건마다 결정을 독립적으로 바꾸는지 보는 커버리지',
    links: [
      { title: '설명 문서', url: 'https://example.com/a' },
      { title: 'https://example.com/b', url: 'https://example.com/b' }
    ],
    tags: ['커버리지']
  })
})

it('빈 용어·설명, 60자 넘는 용어, 1,000자 넘는 설명, 500자 넘는 사용 예는 알린다', () => {
  expect(formToDraft(form({ term: ' ' })).errors).toEqual([expect.stringContaining('용어')])
  expect(formToDraft(form({ term: '가'.repeat(61) })).errors).toEqual([expect.stringContaining('60자')])
  expect(formToDraft(form({ definition: '' })).errors).toEqual([expect.stringContaining('설명')])
  expect(formToDraft(form({ definition: '나'.repeat(1001) })).errors).toEqual([expect.stringContaining('1,000자')])
  expect(formToDraft(form({ example: '다'.repeat(501) })).errors).toEqual([expect.stringContaining('500자')])
})

it('링크는 http/https만 5개까지, 태그는 5개까지', () => {
  expect(formToDraft(form({ links: '나쁜 링크 | javascript:alert(1)' })).errors).toEqual([expect.stringContaining('http')])
  const six = Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`).join('\n')
  expect(formToDraft(form({ links: six })).errors).toEqual([expect.stringContaining('5개')])
  expect(formToDraft(form({ tags: '1, 2, 3, 4, 5, 6' })).errors).toEqual([expect.stringContaining('5개')])
})

it('저장 요청이 거부되면(main 오류·IPC 실패) 오류 원문(사용자 폴더 경로) 대신 제품 문구로 알린다', () => {
  const locked = new Error(
    "Error invoking remote method 'wiki:save': Error: EPERM: operation not permitted, rename 'C:\\Users\\가상사용자\\AppData\\Roaming\\Sure-Mate\\glossary.json.1.tmp' -> 'C:\\Users\\가상사용자\\AppData\\Roaming\\Sure-Mate\\glossary.json'"
  )
  const r = saveRejected(locked)
  expect(r).toEqual({ ok: false, errors: [wikiSaveErrorText('EPERM')] })
  expect(JSON.stringify(r)).not.toMatch(/Users|가상사용자|AppData|glossary\.json|EPERM|rename/)
  expect(saveRejected(new Error("No handler registered for 'wiki:save'"))).toEqual({ ok: false, errors: [wikiSaveErrorText()] })
  expect(saveRejected('연결 끊김')).toEqual({ ok: false, errors: [wikiSaveErrorText()] })
})

it('고칠 항목은 폼으로, 새 항목은 검색어를 용어로 미리 채운다', () => {
  const entry: GlossaryEntry = {
    id: 'mcdc',
    term: 'MC/DC',
    aliases: ['MCDC'],
    definition: '설명',
    example: '예',
    links: [{ title: '문서', url: 'https://example.com' }],
    tags: ['커버리지', '기능안전'],
    source: 'builtin',
    updatedAt: '2026-11-09T00:00:00.000Z',
    version: 1
  }
  expect(entryToForm(entry)).toEqual({ term: 'MC/DC', aliases: 'MCDC', definition: '설명', example: '예', links: '문서 | https://example.com', tags: '커버리지, 기능안전' })
  expect(entryToForm(undefined, '정적분석')).toEqual({ term: '정적분석', aliases: '', definition: '', example: '', links: '', tags: '' })
})
