import { expect, it } from 'vitest'
import type { GlossaryEntry } from '../../shared/glossary/types'
import { createPackCommands, type PackCommandDeps } from './pack-commands'

const entry = (id: string, term: string, source: GlossaryEntry['source'] = 'user'): GlossaryEntry => ({
  id,
  term,
  aliases: [],
  definition: `${term} 설명`,
  links: [],
  tags: [],
  source,
  updatedAt: '2026-11-01T00:00:00.000Z',
  version: 1
})

const packText = (entries: GlossaryEntry[]): string => JSON.stringify({ format: 'sure-mate-glossary', version: 1, entries })

function fake(over: { user?: GlossaryEntry[]; savePath?: string | null; openPath?: string | null; file?: { text: string } | { error: 'too-big' | 'read-failed' }; confirm?: boolean } = {}) {
  const calls = { written: [] as { path: string; text: string }[], saved: [] as GlossaryEntry[][], notes: [] as string[], confirms: [] as string[], logs: [] as Record<string, unknown>[], dialogs: [] as string[] }
  const user = over.user ?? [entry('u1', '우리 팀 용어')]
  const deps: PackCommandDeps = {
    glossary: async () => ({ entries: [entry('mcdc', 'MC/DC', 'builtin'), ...user], userEntries: user }),
    saveUserEntries: async (list) => {
      calls.saved.push(list)
    },
    waitKeysReleased: async () => true,
    hidePalette: () => {},
    showSaveDialog: async (name) => {
      calls.dialogs.push(name)
      return over.savePath === undefined ? 'C:\\문서\\팩.json' : over.savePath
    },
    showOpenDialog: async () => (over.openPath === undefined ? 'C:\\받은\\팩.json' : over.openPath),
    writeFile: async (path, text) => {
      calls.written.push({ path, text })
    },
    readFile: async () => over.file ?? { text: packText([entry('new1', '새 용어')]) },
    confirm: async (detail) => {
      calls.confirms.push(detail)
      return over.confirm ?? true
    },
    notify: (m) => calls.notes.push(m),
    log: (_event, data) => calls.logs.push(data),
    now: () => new Date(2026, 10, 9, 10, 0)
  }
  return { deps, calls }
}

it('내보내기: 내 용어를 sure-mate-용어팩-날짜.json으로 저장하고 개수를 알린다', async () => {
  const f = fake()
  expect(await createPackCommands(f.deps).run('cmd.glossary-export')).toBe(true)
  expect(f.calls.dialogs).toEqual(['sure-mate-용어팩-20261109.json'])
  expect(JSON.parse(f.calls.written[0].text).entries.map((x: GlossaryEntry) => x.id)).toEqual(['u1'])
  expect(f.calls.notes[0]).toContain('1개')
})

it('내보내기: 내 용어가 없으면 대화상자를 열지 않고 알린다, 취소하면 아무것도 안 한다', async () => {
  const none = fake({ user: [] })
  await createPackCommands(none.deps).run('cmd.glossary-export')
  expect(none.calls.dialogs).toEqual([])
  expect(none.calls.notes[0]).toContain('내보낼')
  const cancel = fake({ savePath: null })
  await createPackCommands(cancel.deps).run('cmd.glossary-export')
  expect(cancel.calls.written).toEqual([])
})

it('가져오기: 미리 보기 숫자로 확인을 받고, 확인하면 합쳐 저장한다', async () => {
  const f = fake()
  await createPackCommands(f.deps).run('cmd.glossary-import')
  expect(f.calls.confirms[0]).toContain('새 용어 1')
  expect(f.calls.saved[0].map((x) => x.id)).toEqual(['u1', 'new1'])
  expect(f.calls.notes[0]).toContain('가져왔어요')
  expect(JSON.stringify(f.calls.logs)).not.toContain('새 용어 설명')
})

it('가져오기: 확인을 거절하거나, 5MB를 넘거나, 형식이 다르면 저장하지 않는다', async () => {
  const no = fake({ confirm: false })
  await createPackCommands(no.deps).run('cmd.glossary-import')
  expect(no.calls.saved).toEqual([])
  const big = fake({ file: { error: 'too-big' } })
  await createPackCommands(big.deps).run('cmd.glossary-import')
  expect(big.calls.saved).toEqual([])
  expect(big.calls.notes[0]).toContain('5MB')
  const wrong = fake({ file: { text: '{"format":"other"}' } })
  await createPackCommands(wrong.deps).run('cmd.glossary-import')
  expect(wrong.calls.saved).toEqual([])
  expect(wrong.calls.notes[0]).toContain('용어 팩')
  const broken = fake({ file: { text: '{고장' } })
  await createPackCommands(broken.deps).run('cmd.glossary-import')
  expect(broken.calls.saved).toEqual([])
})

it('가져오기: 링크 일부만 뺀 항목은 건너뛴 것으로 세지 않고 따로 알리며, 미리 보기 숫자대로 반영한다', async () => {
  const withBadLink = { ...entry('new1', '새 용어'), links: [{ title: '나쁜 링크', url: 'javascript:alert(1)' }] }
  const f = fake({ file: { text: packText([withBadLink]) } })
  await createPackCommands(f.deps).run('cmd.glossary-import')
  expect(f.calls.confirms[0]).toContain('새 용어 1')
  expect(f.calls.confirms[0]).not.toContain('건너뛴')
  expect(f.calls.confirms[0]).toContain('일부 값을 뺀 용어 1')
  expect(f.calls.saved[0].map((x) => [x.id, x.links.length])).toEqual([
    ['u1', 0],
    ['new1', 0]
  ])
  expect(f.calls.logs.at(-1)).toMatchObject({ added: 1, skipped: 0, trimmed: 1 })
})

it('가져오기: 통째로 건너뛴 항목은 건너뛴 항목으로 세고, 들어간 수는 미리 보기와 같다', async () => {
  const tooLong = { ...entry('bad', '긴 설명'), definition: '가'.repeat(1001) }
  const f = fake({ file: { text: packText([tooLong, entry('new1', '새 용어')]) } })
  await createPackCommands(f.deps).run('cmd.glossary-import')
  expect(f.calls.confirms[0]).toBe('새 용어 1 · 바뀐 용어 0 · 이름이 겹치는 용어 0 · 그대로 0 · 건너뛴 항목 1')
  expect(f.calls.saved[0].map((x) => x.id)).toEqual(['u1', 'new1'])
})

it('명령 오류는 오류 코드만 남긴다(경로·파일 이름에 사용자 이름·고객사명이 있을 수 있다)', async () => {
  const f = fake({ file: { text: packText([entry('new1', '새 용어')]) } })
  const failing = Object.assign(new Error("EPERM: operation not permitted, open 'D:\\공유\\가상자동차 용어팩.json'"), { code: 'EPERM' })
  f.deps.saveUserEntries = async () => {
    throw failing
  }
  await createPackCommands(f.deps).run('cmd.glossary-import')
  expect(f.calls.logs.at(-1)).toEqual({ id: 'cmd.glossary-import', code: 'EPERM' })
  expect(JSON.stringify(f.calls.logs)).not.toMatch(/공유|가상자동차|용어팩/)
  expect(f.calls.notes.at(-1)).toContain('처리하지 못했어요')
  // 코드가 없는 오류는 이름만
  f.deps.saveUserEntries = async () => {
    throw new TypeError('가상자동차 용어팩을 읽다 멈춤')
  }
  await createPackCommands(f.deps).run('cmd.glossary-import')
  expect(f.calls.logs.at(-1)).toEqual({ id: 'cmd.glossary-import', code: 'TypeError' })
})

it('용어 팩 명령이 아니면 false', async () => {
  expect(await createPackCommands(fake().deps).run('cmd.unmask')).toBe(false)
})
