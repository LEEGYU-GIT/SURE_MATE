import { describe, expect, it } from 'vitest'
import { applyWorkspaceEdit } from '../../../shared/workspace/edit'
import { monitorKey, toSavedMonitor } from '../../../shared/workspace/monitors'
import { L, P } from '../../../shared/workspace/test-monitors'
import { testWorkspace } from '../../../shared/workspace/test-workspaces'
import type { Workspace } from '../../../shared/workspace/types'
import { parseWorkspaceEdit } from '../../../shared/workspace/workspace-ipc'
import {
  draftFromWorkspace,
  draftToEdit,
  fieldEdit,
  isDraftDirty,
  nextMonitor,
  rebaseDraft,
  ruleCaption,
  splitAliases,
  type WorkspaceDraft
} from './workspace-editor-state'

const KP = monitorKey(P)
const KL = monitorKey(L)
const NOW = new Date('2026-11-11T09:00:00.000Z')

/** 첫 배치의 규칙 r1·r2(Excel 두 개, 주 모니터)·r3(메모장, 내장 화면) */
const ws = testWorkspace()
const withRule = (d: WorkspaceDraft, id: string, patch: Partial<WorkspaceDraft['rules'][number]>): WorkspaceDraft => ({
  ...d,
  rules: d.rules.map((r) => (r.id === id ? { ...r, ...patch } : r))
})

describe('초안(편집 칸의 글)과 편집 값', () => {
  it('워크스페이스 → 초안: 별칭은 쉼표로 잇고, 제목 조건이 없으면 빈 칸', () => {
    expect(draftFromWorkspace(ws)).toEqual({
      name: 'QA 모드',
      aliases: 'qa',
      rules: [
        { id: 'r1', enabled: true, titleIncludes: '가상자동차 보고서.xlsx', monitor: KP },
        { id: 'r2', enabled: true, titleIncludes: 'XY방산 예산.xlsx', monitor: KP },
        { id: 'r3', enabled: true, titleIncludes: '', monitor: KL }
      ]
    })
    expect(draftFromWorkspace({ ...ws, aliases: ['qa', '시험'] }).aliases).toBe('qa, 시험')
  })

  it('초안 → 편집 값 → 적용하면 처음과 같다(빈 제목 조건은 null: IPC 검사가 undefined를 받지 않는다)', () => {
    const edit = draftToEdit(draftFromWorkspace(ws))
    expect(edit.rules[2].titleIncludes).toBeNull()
    expect(parseWorkspaceEdit(edit)).toEqual(edit)
    const r = applyWorkspaceEdit(ws, edit, [], NOW)
    expect(r.ok && { ...r.workspace, updatedAt: ws.updatedAt }).toEqual(ws)
  })

  it('별칭은 쉼표(,)·전각 쉼표(，)·모점(、)으로 나누고 앞뒤 공백·빈 칸을 뺀다', () => {
    expect(splitAliases('qa, 시험，테스트、 ')).toEqual(['qa', '시험', '테스트'])
    expect(draftToEdit({ ...draftFromWorkspace(ws), aliases: 'qa, 시험，테스트、 ' }).aliases).toEqual(['qa', '시험', '테스트'])
    expect(splitAliases('  ,，、')).toEqual([])
  })

  it('바뀐 칸이 있는지: 처음은 false, 체크·이름을 바꾸면 true, 앞뒤 공백만 다르면 false', () => {
    const d = draftFromWorkspace(ws)
    expect(isDraftDirty(d, ws)).toBe(false)
    expect(isDraftDirty(withRule(d, 'r1', { enabled: false }), ws)).toBe(true)
    expect(isDraftDirty({ ...d, name: '보고서 모드' }, ws)).toBe(true)
    expect(isDraftDirty({ ...d, name: ' QA 모드 ', aliases: ' qa ' }, ws)).toBe(false)
  })

  it('대상 모니터 단추: 저장한 순서대로 다음 모니터, 끝에서 처음으로, 모르는 키는 첫 모니터', () => {
    const monitors = [toSavedMonitor(P), toSavedMonitor(L)]
    expect(nextMonitor(KP, monitors)).toBe(KL)
    expect(nextMonitor(KL, monitors)).toBe(KP)
    expect(nextMonitor('nope', monitors)).toBe(KP)
    expect(nextMonitor(KP, [toSavedMonitor(P)])).toBe(KP)
    expect(nextMonitor(KP, [])).toBe(KP)
  })

  it('창 이름: 프로그램 이름과, 저장할 때 제목에서 프로그램 이름을 뺀 나머지', () => {
    const [r1, , r3] = ws.layouts[Object.keys(ws.layouts)[0]].windows
    expect(ruleCaption(r1)).toEqual({ app: 'Excel', title: '가상자동차 보고서.xlsx' })
    expect(ruleCaption(r3)).toEqual({ app: 'Windows 메모장', title: 'SureMate-WS-A' })
    expect(ruleCaption({ savedTitle: 'SureMate-WS-B', match: { exe: 'powershell.exe' } })).toEqual({ app: 'powershell', title: 'SureMate-WS-B' })
    expect(ruleCaption({ savedTitle: '', match: { exe: 'EXCEL.EXE' } })).toEqual({ app: 'EXCEL', title: '' })
  })
})

describe('그 자리 저장(fieldEdit): 칸 하나를 저장할 때 보낼 편집 값', () => {
  // 이름을 고치는 중에 다른 칸(별칭·체크)도 아직 저장하지 않은 글이 있다
  const busy: WorkspaceDraft = withRule({ ...draftFromWorkspace(ws), name: '보고서 모드', aliases: 'qa, 시험' }, 'r1', { enabled: false })

  it('그 칸만 적은 값, 나머지는 마지막으로 저장된 값(다른 칸의 틀린 글이 이 저장을 막지 않게)', () => {
    expect(fieldEdit(ws, busy, { kind: 'name' })).toEqual({ ...draftToEdit(draftFromWorkspace(ws)), name: '보고서 모드' })
    expect(fieldEdit(ws, busy, { kind: 'aliases' })).toEqual({ ...draftToEdit(draftFromWorkspace(ws)), aliases: ['qa', '시험'] })
    const saved = draftToEdit(draftFromWorkspace(ws))
    expect(fieldEdit(ws, busy, { kind: 'rule', id: 'r1', prop: 'enabled' })).toEqual({
      ...saved,
      rules: saved.rules.map((r) => (r.id === 'r1' ? { ...r, enabled: false } : r))
    })
  })

  it('제목 조건·대상 모니터는 그 규칙의 그 값만, 빈 제목 조건은 null', () => {
    const d = withRule(withRule(draftFromWorkspace(ws), 'r3', { titleIncludes: ' SureMate ', monitor: KP }), 'r1', { titleIncludes: '' })
    const saved = draftToEdit(draftFromWorkspace(ws))
    expect(fieldEdit(ws, d, { kind: 'rule', id: 'r3', prop: 'titleIncludes' })?.rules).toEqual(
      saved.rules.map((r) => (r.id === 'r3' ? { ...r, titleIncludes: 'SureMate' } : r))
    )
    expect(fieldEdit(ws, d, { kind: 'rule', id: 'r3', prop: 'monitor' })?.rules).toEqual(saved.rules.map((r) => (r.id === 'r3' ? { ...r, monitor: KP } : r)))
    expect(fieldEdit(ws, d, { kind: 'rule', id: 'r1', prop: 'titleIncludes' })?.rules[0].titleIncludes).toBeNull()
    const edit = fieldEdit(ws, d, { kind: 'rule', id: 'r1', prop: 'titleIncludes' })
    expect(parseWorkspaceEdit(edit)).toEqual(edit)
  })

  it('저장된 값과 같으면(앞뒤 공백만 다름 포함) 보내지 않는다(null). 없는 규칙도 null', () => {
    const d = { ...draftFromWorkspace(ws), name: '  QA 모드 ', aliases: ' qa ,' }
    expect(fieldEdit(ws, d, { kind: 'name' })).toBeNull()
    expect(fieldEdit(ws, d, { kind: 'aliases' })).toBeNull()
    expect(fieldEdit(ws, withRule(d, 'r2', { titleIncludes: ' XY방산 예산.xlsx ' }), { kind: 'rule', id: 'r2', prop: 'titleIncludes' })).toBeNull()
    expect(fieldEdit(ws, d, { kind: 'rule', id: 'zz', prop: 'enabled' })).toBeNull()
  })

  it('배치가 없는 워크스페이스도 이름·별칭은 보낸다(규칙 없음)', () => {
    const empty: Workspace = { ...ws, layouts: {} }
    expect(fieldEdit(empty, { ...draftFromWorkspace(empty), name: '빈 배치' }, { kind: 'name' })).toEqual({ name: '빈 배치', aliases: ['qa'], rules: [] })
  })
})

describe('저장·바뀜 뒤 초안 맞추기(rebaseDraft)', () => {
  const next: Workspace = {
    ...ws,
    name: '회의 모드',
    layouts: Object.fromEntries(Object.entries(ws.layouts).map(([k, l]) => [k, { ...l, windows: l.windows.map((r) => (r.id === 'r2' ? { ...r, enabled: false } : r)) }]))
  }

  it('사용자가 손대지 않은 칸은 새 값을 따르고, 아직 저장하지 않은 글은 남긴다', () => {
    const d = withRule({ ...draftFromWorkspace(ws), aliases: 'qa, 시험' }, 'r3', { titleIncludes: 'SureMate' })
    expect(rebaseDraft(ws, next, d)).toEqual(withRule(withRule({ ...draftFromWorkspace(next), aliases: 'qa, 시험' }, 'r3', { titleIncludes: 'SureMate' }), 'r2', { enabled: false }))
  })

  it('방금 저장한 칸은 저장된(다듬은) 값으로 바꾼다', () => {
    const saved: Workspace = { ...ws, name: '보고서 모드', aliases: ['qa', '시험'] }
    const d = { ...draftFromWorkspace(ws), name: '  보고서 모드 ', aliases: 'qa, 시험，QA' }
    expect(rebaseDraft(ws, saved, d, { kind: 'name' }).name).toBe('보고서 모드')
    expect(rebaseDraft(ws, saved, d, { kind: 'name' }).aliases).toBe('qa, 시험，QA')
    expect(rebaseDraft(ws, saved, d, { kind: 'aliases' }).aliases).toBe('qa, 시험')
  })

  it('지금 배치로 다시 저장해 규칙 id가 바뀌면 규칙은 새 배치 그대로', () => {
    const recaptured: Workspace = { ...ws, layouts: { [Object.keys(ws.layouts)[0]]: { ...Object.values(ws.layouts)[0], windows: Object.values(ws.layouts)[0].windows.map((r, i) => ({ ...r, id: `n${i}` })) } } }
    const d = withRule(draftFromWorkspace(ws), 'r1', { enabled: false })
    expect(rebaseDraft(ws, recaptured, d).rules).toEqual(draftFromWorkspace(recaptured).rules)
  })
})
