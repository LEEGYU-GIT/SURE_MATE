import { describe, expect, it, vi } from 'vitest'
import { createKeyTracker, keyFromCode } from './pet-keys'

describe('keyFromCode: 조종 모드 키(설계 §14-2)', () => {
  it('방향키 넷·Space·Escape를 펫 키로 바꾼다(e.code라 한/영 상태와 무관)', () => {
    expect(keyFromCode('ArrowLeft')).toBe('left')
    expect(keyFromCode('ArrowRight')).toBe('right')
    expect(keyFromCode('ArrowUp')).toBe('up')
    expect(keyFromCode('ArrowDown')).toBe('down')
    expect(keyFromCode('Space')).toBe('jump')
    expect(keyFromCode('Escape')).toBe('end')
  })

  it('다른 키·빈 코드(스캔 코드 없이 보낸 키)·글자 값(e.key)·객체 속성 이름은 null', () => {
    for (const code of [
      'KeyA',
      '',
      'Enter',
      'Numpad4',
      'Numpad8',
      'ShiftLeft',
      'arrowleft',
      'Left',
      'Esc',
      ' ',
      'Lang1',
      'HangulMode',
      'Tab',
      'toString',
      '__proto__',
      'constructor'
    ]) {
      expect(keyFromCode(code), code).toBeNull()
    }
  })
})

describe('createKeyTracker: 누름·뗌을 main에 한 번씩 알린다', () => {
  it('펫 키는 처리했다고 알리고(기본 동작 막기) 다른 키는 그냥 둔다', () => {
    const send = vi.fn()
    const t = createKeyTracker(send)
    expect(t.down('ArrowRight', false)).toBe(true)
    expect(t.up('ArrowRight')).toBe(true)
    expect(t.down('KeyA', false)).toBe(false)
    expect(t.up('KeyA')).toBe(false)
    expect(send.mock.calls).toEqual([
      ['right', true],
      ['right', false]
    ])
  })

  it('자동 반복(repeat)과 이미 누른 키의 keydown은 다시 보내지 않지만 처리한 키로 알린다', () => {
    const send = vi.fn()
    const t = createKeyTracker(send)
    t.down('ArrowLeft', false)
    expect(t.down('ArrowLeft', true)).toBe(true)
    expect(t.down('ArrowLeft', false)).toBe(true) // repeat 표시 없이 다시 온 keydown
    expect(t.down('Space', true)).toBe(true) // 처음부터 반복으로 온 키는 보내지 않는다
    expect(send.mock.calls).toEqual([['left', true]])
  })

  it('누른 적 없는 키의 keyup은 보내지 않는다(조종 시작 전에 누르고 있던 키)', () => {
    const send = vi.fn()
    const t = createKeyTracker(send)
    expect(t.up('ArrowUp')).toBe(true)
    expect(send).not.toHaveBeenCalled()
  })

  it('창이 포커스를 잃으면(blur) 누르고 있던 키를 모두 뗀 것으로 한 번씩 보낸다', () => {
    const send = vi.fn()
    const t = createKeyTracker(send)
    t.down('ArrowRight', false)
    t.down('ArrowUp', false)
    t.down('Space', false)
    t.up('Space')
    send.mockClear()
    t.blur()
    t.blur()
    expect(send.mock.calls).toEqual([
      ['right', false],
      ['up', false]
    ])
    // blur 뒤 같은 키를 다시 누르면 다시 보낸다
    t.down('ArrowRight', false)
    expect(send.mock.lastCall).toEqual(['right', true])
  })
})
