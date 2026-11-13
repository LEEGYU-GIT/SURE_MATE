import { describe, expect, it } from 'vitest'
import { barShapeLabel, maskingModeLabel } from '../../../shared/labels'
import type { FlyoutContent } from '../../../shared/flyout/flyout-content'
import { barMenuRows, labelParts, maskingMenuRows, type MenuRow, workspaceMenuRows } from './menu-model'

describe('가명 처리 메뉴', () => {
  it('끔이면 3행이고 끔 행만 선택·주의(warn)이며, 행마다 그 모드로 바꾸는 동작', () => {
    const rows = maskingMenuRows('off')
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.action)).toEqual([
      { type: 'set-masking', mode: 'off' },
      { type: 'set-masking', mode: 'restore' },
      { type: 'set-masking', mode: 'remove' }
    ])
    expect(rows.filter((r) => r.checked).map((r) => r.action)).toEqual([{ type: 'set-masking', mode: 'off' }])
    expect(rows.filter((r) => r.tone === 'warn').map((r) => r.action)).toEqual([{ type: 'set-masking', mode: 'off' }])
  })

  it('제목은 모드 이름(labels.ts)이고, 끔 행은 색만이 아니라 글로도 원문이 나간다고 알린다(§14-4)', () => {
    const rows = maskingMenuRows('restore')
    expect(rows.map((r) => r.title)).toEqual([maskingModeLabel('off'), maskingModeLabel('restore'), maskingModeLabel('remove')])
    expect(rows[0].detail).toContain('원문 그대로')
    for (const r of rows) expect(r.detail, r.key).toBeTruthy()
  })

  it('다른 모드면 그 행만 선택이고, 끔 행은 선택되지 않아도 주의 표시를 유지한다', () => {
    const rows = maskingMenuRows('remove')
    expect(rows.map((r) => r.checked)).toEqual([false, false, true])
    expect(rows.map((r) => r.tone)).toEqual(['warn', 'normal', 'normal'])
  })

  it('행 key는 서로 다르다', () => {
    const keys = maskingMenuRows('restore').map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('바 메뉴', () => {
  it('캡슐이면 캡슐 행만 선택, 잠시 숨기기·설정 열기 행이 있고, 끄기 행은 모양을 끔으로 바꾼다', () => {
    const rows = barMenuRows('capsule')
    expect(rows.filter((r) => r.checked).map((r) => r.action)).toEqual([{ type: 'set-bar-shape', shape: 'capsule' }])
    expect(rows.map((r) => r.action)).toContainEqual({ type: 'snooze-bar' })
    expect(rows.map((r) => r.action)).toContainEqual({ type: 'open-settings' })
    const off = rows.find((r) => r.action.type === 'set-bar-shape' && r.action.shape === 'off')
    expect(off?.action).toEqual({ type: 'set-bar-shape', shape: 'off' })
    // 바를 끄면 이 메뉴도 사라지므로 다시 켜는 곳을 글로 알린다
    expect(off?.detail).toMatch(/트레이/)
  })

  it('모양 세 행이 먼저(가장자리 띠·떠 있는 캡슐·끄기), 그다음 잠시 숨기기·설정 열기', () => {
    const rows = barMenuRows('edge')
    expect(rows.map((r) => r.action.type)).toEqual(['set-bar-shape', 'set-bar-shape', 'set-bar-shape', 'snooze-bar', 'open-settings'])
    expect(rows.slice(0, 2).map((r) => r.title)).toEqual([barShapeLabel('edge'), barShapeLabel('capsule')])
    expect(rows.map((r) => r.checked)).toEqual([true, false, false, false, false])
    expect(rows.every((r) => r.tone === 'normal')).toBe(true)
    const keys = rows.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('이름표 나누기', () => {
  it('마지막 " · " 뒤를 보조 글로 나누고, 단축키인지 알려 준다', () => {
    expect(labelParts('팔레트 열기 · Alt+`')).toEqual({ name: '팔레트 열기', hint: 'Alt+`', hintIsKey: true })
    expect(labelParts('회의록 정리 · 선택한 글로 실행')).toEqual({ name: '회의록 정리', hint: '선택한 글로 실행', hintIsKey: false })
    expect(labelParts('팔레트 열기 · Ctrl+Alt+Space')).toEqual({ name: '팔레트 열기', hint: 'Ctrl+Alt+Space', hintIsKey: true })
  })

  it('이름 안의 " · "는 이름에 남는다(보조 글은 맨 뒤 하나)', () => {
    expect(labelParts('보고서 · 주간 · 선택한 글로 실행')).toEqual({ name: '보고서 · 주간', hint: '선택한 글로 실행', hintIsKey: false })
  })

  it('구분이 없거나 한쪽이 비면 나누지 않는다', () => {
    expect(labelParts('가명 처리: 끔')).toEqual({ name: '가명 처리: 끔', hint: null, hintIsKey: false })
    expect(labelParts('설정')).toEqual({ name: '설정', hint: null, hintIsKey: false })
    expect(labelParts('이름 · ')).toEqual({ name: '이름 · ', hint: null, hintIsKey: false })
    expect(labelParts(' · Alt+`')).toEqual({ name: ' · Alt+`', hint: null, hintIsKey: false })
  })
})

describe('워크스페이스 메뉴', () => {
  type WsContent = Extract<FlyoutContent, { kind: 'workspace-menu' }>
  const content = (o: Partial<WsContent> = {}): WsContent => ({
    kind: 'workspace-menu',
    workspaces: [
      { id: 'ws-a', name: 'QA 모드', windows: 3, otherConfig: false },
      { id: 'ws-b', name: '회의', windows: 2, otherConfig: true }
    ],
    canSave: true,
    more: 0,
    ...o
  })

  it('워크스페이스 2개면 4행: 불러오기 2 + 지금 배치 저장 + 모두 보기·편집', () => {
    const rows = workspaceMenuRows(content())
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ title: 'QA 모드', detail: '창 3개', tone: 'normal', action: { type: 'workspace-run', id: 'ws-a' } })
    expect(rows[2]).toMatchObject({ title: '지금 배치 저장', action: { type: 'workspace-save' } })
    expect(rows[3]).toMatchObject({ title: '모두 보기·편집', action: { type: 'workspace-edit' } })
    expect(new Set(rows.map((r) => r.key)).size).toBe(4)
    for (const r of rows) expect(r.checked).toBe(false)
  })

  it('다른 모니터 구성이면 색(warn)과 함께 글로도 알린다', () => {
    const rows = workspaceMenuRows(content())
    expect(rows[1].tone).toBe('warn')
    expect(rows[1].detail).toBe('창 2개 · 다른 모니터 구성')
  })

  it('canSave가 false면 저장 행은 disabled이고 까닭을 글로 적는다', () => {
    const save = workspaceMenuRows(content({ canSave: false })).find((r) => r.action.type === 'workspace-save')
    expect(save?.disabled).toBe(true)
    expect(save?.detail).toBe('보안 프로그램이 창 제어를 막아 저장할 수 없어요')
    expect(workspaceMenuRows(content()).find((r) => r.action.type === 'workspace-save')?.disabled).toBeUndefined()
  })

  it('편집 행 설명: more가 있으면 외 N개 더 있어요, 없으면 설정 안내', () => {
    expect(workspaceMenuRows(content({ more: 3 })).at(-1)?.detail).toBe('외 3개 더 있어요')
    expect(workspaceMenuRows(content({ more: 0 })).at(-1)?.detail).toBe('설정에서 이름과 단축키를 바꿔요')
  })

  it('목록이 비면 저장·편집 두 행만', () => {
    const rows = workspaceMenuRows(content({ workspaces: [] }))
    expect(rows.map((r) => r.action.type)).toEqual(['workspace-save', 'workspace-edit'])
  })

  it('화면 감추기(기본) 행: 저장 전에는 모든 창을, 저장한 뒤에는 그 창만 남긴다고, 되돌릴 창이 있으면 되돌리기로 적는다(한 줄)', () => {
    const hide = (o: { windows: number; restorable?: number; otherConfig?: boolean }): MenuRow =>
      workspaceMenuRows(content({ workspaces: [{ id: 'builtin-hide', name: '화면 감추기', windows: o.windows, otherConfig: o.otherConfig ?? false, hide: true, ...(o.restorable ? { restorable: o.restorable } : {}) }] }))[0]
    expect(hide({ windows: 0 })).toMatchObject({ key: 'workspace:builtin-hide', title: '화면 감추기', detail: '열린 창을 모두 내려요', tone: 'normal', action: { type: 'workspace-run', id: 'builtin-hide' } })
    expect(hide({ windows: 2 }).detail).toBe('창 2개만 남기고 내려요')
    expect(hide({ windows: 2, restorable: 12 }).detail).toBe('내렸던 창 12개 되돌리기')
    expect(hide({ windows: 2, otherConfig: true })).toMatchObject({ detail: '창 2개 · 다른 모니터 구성', tone: 'warn' })
    // 되돌릴 창이 있으면 다른 모니터 구성보다 되돌리기가 먼저다(검토 M11): 누르면 되돌리기만 한다
    expect(hide({ windows: 2, restorable: 12, otherConfig: true })).toMatchObject({ detail: '내렸던 창 12개 되돌리기', tone: 'normal' })
    for (const t of ['열린 창을 모두 내려요', '창 22개만 남기고 내려요', '내렸던 창 40개 되돌리기']) expect(t.length, t).toBeLessThanOrEqual(18)
  })
})
