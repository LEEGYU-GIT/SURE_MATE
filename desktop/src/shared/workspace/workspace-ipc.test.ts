import { describe, expect, it } from 'vitest'
import { parseWorkspaceEdit, parseWorkspaceId, parseWorkspaceName } from './workspace-ipc'

const rule = { id: 'r1', enabled: true, titleIncludes: '보고서', monitor: '1920x1080@100:0,0' }
const edit = { name: 'QA 모드', aliases: ['qa', '시험'], rules: [rule, { ...rule, id: 'r2', enabled: false, titleIncludes: null }] }

describe('parseWorkspaceId', () => {
  it('영문·숫자·하이픈 1~64자만 받는다', () => {
    expect(parseWorkspaceId('ws-1')).toBe('ws-1')
    expect(parseWorkspaceId('3f2a9c1e-0b7d-4c55-9e3a-1d2b3c4d5e6f')).toBe('3f2a9c1e-0b7d-4c55-9e3a-1d2b3c4d5e6f')
    expect(parseWorkspaceId('a'.repeat(64))).toBe('a'.repeat(64))
    for (const bad of ['a/b', 'a'.repeat(65), '', 'ws 1', '../x', 7, null, undefined, { id: 'ws-1' }]) expect(parseWorkspaceId(bad)).toBeNull()
  })
})

describe('parseWorkspaceName', () => {
  it('앞뒤 공백을 빼고 1~40자만 받는다', () => {
    expect(parseWorkspaceName(' QA 모드 ')).toBe('QA 모드')
    expect(parseWorkspaceName('가'.repeat(40))).toBe('가'.repeat(40))
    for (const bad of ['  ', '', 'x'.repeat(41), 3, null, ['QA']]) expect(parseWorkspaceName(bad)).toBeNull()
  })
})

describe('parseWorkspaceEdit(모양만 본다, 내용 검사는 applyWorkspaceEdit)', () => {
  it('맞는 모양은 쓰는 칸만 골라 돌려준다', () => {
    expect(parseWorkspaceEdit(edit)).toEqual(edit)
    const extra = { ...edit, hotkey: 'Ctrl+Alt+1', rules: [{ ...rule, savedTitle: 'x' }] }
    expect(parseWorkspaceEdit(extra)).toEqual({ name: 'QA 모드', aliases: ['qa', '시험'], rules: [rule] })
  })

  it('이름 200자, 별칭 20개, 규칙 40개까지(내용 제한보다 넉넉하게: 넘는 값은 편집 오류로 알린다)', () => {
    expect(parseWorkspaceEdit({ ...edit, name: 'x'.repeat(200), aliases: Array.from({ length: 20 }, () => 'a') })).not.toBeNull()
    expect(parseWorkspaceEdit({ ...edit, rules: Array.from({ length: 40 }, (_, i) => ({ ...rule, id: `r${i}` })) })).not.toBeNull()
    expect(parseWorkspaceEdit({ ...edit, name: 'x'.repeat(201) })).toBeNull()
    expect(parseWorkspaceEdit({ ...edit, aliases: Array.from({ length: 21 }, () => 'a') })).toBeNull()
    expect(parseWorkspaceEdit({ ...edit, rules: Array.from({ length: 41 }, (_, i) => ({ ...rule, id: `r${i}` })) })).toBeNull()
  })

  it('칸 타입이 틀리면 null', () => {
    const bads: unknown[] = [
      null,
      'edit',
      [],
      { ...edit, name: 3 },
      { ...edit, aliases: 'qa' },
      { ...edit, aliases: ['qa', 1] },
      { ...edit, rules: {} },
      { ...edit, rules: [{ ...rule, enabled: 'yes' }] },
      { ...edit, rules: [{ ...rule, id: 'a/b' }] },
      { ...edit, rules: [{ ...rule, titleIncludes: 5 }] },
      { ...edit, rules: [{ ...rule, titleIncludes: undefined }] },
      { ...edit, rules: [{ ...rule, titleIncludes: 'x'.repeat(201) }] },
      { ...edit, rules: [{ ...rule, monitor: '' }] },
      { ...edit, rules: [{ ...rule, monitor: 'm'.repeat(65) }] },
      { ...edit, rules: ['r1'] }
    ]
    for (const bad of bads) expect(parseWorkspaceEdit(bad)).toBeNull()
  })
})
