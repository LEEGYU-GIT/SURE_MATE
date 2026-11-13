import { expect, it } from 'vitest'
import type { Workspace } from './types'
import { nextWorkspaceName, parseWorkspaces } from './workspace-file'

const NAME = 'QA 모드'
const TITLE = '가상자동차 보고서.xlsx - Excel'
const rect = { x: 0, y: 0, width: 1920, height: 1080 }
const mon = (key: string, role: string): unknown => ({ key, role, bounds: rect, workArea: rect, scaleFactor: 1.25 })
const rule = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'r1',
  enabled: true,
  match: { exe: 'EXCEL.EXE', className: 'XLMAIN', titleIncludes: '보고서' },
  savedTitle: TITLE,
  target: { monitor: 'm1', rect: { x: 0, y: 0, w: 0.5, h: 1 }, state: 'normal' },
  order: 0,
  ...o
})
const layout = (rules: unknown[]): unknown => ({ monitors: [mon('m1', 'primary'), mon('m2', 'secondary')], windows: rules })
const ws = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'w1',
  name: NAME,
  aliases: ['qa'],
  hotkey: 'Ctrl+Alt+1',
  layouts: { 'fp-1': layout([rule(), rule({ id: 'r2', order: 1 }), rule({ id: 'r3', order: 2 })]) },
  updatedAt: '2026-11-09T00:00:00.000Z',
  ...o
})
const file = (workspaces: unknown[], o: Record<string, unknown> = {}): unknown => ({ format: 'sure-mate-workspaces', version: 1, savedAt: 'x', workspaces, ...o })

it('정상 예시는 같은 값·오류 없음', () => {
  const r = parseWorkspaces(file([ws()]))
  expect(r.errors).toEqual([])
  expect(r.workspaces).toEqual([ws()])
})

it('형식이 다르면 빈 목록과 오류 하나', () => {
  const r = parseWorkspaces(file([ws()], { format: 'other' }))
  expect(r.workspaces).toEqual([])
  expect(r.errors).toHaveLength(1)
  expect(parseWorkspaces(file([ws()], { version: 2 })).workspaces).toEqual([])
  expect(parseWorkspaces(null).errors).toHaveLength(1)
})

it('이름: 공백만이면 건너뛰고 50자는 40자로', () => {
  expect(parseWorkspaces(file([ws({ name: '  ' })])).workspaces).toEqual([])
  expect(parseWorkspaces(file([ws({ name: 'a'.repeat(50) })])).workspaces[0].name).toBe('a'.repeat(40))
})

it('별칭 정리, hotkey, updatedAt', () => {
  const r = parseWorkspaces(file([ws({ aliases: ['qa', 'QA', ' ', 'x'.repeat(50)], hotkey: 7, updatedAt: 'nope' })]))
  expect(r.workspaces[0].aliases).toEqual(['qa'])
  expect(r.workspaces[0].hotkey).toBeNull()
  expect(r.workspaces[0].updatedAt).toBe(new Date(0).toISOString())
})

it('워크스페이스 31개는 30개와 오류, 같은 id는 앞의 것만', () => {
  const many = Array.from({ length: 31 }, (_, i) => ws({ id: `w${i}` }))
  const r = parseWorkspaces(file(many))
  expect(r.workspaces).toHaveLength(30)
  expect(r.errors.length).toBeGreaterThan(0)
  const d = parseWorkspaces(file([ws({ name: '첫째' }), ws({ name: '둘째' })]))
  expect(d.workspaces.map((w) => w.name)).toEqual(['첫째'])
  expect(d.errors).toHaveLength(1)
})

it('기본 워크스페이스(화면 감추기)는 30개 제한에 들지 않는다: 기본 하나와 사용자 30개는 모두 읽고 오류가 없다', () => {
  const users = Array.from({ length: 30 }, (_, i) => ws({ id: `w${i}` }))
  for (const at of [0, 30]) {
    const list = [...users]
    list.splice(at, 0, ws({ id: 'builtin-hide', name: '화면 감추기', layouts: {} }))
    const r = parseWorkspaces(file(list))
    expect(r.workspaces, `at ${at}`).toHaveLength(31)
    expect(r.errors, `at ${at}`).toEqual([])
  }
  // 사용자 워크스페이스가 31개면 기본이 있어도 앞의 30개만 읽고 알린다
  const over = parseWorkspaces(file([ws({ id: 'builtin-hide', name: '화면 감추기' }), ...users, ws({ id: 'w30' })]))
  expect(over.workspaces).toHaveLength(31)
  expect(over.workspaces.filter((w) => w.id !== 'builtin-hide')).toHaveLength(30)
  expect(over.errors.length).toBeGreaterThan(0)
})

it('감춘 동안 항상 위(keepOnTop): 기본 워크스페이스에서 true일 때만 읽고, 다른 값·다른 워크스페이스에서는 뺀다(기본 꺼짐)', () => {
  const hide = (v: unknown): Workspace => parseWorkspaces(file([ws({ id: 'builtin-hide', keepOnTop: v })])).workspaces[0]
  expect(hide(true).keepOnTop).toBe(true)
  for (const v of [false, 'true', 1, null, undefined]) expect(Object.hasOwn(hide(v), 'keepOnTop'), String(v)).toBe(false)
  expect(Object.hasOwn(parseWorkspaces(file([ws({ keepOnTop: true })])).workspaces[0], 'keepOnTop')).toBe(false)
})

const rulesOf = (r: ReturnType<typeof parseWorkspaces>): Workspace['layouts'][string]['windows'] => r.workspaces[0].layouts['fp-1'].windows

it('titleRegex가 잘못되면 그 칸만 빼고 오류', () => {
  const r = parseWorkspaces(file([ws({ layouts: { 'fp-1': layout([rule({ match: { exe: 'EXCEL.EXE', titleRegex: '(' } })]) } })]))
  expect(rulesOf(r)).toHaveLength(1)
  expect(rulesOf(r)[0].match.titleRegex).toBeUndefined()
  expect(r.errors).toHaveLength(1)
})

it('모니터 키가 없거나 rect가 잘못된 규칙은 제외', () => {
  const bad1 = rule({ id: 'a', target: { monitor: 'nope', rect: { x: 0, y: 0, w: 1, h: 1 }, state: 'normal' } })
  const bad2 = rule({ id: 'b', target: { monitor: 'm1', rect: { x: 0, y: 0, w: 0, h: 1 }, state: 'normal' } })
  const r = parseWorkspaces(file([ws({ layouts: { 'fp-1': layout([bad1, bad2, rule({ id: 'ok' })]) } })]))
  expect(rulesOf(r).map((x) => x.id)).toEqual(['ok'])
  expect(r.errors).toHaveLength(2)
})

it('규칙 41개는 40개로', () => {
  const rules = Array.from({ length: 41 }, (_, i) => rule({ id: `r${i}`, order: i }))
  const r = parseWorkspaces(file([ws({ layouts: { 'fp-1': layout(rules) } })]))
  expect(rulesOf(r)).toHaveLength(40)
  expect(r.errors.length).toBeGreaterThan(0)
})

it('order가 정수가 아니면 배열 순번', () => {
  const r = parseWorkspaces(file([ws({ layouts: { 'fp-1': layout([rule({ id: 'a', order: 'x' }), rule({ id: 'b', order: -1 })]) } })]))
  expect(rulesOf(r).map((x) => x.order)).toEqual([0, 1])
})

it('오류 문구에 이름·제목이 없다(Review Focus 5)', () => {
  const bad = rule({ match: { exe: 'EXCEL.EXE', titleRegex: '(' } })
  const bad2 = rule({ id: 'b', target: { monitor: 'nope', rect: { x: 0, y: 0, w: 1, h: 1 }, state: 'normal' } })
  const r = parseWorkspaces(
    file([ws({ layouts: { 'fp-1': layout([bad, bad2]) } }), ws({ name: '  ', id: 'w2' }), ws({ id: 'w1' }), ws({ id: 'w3', hotkey: 1 }), { id: 'bad id', name: NAME }])
  )
  expect(r.errors.length).toBeGreaterThan(2)
  const text = JSON.stringify(r.errors)
  expect(text).not.toContain(NAME)
  expect(text).not.toContain(TITLE)
  expect(text).not.toContain('가상자동차')
})

it('nextWorkspaceName', () => {
  expect(nextWorkspaceName([])).toBe('배치 1')
  expect(nextWorkspaceName([{ name: '배치 1' }, { name: '배치 3' }])).toBe('배치 2')
})

it('nextWorkspaceName: 공백·대소문자만 다른 이름도 쓴 이름으로 본다(편집의 이름 겹침 검사와 같은 compactOf, A-M1)', () => {
  expect(nextWorkspaceName([{ name: '배치1' }])).toBe('배치 2')
  expect(nextWorkspaceName([{ name: ' 배치  1 ' }, { name: '배치2' }, { name: '배치-3' }])).toBe('배치 4')
})
