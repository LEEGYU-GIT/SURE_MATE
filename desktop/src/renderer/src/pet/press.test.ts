import { describe, expect, it, vi } from 'vitest'
import { createPressTracker } from './press'

describe('createPressTracker: 펫을 누름·뗌을 main에 한 번씩 알린다(Review Focus 4)', () => {
  it('누르면 true, 떼면 false. 그 뒤 cancel·blur는 아무것도 보내지 않는다', () => {
    const send = vi.fn()
    const t = createPressTracker(send)
    t.down()
    t.up()
    t.cancel()
    t.blur()
    expect(send.mock.calls).toEqual([[true], [false]])
  })

  it('누른 채 창이 포커스를 잃으면(blur) false를 한 번 보낸다', () => {
    const send = vi.fn()
    const t = createPressTracker(send)
    t.down()
    t.blur()
    t.blur()
    t.up()
    expect(send.mock.calls).toEqual([[true], [false]])
  })

  it('누른 채 포인터를 놓치면(pointercancel·lostpointercapture) false를 한 번 보낸다', () => {
    const send = vi.fn()
    const t = createPressTracker(send)
    t.down()
    t.cancel()
    t.cancel()
    expect(send.mock.calls).toEqual([[true], [false]])
  })

  it('누르지 않은 채 뗌은 보내지 않는다', () => {
    const send = vi.fn()
    const t = createPressTracker(send)
    t.up()
    t.cancel()
    t.blur()
    expect(send).not.toHaveBeenCalled()
  })

  it('(M3) 뗌이 렌더러에 오지 않았어도(누르는 중 창이 숨음 등) 다음 누름은 보낸다. 겹친 누름은 main이 무시한다', () => {
    const send = vi.fn()
    const t = createPressTracker(send)
    t.down()
    // pointerup·pointercancel·blur가 오지 않았다(main은 버튼 조회로 이미 놓았다)
    t.down()
    t.up()
    expect(send.mock.calls).toEqual([[true], [true], [false]])
    // 그 뒤 뗌은 한 번뿐
    t.cancel()
    t.blur()
    expect(send.mock.calls).toHaveLength(3)
  })

  it('뗀 뒤 다시 누르면 다시 한 쌍을 보낸다', () => {
    const send = vi.fn()
    const t = createPressTracker(send)
    t.down()
    t.up()
    t.down()
    t.up()
    expect(send.mock.calls).toEqual([[true], [false], [true], [false]])
  })
})
