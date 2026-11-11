import { describe, expect, it } from 'vitest'
import { applyWorkspaceEdit, EDIT_ERRORS, type WorkspaceEdit } from './edit'
import { monitorKey } from './monitors'
import { L, P } from './test-monitors'
import { testWorkspace } from './test-workspaces'
import type { SavedLayout, Workspace } from './types'

const NOW = new Date('2026-11-11T09:00:00.000Z')
const layoutOf = (w: Workspace): SavedLayout => Object.values(w.layouts)[0]

/** 지금 값 그대로인 편집 */
const editOf = (w: Workspace): WorkspaceEdit => ({
  name: w.name,
  aliases: [...w.aliases],
  rules: layoutOf(w).windows.map((r) => ({ id: r.id, enabled: r.enabled, titleIncludes: r.match.titleIncludes ?? null, monitor: r.target.monitor }))
})

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.freeze(v)
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k])
  }
  return v
}

const ws = deepFreeze(testWorkspace())
const apply = (over: Partial<WorkspaceEdit>, others: Workspace[] = []): ReturnType<typeof applyWorkspaceEdit> =>
  applyWorkspaceEdit(ws, { ...editOf(ws), ...over }, others, NOW)
const ok = (r: ReturnType<typeof applyWorkspaceEdit>): Workspace => {
  if (!r.ok) throw new Error(r.errors.join(', '))
  return r.workspace
}
const rulesOf = (w: Workspace): SavedLayout['windows'] => layoutOf(w).windows

describe('applyWorkspaceEdit', () => {
  it('바꾸지 않은 편집은 같은 값이고 updatedAt만 now(원본은 그대로)', () => {
    const r = ok(apply({}))
    expect(r).toEqual({ ...ws, updatedAt: NOW.toISOString() })
    expect(ws.updatedAt).toBe('2026-11-10T09:00:00.000Z')
  })

  it('이름은 앞뒤 공백을 빼고, 비었거나 40자를 넘으면 오류', () => {
    expect(ok(apply({ name: '  보고서 모드  ' })).name).toBe('보고서 모드')
    expect(apply({ name: '   ' })).toEqual({ ok: false, errors: [EDIT_ERRORS.nameEmpty] })
    expect(apply({ name: 'x'.repeat(41) })).toEqual({ ok: false, errors: [EDIT_ERRORS.nameLong] })
    expect(ok(apply({ name: 'x'.repeat(40) })).name).toHaveLength(40)
  })

  it('다른 워크스페이스 이름과 compactOf가 같으면 오류(자기 이름은 괜찮음)', () => {
    const other = testWorkspace({ id: 'ws-other', name: 'QA 모드' })
    const mine = testWorkspace({ id: 'ws-mine', name: '배치 1' })
    const r = applyWorkspaceEdit(mine, { ...editOf(mine), name: 'qa 모드' }, [other], NOW)
    expect(r).toEqual({ ok: false, errors: ['같은 이름의 워크스페이스가 있어요. 다른 이름을 적어 주세요'] })
    expect(ok(apply({ name: 'qa모드' }, [testWorkspace({ id: 'ws-x', name: '회의 모드' })])).name).toBe('qa모드')
  })

  it('별칭: 앞뒤 공백·빈 칸·중복(compactOf)을 뺀다(쉼표로 나누기는 편집 화면이 한다)', () => {
    expect(ok(apply({ aliases: ['qa', ' 시험'] })).aliases).toEqual(['qa', '시험'])
    expect(ok(apply({ aliases: ['qa', '', '  ', 'QA', '시험', 'Q A'] })).aliases).toEqual(['qa', '시험'])
  })

  it('별칭이 10개를 넘거나 하나가 40자를 넘으면 오류', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `별칭${i}`)
    expect(apply({ aliases: eleven })).toEqual({ ok: false, errors: ['별칭은 10개, 하나에 40자까지예요'] })
    expect(apply({ aliases: ['y'.repeat(41)] })).toEqual({ ok: false, errors: [EDIT_ERRORS.aliases] })
    expect(ok(apply({ aliases: Array.from({ length: 10 }, (_, i) => `a${i}`) })).aliases).toHaveLength(10)
  })

  it('규칙: 끄기, 제목 조건 바꾸기·빈 글이면 삭제, 대상 모니터 바꾸기(첫 배치에서 id로 찾는다)', () => {
    const [r1, r2, r3] = rulesOf(ws)
    expect(r1.match.titleIncludes).toBe('가상자동차 보고서.xlsx')
    const edit = editOf(ws)
    edit.rules = [
      { ...edit.rules[0], enabled: false, titleIncludes: '' },
      { ...edit.rules[1], titleIncludes: '  예산  ' },
      { ...edit.rules[2], titleIncludes: null, monitor: monitorKey(P) }
    ]
    const next = rulesOf(ok(applyWorkspaceEdit(ws, edit, [], NOW)))
    expect(next[0]).toEqual({ ...r1, enabled: false, match: { exe: 'EXCEL.EXE', className: 'XLMAIN' } })
    expect(next[1].match.titleIncludes).toBe('예산')
    expect(next[2]).toEqual({ ...r3, target: { ...r3.target, monitor: monitorKey(P) } })
    expect(r2.match.titleIncludes).toBe('XY방산 예산.xlsx')
  })

  it('오류 문구: 해요체로 무엇이 문제인지(와 고칠 방법), 앱의 다른 입력칸과 같은 "N자까지예요" 꼴', () => {
    expect(EDIT_ERRORS).toEqual({
      nameEmpty: '이름을 적어 주세요',
      nameLong: '이름은 40자까지예요',
      nameTaken: '같은 이름의 워크스페이스가 있어요. 다른 이름을 적어 주세요',
      aliases: '별칭은 10개, 하나에 40자까지예요',
      titleLong: '‘제목에 포함’은 100자까지예요',
      monitor: '대상 모니터를 찾지 못했어요. 대상 모니터 단추로 다시 골라 주세요'
    })
  })

  it('제목 조건이 100자를 넘으면 오류', () => {
    const edit = editOf(ws)
    edit.rules[0] = { ...edit.rules[0], titleIncludes: 'z'.repeat(101) }
    expect(applyWorkspaceEdit(ws, edit, [], NOW)).toEqual({ ok: false, errors: [EDIT_ERRORS.titleLong] })
    edit.rules[0] = { ...edit.rules[0], titleIncludes: 'z'.repeat(100) }
    expect(rulesOf(ok(applyWorkspaceEdit(ws, edit, [], NOW)))[0].match.titleIncludes).toHaveLength(100)
  })

  it('대상 모니터가 그 배치의 모니터 키가 아니면 오류', () => {
    const edit = editOf(ws)
    edit.rules[2] = { ...edit.rules[2], monitor: '1280x720@100:5000,0' }
    expect(applyWorkspaceEdit(ws, edit, [], NOW)).toEqual({ ok: false, errors: ['대상 모니터를 찾지 못했어요. 대상 모니터 단추로 다시 골라 주세요'] })
    edit.rules[2] = { ...edit.rules[2], monitor: monitorKey(L) }
    expect(applyWorkspaceEdit(ws, edit, [], NOW).ok).toBe(true)
  })

  it('모르는 규칙 id는 무시하고, 편집에 없는 규칙은 그대로', () => {
    const edit = editOf(ws)
    edit.rules = [{ id: 'nope', enabled: false, titleIncludes: 'x', monitor: 'bad' }, { ...edit.rules[1], enabled: false }]
    const next = rulesOf(ok(applyWorkspaceEdit(ws, edit, [], NOW)))
    expect(next.map((r) => r.enabled)).toEqual([true, false, true])
    expect(next[0]).toBe(rulesOf(ws)[0])
  })

  it('오류가 여러 개면 모두 돌려준다', () => {
    const edit = { ...editOf(ws), name: '', aliases: Array.from({ length: 11 }, (_, i) => `b${i}`) }
    edit.rules[0] = { ...edit.rules[0], monitor: 'bad' }
    expect(applyWorkspaceEdit(ws, edit, [], NOW)).toEqual({ ok: false, errors: [EDIT_ERRORS.nameEmpty, EDIT_ERRORS.aliases, EDIT_ERRORS.monitor] })
  })
})
