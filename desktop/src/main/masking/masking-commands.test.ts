import { expect, it } from 'vitest'
import type { MaskItem } from '../../shared/masking/types'
import type { CaptureSkipReason, MaskingMode } from '../../shared/types'
import { createMaskingCommands, type MaskingCommandDeps } from './masking-commands'

type MaskCall = { text: string; mode: MaskingMode; dryRun: boolean }
interface Calls {
  writes: { text: string; excludeFromHistory: boolean }[]
  notes: string[]
  logs: { event: string; data: Record<string, unknown> }[]
  hides: boolean[]
  masks: MaskCall[]
  modes: MaskingMode[]
  opened: string[]
  shown: string[]
}

function fake(
  over: {
    clipboard?: string
    unmask?: { text: string; restored: number; unknownTokens: string[] }
    tableSize?: number
    captured?: { text: string | null; skipped?: CaptureSkipReason }
    mode?: MaskingMode
    masked?: { text: string; items: MaskItem[] }
    openError?: string
  } = {}
): { deps: MaskingCommandDeps; calls: Calls } {
  const calls: Calls = { writes: [], notes: [], logs: [], hides: [], masks: [], modes: [], opened: [], shown: [] }
  let mode: MaskingMode = over.mode ?? 'restore'
  const deps: MaskingCommandDeps = {
    masking: {
      mask: async (text, o) => {
        calls.masks.push({ text, mode: o.mode, dryRun: o.dryRun })
        const m = over.masked ?? { text: `[머리말]\n\n${text.replace('가상자동차', 'CLIENT_A')}`, items: [item(true)] }
        return { text: m.text, ranges: [], preamble: '[머리말]', items: m.items, mapRanges: (r) => r }
      },
      unmask: () => over.unmask ?? { text: '가상자동차와 XY방산은 씁니다', restored: 2, unknownTokens: [] },
      tableSize: () => over.tableSize ?? 3
    },
    getMode: () => mode,
    setMode: async (m) => {
      mode = m
      calls.modes.push(m)
    },
    readClipboard: async () => over.clipboard ?? 'CLIENT_A와 CLIENT_B는 씁니다',
    writeClipboard: async (text, o) => {
      calls.writes.push({ text, excludeFromHistory: o.excludeFromHistory })
    },
    hidePalette: (restoreFocus) => {
      calls.hides.push(restoreFocus)
    },
    captureSelection: async () => over.captured ?? { text: '가상자동차 회의 메모' },
    ensureDictionary: async () => 'C:\\사용자\\masking-dictionary.json',
    openFile: async (path) => {
      calls.opened.push(path)
      return over.openError ?? ''
    },
    showInFolder: (path) => {
      calls.shown.push(path)
    },
    notify: (m) => calls.notes.push(m),
    log: (event, data) => calls.logs.push({ event, data })
  }
  return { deps, calls }
}

const item = (enabled: boolean): MaskItem => ({ key: 'client:x', category: 'client', original: '가상자동차', replacement: enabled ? 'CLIENT_A' : null, count: 2, enabled })

it('가명 되돌리기: 클립보드 글의 가명을 원래 이름으로 바꿔 Win+V 기록에서 빼고 쓰고, 건수를 알린다', async () => {
  const f = fake()
  expect(await createMaskingCommands(f.deps).run('cmd.unmask')).toBe(true)
  expect(f.calls.hides).toEqual([true])
  expect(f.calls.writes).toEqual([{ text: '가상자동차와 XY방산은 씁니다', excludeFromHistory: true }])
  expect(f.calls.notes[0]).toContain('되돌렸어요 · 이름 2건')
  expect(JSON.stringify(f.calls.logs)).not.toMatch(/가상자동차|XY방산|CLIENT_A/)
})

it('가명 되돌리기: 대응표에 없는 표시(AI가 지어낸 CLIENT_C 등)가 있으면 알림에 함께 알린다', async () => {
  const f = fake({ unmask: { text: '가상자동차와 CLIENT_C', restored: 1, unknownTokens: ['CLIENT_C'] } })
  await createMaskingCommands(f.deps).run('cmd.unmask')
  expect(f.calls.writes).toHaveLength(1)
  expect(f.calls.notes[0]).toContain('CLIENT_C')
})

it('가명 되돌리기: 되돌릴 것이 없으면 클립보드를 건드리지 않고, 대응표가 비었으면 그 까닭을 알린다', async () => {
  const none = fake({ unmask: { text: '그냥 글', restored: 0, unknownTokens: [] } })
  await createMaskingCommands(none.deps).run('cmd.unmask')
  expect(none.calls.writes).toEqual([])
  expect(none.calls.notes[0]).toContain('되돌릴 가명이 없어요')

  const empty = fake({ unmask: { text: 'CLIENT_A', restored: 0, unknownTokens: ['CLIENT_A'] }, tableSize: 0 })
  await createMaskingCommands(empty.deps).run('cmd.unmask')
  expect(empty.calls.writes).toEqual([])
  expect(empty.calls.notes[0]).toContain('대응표')

  const blank = fake({ clipboard: '  ' })
  await createMaskingCommands(blank.deps).run('cmd.unmask')
  expect(blank.calls.writes).toEqual([])
  expect(blank.calls.notes[0]).toContain('클립보드가 비어')
})

it('선택한 글 가명 처리: 지금 모드로 가려(대응표 확정) 클립보드에 쓰고, 기본값이 꺼짐이면 되돌리기로 가린다', async () => {
  const f = fake()
  await createMaskingCommands(f.deps).run('cmd.mask-selection')
  expect(f.calls.masks).toEqual([{ text: '가상자동차 회의 메모', mode: 'restore', dryRun: false }])
  expect(f.calls.writes[0].text).toContain('CLIENT_A 회의 메모')
  expect(f.calls.notes[0]).toContain('가명 2건')

  const off = fake({ mode: 'off' })
  await createMaskingCommands(off.deps).run('cmd.mask-selection')
  expect(off.calls.masks[0].mode).toBe('restore')
  expect(JSON.stringify([...f.calls.logs, ...off.calls.logs])).not.toMatch(/가상자동차|CLIENT_A/)
})

it('선택한 글 가명 처리: 선택한 글이 없거나 가릴 것이 없으면 클립보드를 건드리지 않는다', async () => {
  const nothing = fake({ captured: { text: null, skipped: 'terminal' } })
  await createMaskingCommands(nothing.deps).run('cmd.mask-selection')
  expect(nothing.calls.writes).toEqual([])
  expect(nothing.calls.notes[0]).toContain('터미널')

  const plain = fake({ masked: { text: '회의 메모', items: [] } })
  await createMaskingCommands(plain.deps).run('cmd.mask-selection')
  expect(plain.calls.writes).toEqual([])
  expect(plain.calls.notes[0]).toContain('찾지 못했어요')
})

it('가명 처리 기본값 바꾸기: 끔 → 되돌리기 → 빼기 순서로 바꿔 저장하고 알린다', async () => {
  const f = fake({ mode: 'restore' })
  const commands = createMaskingCommands(f.deps)
  await commands.run('cmd.masking-mode')
  await commands.run('cmd.masking-mode')
  expect(f.calls.modes).toEqual(['remove', 'off'])
  expect(f.calls.notes[0]).toContain('결과에서 빼기')
  expect(f.calls.notes[1]).toContain('원문 그대로')
})

it('가명 사전 열기: 없으면 가상 예시로 만들고 기본 프로그램으로 열며, 열 프로그램이 없으면 폴더에서 보여 준다', async () => {
  const f = fake()
  await createMaskingCommands(f.deps).run('cmd.open-dictionary')
  expect(f.calls.hides).toEqual([false])
  expect(f.calls.opened).toEqual(['C:\\사용자\\masking-dictionary.json'])
  expect(f.calls.shown).toEqual([])

  const noApp = fake({ openError: 'no association' })
  await createMaskingCommands(noApp.deps).run('cmd.open-dictionary')
  expect(noApp.calls.shown).toEqual(['C:\\사용자\\masking-dictionary.json'])
  expect(noApp.calls.notes[0]).toContain('폴더')
})

it('가명 처리 명령이 아니면 false', async () => {
  expect(await createMaskingCommands(fake().deps).run('dev.listWindows')).toBe(false)
})
