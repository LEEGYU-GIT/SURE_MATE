import { describe, expect, it, vi } from 'vitest'
import {
  createLastPrompt,
  createStyleCommands,
  LAST_PROMPT_TTL_MS,
  STYLE_ADD_PREFIX,
  STYLE_POLISH_ID,
  styleCommandItems,
  type StyleCommandDeps,
  type StyleCommands
} from './style-commands'

const MINUTES = [
  '- HIL 2번 장비 고장 → 수리 요청함\n- MC/DC 92% 확인됨\n- 결과 공유 예정',
  '- 장비 수리 완료됨\n- 재확인 필요\n- 일정 논의함'
]
const ANSWER =
  '다음은 회의록입니다:\n\n* **장비 수리**를 11/20까지 완료하겠습니다.\n* 커버리지는 92%로 확인되었습니다.'

interface Setup {
  d: StyleCommandDeps
  c: StyleCommands
  notes: string[]
  logs: [string, Record<string, unknown>][]
  clipboard(): string
}

function setup(over: Partial<StyleCommandDeps> = {}): Setup {
  const store = new Map<string, string[]>([['회의록', [...MINUTES]]])
  let clipboard = ANSWER
  const notes: string[] = []
  const logs: [string, Record<string, unknown>][] = []
  const d: StyleCommandDeps = {
    kinds: () => [...store.entries()].map(([kind, s]) => ({ kind, samples: s.length })),
    samples: (kind) => store.get(kind) ?? [],
    addSample: vi.fn(async (kind: string, text: string) => {
      const list = store.get(kind) ?? []
      list.push(text)
      store.set(kind, list)
      return { ok: true as const, count: list.length, dropped: false }
    }),
    captureSelection: vi.fn(async () => ({
      text: '- 내가 쓴 회의록 줄 하나 요청함\n- 둘째 줄 공유 예정'
    })),
    readClipboard: async () => clipboard,
    writeClipboard: vi.fn(async (text: string) => {
      clipboard = text
    }),
    unmask: (text) => ({
      text: text.replace('CLIENT_A', '가상자동차'),
      restored: text.includes('CLIENT_A') ? 1 : 0,
      unknownTokens: []
    }),
    lastPrompt: () => ({ kind: '회의록', input: '11월 16일 회의. MC/DC 92%. 수리 요청', at: 0 }),
    waitKeysReleased: async () => true,
    hidePalette: vi.fn(),
    now: () => new Date(2026, 10, 16),
    notify: (m) => void notes.push(m),
    log: (e, data) => void logs.push([e, data]),
    emit: vi.fn(),
    ...over
  }
  return { d, c: createStyleCommands(d), notes, logs, clipboard: () => clipboard }
}

describe('styleCommandItems', () => {
  it('AI 티 지우기와 종류마다 내 말투로 등록(지금 견본 수)', () => {
    const items = styleCommandItems([
      { kind: '회의록', samples: 2 },
      { kind: '주간보고', samples: 0 }
    ])
    expect(items.map((i) => i.id)).toEqual([
      STYLE_POLISH_ID,
      `${STYLE_ADD_PREFIX}회의록`,
      `${STYLE_ADD_PREFIX}주간보고`
    ])
    expect(items[1].title).toBe('내 말투로 등록: 회의록')
    expect(items[2].subtitle).toContain('내가 쓴 주간보고를 선택하고')
    expect(items[2].subtitle).toContain('지금 0개')
  })
})

describe('AI 티 지우기', () => {
  it('마지막 프롬프트의 말투로 고쳐 클립보드에 넣고, 원문에 없는 값을 알린다', async () => {
    const s = setup()
    expect(await s.c.run(STYLE_POLISH_ID)).toBe(true)
    expect(s.clipboard()).toBe('- 장비 수리를 11/20까지 완료할 예정\n- 커버리지는 92%로 확인됨')
    expect(s.notes[0]).toBe(
      '회의록 말투로 고쳤어요 · 끝맺음 2 · 군더더기 1 · 꾸밈 기호 3. 원문에 없는 값: 11/20. 맞는지 확인해 주세요. 붙여넣을 곳에서 Ctrl+V를 누르세요.'
    )
    expect(s.d.hidePalette).toHaveBeenCalledWith(true)
    // 로그에는 글·값·종류 이름이 없다
    const logged = JSON.stringify(s.logs)
    for (const secret of ['11/20', '92', '회의록', '장비']) expect(logged).not.toContain(secret)
  })

  it('가명을 되돌리면 Win+V 기록에서 빼고 말랑 메이트에 알린다', async () => {
    const s = setup({ readClipboard: async () => '- CLIENT_A 회의를 진행했습니다.' })
    await s.c.run(STYLE_POLISH_ID)
    expect(s.d.writeClipboard).toHaveBeenCalledWith('- 가상자동차 회의를 진행함', {
      excludeFromHistory: true
    })
    expect(s.d.emit).toHaveBeenCalledWith({ type: 'unmasked', restored: 1 })
    expect(s.notes[0]).toContain('이름 1건 되돌림')
  })

  it('견본이 없으면 AI 티만 지우고 등록을 권한다(마지막 프롬프트가 없어도 원문 대조 없이 고친다)', async () => {
    const s = setup({ kinds: () => [], samples: () => [], lastPrompt: () => null })
    await s.c.run(STYLE_POLISH_ID)
    expect(s.clipboard()).toBe(
      '- 장비 수리를 11/20까지 완료하겠습니다.\n- 커버리지는 92%로 확인되었습니다.'
    )
    expect(s.notes[0]).toMatch(
      /^AI 티를 지웠어요 · 군더더기 1 · 꾸밈 기호 3\. 내가 쓴 글을 '내 말투로 등록'하면 끝맺음도 맞춰요\./
    )
  })

  it('고칠 것이 없으면 클립보드를 그대로 두고, 비어 있으면 알린다', async () => {
    const same = setup({ readClipboard: async () => '- 장비 수리 요청함' })
    await same.c.run(STYLE_POLISH_ID)
    expect(same.d.writeClipboard).not.toHaveBeenCalled()
    expect(same.notes[0]).toBe('고칠 AI 티를 찾지 못했어요. 클립보드는 그대로예요.')
    const empty = setup({ readClipboard: async () => '  ' })
    await empty.c.run(STYLE_POLISH_ID)
    expect(empty.notes[0]).toContain('클립보드가 비어 있어요')
  })
})

describe('내 말투로 등록', () => {
  it('선택한 글을 견본으로 더하고 모은 개수와 말투를 알린다', async () => {
    const s = setup()
    await s.c.run(`${STYLE_ADD_PREFIX}회의록`)
    expect(s.d.addSample).toHaveBeenCalledWith(
      '회의록',
      '- 내가 쓴 회의록 줄 하나 요청함\n- 둘째 줄 공유 예정'
    )
    expect(s.notes[0]).toMatch(/^회의록 말투 견본을 3개 모았어요\. 끝맺음: 개조식/)
  })

  it('선택이 없으면 까닭을 알리고, 없는 종류는 실행하지 않는다', async () => {
    const s = setup({ captureSelection: async () => ({ text: null, skipped: 'terminal' }) })
    await s.c.run(`${STYLE_ADD_PREFIX}회의록`)
    expect(s.notes[0]).toBe(
      '터미널에서는 가져오지 않아요. 내가 쓴 회의록을 선택한 뒤 다시 실행해 주세요.'
    )
    expect(s.d.emit).toHaveBeenCalledWith({ type: 'capture-failed', reason: 'terminal' })
    await s.c.run(`${STYLE_ADD_PREFIX}없는 종류`)
    expect(s.notes[1]).toContain('이 말투 종류가 없어졌어요')
  })

  it('다른 명령 id는 처리하지 않는다', async () => {
    expect(await setup().c.run('cmd.unmask')).toBe(false)
  })
})

it('createLastPrompt: 8시간이 지나면 잊는다', () => {
  let t = 0
  const last = createLastPrompt(() => t)
  last.set('회의록', '원문')
  t = LAST_PROMPT_TTL_MS
  expect(last.get()).toMatchObject({ kind: '회의록', input: '원문' })
  t = LAST_PROMPT_TTL_MS + 1
  expect(last.get()).toBeNull()
})
