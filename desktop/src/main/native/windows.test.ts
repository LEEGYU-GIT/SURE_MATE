import { describe, expect, it } from 'vitest'
import { bringToFront, setTopmost, type ZOrderWin32 } from './windows'

/** SetWindowPos 호출만 기록하는 가짜 Win32(winuser.h 값) */
function fake(exStyle: number): { w: ZOrderWin32; calls: { hwnd: bigint; after: bigint | null; flags: number }[] } {
  const calls: { hwnd: bigint; after: bigint | null; flags: number }[] = []
  const w: ZOrderWin32 = {
    toHwnd: (s) => BigInt(s),
    GetWindowLongPtrW: () => exStyle,
    SetWindowPos: (hwnd, after, _x, _y, _cx, _cy, flags) => {
      calls.push({ hwnd, after, flags })
      return true
    },
    GWL_EXSTYLE: -20,
    WS_EX_TOPMOST: 0x8,
    HWND_TOPMOST: BigInt.asUintN(64, -1n),
    HWND_NOTOPMOST: BigInt.asUintN(64, -2n),
    SWP_NOSIZE: 0x1,
    SWP_NOMOVE: 0x2,
    SWP_NOACTIVATE: 0x10,
    SWP_NOOWNERZORDER: 0x200,
    SWP_ASYNCWINDOWPOS: 0x4000
  }
  return { w, calls }
}

const FLAGS = 0x1 | 0x2 | 0x10 | 0x200 | 0x4000

describe('bringToFront: 다른 앱의 창을 지금 앞 창보다 위로(2026-11-12)', () => {
  it('맨 앞(HWND_TOPMOST)으로 올린 직후 보통 창(HWND_NOTOPMOST)으로 되돌린다. 활성화·이동·크기 없이 비동기', () => {
    const t = fake(0)
    bringToFront(t.w, '1234')
    expect(t.calls).toEqual([
      { hwnd: 1234n, after: BigInt.asUintN(64, -1n), flags: FLAGS },
      { hwnd: 1234n, after: BigInt.asUintN(64, -2n), flags: FLAGS }
    ])
  })

  it('원래 항상 위(WS_EX_TOPMOST)인 창은 맨 앞으로만 올리고 되돌리지 않는다(그 창의 항상 위 설정을 유지)', () => {
    const t = fake(0x8 | 0x100)
    bringToFront(t.w, '77')
    expect(t.calls).toEqual([{ hwnd: 77n, after: BigInt.asUintN(64, -1n), flags: FLAGS }])
  })
})

describe('setTopmost: 화면 감추기의 항상 위 고정·풀기(옵션, 2026-11-12)', () => {
  it('고정은 HWND_TOPMOST, 풀기는 HWND_NOTOPMOST 한 번씩. 이동·크기·활성화 없이 비동기', () => {
    const t = fake(0)
    setTopmost(t.w, '5', true)
    setTopmost(t.w, '5', false)
    expect(t.calls).toEqual([
      { hwnd: 5n, after: BigInt.asUintN(64, -1n), flags: FLAGS },
      { hwnd: 5n, after: BigInt.asUintN(64, -2n), flags: FLAGS }
    ])
  })
})
