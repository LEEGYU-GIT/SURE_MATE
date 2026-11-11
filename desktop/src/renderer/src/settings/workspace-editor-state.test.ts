import { describe, expect, it } from 'vitest'
import { applyWorkspaceEdit, type WorkspaceEdit } from '../../../shared/workspace/edit'
import { monitorKey, toSavedMonitor } from '../../../shared/workspace/monitors'
import { L, P } from '../../../shared/workspace/test-monitors'
import { testWorkspace } from '../../../shared/workspace/test-workspaces'
import type { Workspace } from '../../../shared/workspace/types'
import { parseWorkspaceEdit, type WorkspaceEditResult } from '../../../shared/workspace/workspace-ipc'
import {
  createFieldCommits,
  draftFromWorkspace,
  draftToEdit,
  fieldEdit,
  fieldKey,
  type FieldCommits,
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

const applied = (w: Workspace, edit: ReturnType<typeof fieldEdit>): Workspace => {
  const r = applyWorkspaceEdit(w, edit!, [], NOW)
  if (!r.ok) throw new Error(r.errors.join(', '))
  return r.workspace
}

describe('(A-I2) 저장을 보낸 칸을 답이 오기 전에 또 바꾸면 새 값을 남긴다', () => {
  const include = { kind: 'rule', id: 'r1', prop: 'enabled' } as const
  const monitor = { kind: 'rule', id: 'r1', prop: 'monitor' } as const

  it('(a) 체크 상자: 끄고 바로 다시 켜면 켠 값이 남고, 다음 저장이 켠 값을 보낸다', () => {
    const sent = withRule(draftFromWorkspace(ws), 'r1', { enabled: false })
    const s1 = applied(ws, fieldEdit(ws, sent, include))
    const now = withRule(sent, 'r1', { enabled: true })
    const after = rebaseDraft(ws, s1, now, include, { sent })
    expect(after.rules[0].enabled).toBe(true)
    expect(fieldEdit(s1, after, include)?.rules[0].enabled).toBe(true)
  })

  it('(b) 대상 모니터 단추: 두 번 빨리 누르면 두 번 바뀐 모니터(모니터 2대면 처음 모니터)가 남고 다음 저장이 보낸다', () => {
    const monitors = Object.values(ws.layouts)[0].monitors
    const click = (d: WorkspaceDraft): WorkspaceDraft => withRule(d, 'r1', { monitor: nextMonitor(d.rules[0].monitor, monitors) })
    const sent = click(draftFromWorkspace(ws))
    const s1 = applied(ws, fieldEdit(ws, sent, monitor))
    const now = click(sent)
    expect(now.rules[0].monitor).toBe(KP)
    const after = rebaseDraft(ws, s1, now, monitor, { sent })
    expect(after.rules[0].monitor).toBe(KP)
    expect(fieldEdit(s1, after, monitor)?.rules[0].monitor).toBe(KP)
  })

  it('(c) 이름: Enter로 저장한 뒤 이어서 친 글은 답이 와도 그대로 둔다(한글 조합 중인 글을 바꾸지 않는다)', () => {
    const sent = { ...draftFromWorkspace(ws), name: '회의' }
    const s1 = applied(ws, fieldEdit(ws, sent, { kind: 'name' }))
    const typing = { ...sent, name: '회의 모ㄷ' }
    expect(rebaseDraft(ws, s1, typing, { kind: 'name' }, { sent }).name).toBe('회의 모ㄷ')
  })

  it('보낸 뒤 그대로인 칸은 저장된(다듬은) 값으로 바꾼다', () => {
    const sent = { ...draftFromWorkspace(ws), name: '  회의 모드 ' }
    const s1 = applied(ws, fieldEdit(ws, sent, { kind: 'name' }))
    expect(rebaseDraft(ws, s1, sent, { kind: 'name' }, { sent }).name).toBe('회의 모드')
  })

  it('저장을 보냈거나 기다리는 칸은 다른 곳에서 바뀐 값이 와도 칸의 글을 그대로 둔다(그 저장의 답이 맞춘다)', () => {
    const s1 = applied(ws, fieldEdit(ws, withRule(draftFromWorkspace(ws), 'r1', { enabled: false }), include))
    // 끄고 다시 켰다: 저장된 처음 값(켬)과 같아 보여도 손댄 칸이다
    const now = draftFromWorkspace(ws)
    expect(rebaseDraft(ws, s1, now, undefined, { pending: new Set([fieldKey(include)]) }).rules[0].enabled).toBe(true)
    expect(rebaseDraft(ws, s1, now).rules[0].enabled).toBe(false)
  })
})

interface EditorFlow {
  commits: FieldCommits
  sent: WorkspaceEdit[]
  flush(): Promise<void>
  draft(): WorkspaceDraft
  main(): Workspace
  type(update: (d: WorkspaceDraft) => WorkspaceDraft): void
  reply(): Promise<void>
  push(): Promise<void>
}

/**
 * 설정 창 칸 저장의 흐름 전체(WorkspaceDetail과 같은 연결). main은 applyWorkspaceEdit로 저장하고, 답(invoke 응답)과
 * 바뀐 목록 알림(workspace:changed)을 따로 보낸다. 시험이 둘의 도착 순서를 정한다
 */
function editorFlow(start: Workspace): EditorFlow {
  let saved = start
  let draft = draftFromWorkspace(start)
  let main = start
  const replies: (() => void)[] = []
  const pushes: Workspace[] = []
  const sent: WorkspaceEdit[] = []
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  }
  const commits = createFieldCommits({
    saved: () => saved,
    draft: () => draft,
    putSaved: (w) => void (saved = w),
    putDraft: (update) => void (draft = update(draft)),
    send: (_id, edit) =>
      new Promise<WorkspaceEditResult>((resolve) => {
        sent.push(edit)
        const r = applyWorkspaceEdit(main, edit, [], NOW)
        if (r.ok) {
          main = r.workspace
          pushes.push(r.workspace)
        }
        replies.push(() => resolve(r))
      }),
    setError: () => {}
  })
  return {
    commits,
    sent,
    flush,
    draft: () => draft,
    main: () => main,
    type: (update: (d: WorkspaceDraft) => WorkspaceDraft): void => void (draft = update(draft)),
    /** 기다리던 답 하나 */
    reply: async (): Promise<void> => {
      replies.shift()?.()
      await flush()
    },
    /** 바뀐 목록 알림 하나(설정 창의 새 목록, 같은 내용의 다른 객체) */
    push: async (): Promise<void> => {
      const next = pushes.shift()
      if (next) commits.external(structuredClone(next))
      await flush()
    }
  }
}

describe('(A-I2) 그 자리 저장의 흐름: 답과 바뀐 목록 알림이 어느 순서로 와도 마지막으로 바꾼 값이 저장된다', () => {
  const include = { kind: 'rule', id: 'r1', prop: 'enabled' } as const
  const monitor = { kind: 'rule', id: 'r1', prop: 'monitor' } as const
  const enabledOf = (w: Workspace): boolean => Object.values(w.layouts)[0].windows[0].enabled

  for (const order of ['reply-first', 'push-first'] as const) {
    const answer = async (t: EditorFlow): Promise<void> => {
      if (order === 'reply-first') {
        await t.reply()
        await t.push()
      } else {
        await t.push()
        await t.reply()
      }
    }

    it(`(a) 체크 상자를 끄고 바로 다시 켜면 켬으로 저장된다(${order})`, async () => {
      const t = editorFlow(ws)
      t.type((d) => withRule(d, 'r1', { enabled: false }))
      t.commits.commit(include)
      await t.flush()
      t.type((d) => withRule(d, 'r1', { enabled: true }))
      t.commits.commit(include)
      await answer(t)
      expect(t.draft().rules[0].enabled).toBe(true)
      await answer(t)
      await t.commits.idle()
      expect(t.sent.map((e) => e.rules[0].enabled)).toEqual([false, true])
      expect(enabledOf(t.main())).toBe(true)
      expect(t.draft().rules[0].enabled).toBe(true)
    })

    it(`(b) 모니터 단추를 두 번 빨리 누르면 두 번 바뀐 모니터로 저장된다(${order})`, async () => {
      const t = editorFlow(ws)
      const monitors = Object.values(ws.layouts)[0].monitors
      const click = (): void => {
        t.type((d) => withRule(d, 'r1', { monitor: nextMonitor(d.rules[0].monitor, monitors) }))
        t.commits.commit(monitor)
      }
      click()
      await t.flush()
      click()
      await answer(t)
      await answer(t)
      await t.commits.idle()
      expect(Object.values(t.main().layouts)[0].windows[0].target.monitor).toBe(KP)
      expect(t.draft().rules[0].monitor).toBe(KP)
    })

    it(`(c) 이름을 Enter로 저장하고 이어서 치는 글은 답이 와도 그대로이고, 다음 Enter가 저장한다(${order})`, async () => {
      const t = editorFlow(ws)
      t.type((d) => ({ ...d, name: '회의' }))
      t.commits.commit({ kind: 'name' })
      await t.flush()
      t.type((d) => ({ ...d, name: '회의 모ㄷ' }))
      await answer(t)
      expect(t.draft().name).toBe('회의 모ㄷ')
      t.type((d) => ({ ...d, name: '회의 모드' }))
      t.commits.commit({ kind: 'name' })
      await t.flush()
      await answer(t)
      await t.commits.idle()
      expect(t.main().name).toBe('회의 모드')
      expect(t.draft().name).toBe('회의 모드')
    })
  }

  it('보낸 값과 같아 보내지 않는 칸은 다듬은 값으로 맞추고, 저장 실패는 칸의 글을 그대로 둔다', async () => {
    const t = editorFlow(ws)
    t.type((d) => ({ ...d, name: '  QA 모드 ' }))
    t.commits.commit({ kind: 'name' })
    await t.commits.idle()
    expect(t.sent).toEqual([])
    expect(t.draft().name).toBe('QA 모드')
    // 이름을 비우면 main이 거절한다(오류 문구는 칸 아래, 글은 그대로)
    t.type((d) => ({ ...d, name: '' }))
    t.commits.commit({ kind: 'name' })
    await t.flush()
    await t.reply()
    await t.commits.idle()
    expect(t.draft().name).toBe('')
    expect(t.main().name).toBe('QA 모드')
  })
})
