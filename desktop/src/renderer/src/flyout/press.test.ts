import { expect, it } from 'vitest'
import { createPress, PRESS_CLICK_AFTER_UP_MS } from './press'

function setup() {
  let t = 1000
  const press = createPress(() => t)
  const ran: string[] = []
  return {
    press,
    ran,
    advance: (ms: number) => {
      t += ms
    }
  }
}

it('왼쪽 버튼을 떼면 한 번 실행하고, 뒤따르는 click은 건너뛴다', () => {
  const s = setup()
  const h = s.press(() => s.ran.push('a'))
  h.onPointerUp({ button: 0 })
  s.advance(5)
  h.onClick()
  expect(s.ran).toEqual(['a'])
})

it('누름이 창에 오지 않아 뗌만 와도 실행한다(Windows에서 숨겼던 펼침 창의 첫 누름이 사라지는 경우)', () => {
  const s = setup()
  s.press(() => s.ran.push('a')).onPointerUp({ button: 0 })
  expect(s.ran).toEqual(['a'])
})

it('뗌 없이 온 click(화면 읽기 프로그램·자동화의 실행)은 실행한다', () => {
  const s = setup()
  s.press(() => s.ran.push('a')).onClick()
  expect(s.ran).toEqual(['a'])
})

it('오른쪽·가운데 버튼을 떼면 실행하지 않는다', () => {
  const s = setup()
  const h = s.press(() => s.ran.push('a'))
  h.onPointerUp({ button: 2 })
  h.onPointerUp({ button: 1 })
  expect(s.ran).toEqual([])
})

it('뗌 뒤 시간이 지나 온 click은 다른 실행으로 본다', () => {
  const s = setup()
  const a = s.press(() => s.ran.push('a'))
  const b = s.press(() => s.ran.push('b'))
  a.onPointerUp({ button: 0 })
  s.advance(PRESS_CLICK_AFTER_UP_MS + 1)
  b.onClick()
  expect(s.ran).toEqual(['a', 'b'])
})
