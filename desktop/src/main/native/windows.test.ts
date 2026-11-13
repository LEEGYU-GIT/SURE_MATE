import { describe, expect, it } from 'vitest'
import { bringToFront, createTopmostLedger, isTopmostWith, setTopmost, TOPMOST_LEDGER_MS, type ZOrderWin32 } from './windows'

const TOPMOST = BigInt.asUintN(64, -1n)
const NOTOPMOST = BigInt.asUintN(64, -2n)

/**
 * SetWindowPos 호출을 기록하는 가짜 Win32(winuser.h 값). lag면 비동기 요청이 반쯤 처리된 상태를 흉내 낸다: HWND_TOPMOST는 곧바로
 * WS_EX_TOPMOST를 켜고, HWND_NOTOPMOST는 아직 처리되지 않아 그대로 둔다(그 창의 메시지 큐에서 차례를 기다리는 중)
 */
function fake(exStyle: number, o: { lag?: boolean } = {}): { w: ZOrderWin32; calls: { hwnd: bigint; after: bigint | null; flags: number }[] } {
  const calls: { hwnd: bigint; after: bigint | null; flags: number }[] = []
  let style = exStyle
  const w: ZOrderWin32 = {
    toHwnd: (s) => BigInt(s),
    GetWindowLongPtrW: () => style,
    SetWindowPos: (hwnd, after, _x, _y, _cx, _cy, flags) => {
      calls.push({ hwnd, after, flags })
      if (o.lag && after === TOPMOST) style |= 0x8
      return true
    },
    GWL_EXSTYLE: -20,
    WS_EX_TOPMOST: 0x8,
    HWND_TOPMOST: TOPMOST,
    HWND_NOTOPMOST: NOTOPMOST,
    SWP_NOSIZE: 0x1,
    SWP_NOMOVE: 0x2,
    SWP_NOACTIVATE: 0x10,
    SWP_NOOWNERZORDER: 0x200,
    SWP_ASYNCWINDOWPOS: 0x4000
  }
  return { w, calls }
}

const FLAGS = 0x1 | 0x2 | 0x10 | 0x200 | 0x4000
const afters = (calls: { after: bigint | null }[]): string[] => calls.map((c) => (c.after === TOPMOST ? 'TOPMOST' : c.after === NOTOPMOST ? 'NOTOPMOST' : String(c.after)))

describe('bringToFront: 다른 앱의 창을 지금 앞 창보다 위로(2026-11-12)', () => {
  it('맨 앞(HWND_TOPMOST)으로 올린 직후 보통 창(HWND_NOTOPMOST)으로 되돌린다. 활성화·이동·크기 없이 비동기', () => {
    const t = fake(0)
    bringToFront(t.w, '1234', createTopmostLedger(() => 0))
    expect(t.calls).toEqual([
      { hwnd: 1234n, after: TOPMOST, flags: FLAGS },
      { hwnd: 1234n, after: NOTOPMOST, flags: FLAGS }
    ])
  })

  it('원래 항상 위(WS_EX_TOPMOST)인 창은 맨 앞으로만 올리고 되돌리지 않는다(그 창의 항상 위 설정을 유지)', () => {
    const t = fake(0x8 | 0x100)
    bringToFront(t.w, '77', createTopmostLedger(() => 0))
    expect(t.calls).toEqual([{ hwnd: 77n, after: TOPMOST, flags: FLAGS }])
  })

  it('(C1) 앞 요청이 반쯤 처리돼 WS_EX_TOPMOST가 켜져 보여도, Sure-Mate가 방금 올린 창이면 다음 올리기도 HWND_NOTOPMOST까지 보낸다(항상 위로 남지 않게)', () => {
    const t = fake(0, { lag: true })
    const ledger = createTopmostLedger(() => 1000)
    bringToFront(t.w, '9', ledger)
    bringToFront(t.w, '9', ledger)
    // 마지막 요청이 NOTOPMOST라 처리 차례가 어떻든 보통 창으로 끝난다
    expect(afters(t.calls)).toEqual(['TOPMOST', 'NOTOPMOST', 'TOPMOST', 'NOTOPMOST'])
  })

  it('기록은 잠깐만(TOPMOST_LEDGER_MS) 쓴다: 그 뒤 항상 위로 보이는 창은 원래 항상 위인 창으로 다룬다', () => {
    let now = 0
    const t = fake(0, { lag: true })
    const ledger = createTopmostLedger(() => now)
    bringToFront(t.w, '9', ledger)
    now = TOPMOST_LEDGER_MS + 1
    t.calls.length = 0
    bringToFront(t.w, '9', ledger)
    expect(afters(t.calls)).toEqual(['TOPMOST'])
  })
})

describe('setTopmost: 화면 감추기의 항상 위 고정·풀기(옵션, 2026-11-12)', () => {
  it('고정은 HWND_TOPMOST, 풀기는 HWND_NOTOPMOST 한 번씩. 이동·크기·활성화 없이 비동기', () => {
    const t = fake(0)
    const ledger = createTopmostLedger(() => 0)
    setTopmost(t.w, '5', true, ledger)
    setTopmost(t.w, '5', false, ledger)
    expect(t.calls).toEqual([
      { hwnd: 5n, after: TOPMOST, flags: FLAGS },
      { hwnd: 5n, after: NOTOPMOST, flags: FLAGS }
    ])
  })

  it('(C1) 방금 고정을 푼 창은 풀기가 아직 처리되지 않아 항상 위로 보여도 원래 항상 위인 창이 아니다(다음 올리기·고정 판단)', () => {
    const t = fake(0, { lag: true })
    const ledger = createTopmostLedger(() => 0)
    setTopmost(t.w, '5', true, ledger)
    setTopmost(t.w, '5', false, ledger)
    expect(isTopmostWith(t.w, '5', ledger)).toBe(false)
    t.calls.length = 0
    bringToFront(t.w, '5', ledger)
    expect(afters(t.calls)).toEqual(['TOPMOST', 'NOTOPMOST'])
    // Sure-Mate가 건드린 적 없는 원래 항상 위인 창은 그대로 항상 위다
    expect(isTopmostWith(fake(0x8).w, '6', ledger)).toBe(true)
  })
})
