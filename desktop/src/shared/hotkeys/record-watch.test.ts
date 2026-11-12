import { describe, expect, it } from 'vitest'
import { createRecordWatch, type RecordKey, type RecordWatchResult } from './record-watch'

type Mods = Partial<Pick<RecordKey, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'isComposing'>>
const ev = (type: RecordKey['type'], code: string, mods: Mods = {}): RecordKey => ({
  type,
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  isComposing: false,
  ...mods
})
const down = (code: string, mods: Mods = {}): RecordKey => ev('keydown', code, mods)
const up = (code: string, mods: Mods = {}): RecordKey => ev('keyup', code, mods)
const CA = { ctrlKey: true, altKey: true }

/** 이벤트를 차례로 먹이고 결과를 모은다 */
const run = (events: RecordKey[]): RecordWatchResult[] => {
  const w = createRecordWatch()
  return events.map((e) => w.feed(e))
}

describe('보통 녹화: 주 키의 keydown이 오면 combo, 나머지는 기다림', () => {
  it('Ctrl+Alt+K를 누르고 떼면 K의 keydown만 combo, 떼는 동안은 pending(주 키가 왔으니 아무 안내도 없다)', () => {
    expect(
      run([down('ControlLeft', { ctrlKey: true }), down('AltLeft', CA), down('KeyK', CA), up('KeyK', CA), up('AltLeft', { ctrlKey: true }), up('ControlLeft')])
    ).toEqual([{ kind: 'pending' }, { kind: 'pending' }, { kind: 'combo' }, { kind: 'pending' }, { kind: 'pending' }, { kind: 'pending' }])
  })

  it('보조키를 주 키보다 먼저 떼도 안내하지 않는다(주 키가 왔다)', () => {
    expect(run([down('ControlLeft', { ctrlKey: true }), down('KeyK', { ctrlKey: true }), up('ControlLeft'), up('KeyK')]).map((r) => r.kind)).toEqual([
      'pending',
      'combo',
      'pending',
      'pending'
    ])
  })

  it('보조키 없는 키·Esc의 keydown도 combo(조합 판단은 녹화 칸이 한다), 누르고 있어 반복된 keydown도 combo', () => {
    expect(run([down('KeyK'), up('KeyK'), down('Escape'), down('KeyQ', CA), down('KeyQ', CA)]).map((r) => r.kind)).toEqual(['combo', 'pending', 'combo', 'combo', 'combo'])
  })
})

describe('다른 프로그램이 주 키를 가져감: keydown 없이 keyup만 온다', () => {
  it('Ctrl·Alt를 누른 채 keydown 없는 keyup이 오면 그 keyup의 코드와 보조키로 만든 조합(swallowed)', () => {
    expect(run([down('ControlLeft', { ctrlKey: true }), down('AltLeft', CA), up('KeyK', CA), up('AltLeft', { ctrlKey: true }), up('ControlLeft')])).toEqual([
      { kind: 'pending' },
      { kind: 'pending' },
      { kind: 'swallowed', acc: 'Ctrl+Alt+K' },
      // keyup으로 주 키를 봤으니 보조키를 다 떼도 '들어오지 않았어요'를 또 알리지 않는다
      { kind: 'pending' },
      { kind: 'pending' }
    ])
  })

  it('Shift·숫자·F키도 같은 순서로 조합을 만든다(Alt만, Ctrl만)', () => {
    const shifted = { ctrlKey: true, shiftKey: true }
    expect(run([down('ControlLeft', { ctrlKey: true }), down('ShiftLeft', shifted), up('Digit1', shifted)])[2]).toEqual({ kind: 'swallowed', acc: 'Ctrl+Shift+1' })
    expect(run([down('AltLeft', { altKey: true }), up('F9', { altKey: true })])[1]).toEqual({ kind: 'swallowed', acc: 'Alt+F9' })
  })

  it('keyup으로 본 조합을 녹화할 수 없으면(Win 키·모르는 키) 그 까닭(invalid)', () => {
    const win = run([down('MetaLeft', { metaKey: true }), up('KeyK', { metaKey: true }), up('MetaLeft')])
    expect(win[1]).toMatchObject({ kind: 'invalid', reason: expect.stringContaining('Windows') })
    // Win 키만 눌렀으면 보조키를 다 떼도 '들어오지 않았어요'는 없다(Ctrl·Alt를 누르지 않았다)
    expect(win[2]).toEqual({ kind: 'pending' })
    expect(run([down('ControlLeft', { ctrlKey: true }), up('PrintScreen', { ctrlKey: true })])[1]).toMatchObject({ kind: 'invalid', reason: expect.any(String) })
  })

  it('보조키 없이 뗀 키는 keydown이 없어도 넘긴다(녹화 칸에 오기 전에 누른 Enter 등)', () => {
    expect(run([up('Enter'), up('Space'), up('KeyK', { shiftKey: true })])).toEqual([{ kind: 'pending' }, { kind: 'pending' }, { kind: 'pending' }])
  })

  it('보조키를 모두 뗀 뒤에 뗀 주 키는 넘기고, 그 누름은 들어오지 않은 것으로 알린다', () => {
    expect(run([down('ControlLeft', { ctrlKey: true }), down('AltLeft', CA), up('AltLeft', { ctrlKey: true }), up('ControlLeft'), up('KeyK')])).toEqual([
      { kind: 'pending' },
      { kind: 'pending' },
      { kind: 'pending' },
      { kind: 'nothing-arrived', held: 'Ctrl+Alt' },
      { kind: 'pending' }
    ])
  })

  it('keydown이 온 키(보조키를 누르기 전부터 누르고 있던 키 포함)의 keyup은 가져간 것이 아니다', () => {
    expect(run([down('KeyK'), down('ControlLeft', { ctrlKey: true }), up('KeyK', { ctrlKey: true }), up('ControlLeft')]).map((r) => r.kind)).toEqual([
      'combo',
      'pending',
      'pending',
      // K의 keyup이 이번 누름 안에 왔다
      'pending'
    ])
  })
})

describe('보조키를 모두 뗐는데 주 키가 하나도 오지 않음(keydown·keyup 모두 가져간 경우)', () => {
  it('Ctrl·Alt를 눌렀다 떼면 nothing-arrived, held는 그동안 누른 보조키(Ctrl·Alt·Shift 순서)', () => {
    expect(run([down('AltLeft', { altKey: true }), down('ControlLeft', CA), up('ControlLeft', { altKey: true }), up('AltLeft')]).at(-1)).toEqual({
      kind: 'nothing-arrived',
      held: 'Ctrl+Alt'
    })
    expect(run([down('ControlLeft', { ctrlKey: true }), up('ControlLeft')]).at(-1)).toEqual({ kind: 'nothing-arrived', held: 'Ctrl' })
    const shifted = { ctrlKey: true, shiftKey: true }
    expect(run([down('ShiftLeft', { shiftKey: true }), down('ControlLeft', shifted), up('ShiftLeft', { ctrlKey: true }), up('ControlLeft')]).at(-1)).toEqual({
      kind: 'nothing-arrived',
      held: 'Ctrl+Shift'
    })
  })

  it('보조키 일부만 떼는 동안은 기다린다', () => {
    expect(run([down('ControlLeft', { ctrlKey: true }), down('AltLeft', CA), up('AltLeft', { ctrlKey: true })]).map((r) => r.kind)).toEqual(['pending', 'pending', 'pending'])
  })

  it('Shift·Win만 눌렀다 떼면 알리지 않는다(Ctrl·Alt가 없는 조합은 녹화 칸이 따로 안내한다)', () => {
    expect(run([down('ShiftLeft', { shiftKey: true }), up('ShiftLeft')]).at(-1)).toEqual({ kind: 'pending' })
    expect(run([down('MetaLeft', { metaKey: true }), up('MetaLeft')]).at(-1)).toEqual({ kind: 'pending' })
  })

  it('누름마다 따로 본다: 앞 누름에 주 키가 왔어도 다음 누름에 오지 않으면 알리고, 알린 뒤에는 새로 시작한다', () => {
    const w = createRecordWatch()
    for (const e of [down('ControlLeft', { ctrlKey: true }), down('KeyK', { ctrlKey: true }), up('KeyK', { ctrlKey: true })]) w.feed(e)
    expect(w.feed(up('ControlLeft'))).toEqual({ kind: 'pending' })
    w.feed(down('AltLeft', { altKey: true }))
    expect(w.feed(up('AltLeft'))).toEqual({ kind: 'nothing-arrived', held: 'Alt' })
    // 보조키 없이 누른 키는 다음 누름의 '주 키가 왔다'로 치지 않는다
    w.feed(down('KeyJ'))
    w.feed(up('KeyJ'))
    w.feed(down('ControlLeft', { ctrlKey: true }))
    expect(w.feed(up('ControlLeft'))).toEqual({ kind: 'nothing-arrived', held: 'Ctrl' })
  })

  it('짝 없는 보조키 keyup(녹화 칸에 오기 전에 누른 보조키)은 넘긴다', () => {
    expect(run([up('ControlLeft'), up('AltLeft')])).toEqual([{ kind: 'pending' }, { kind: 'pending' }])
  })
})
