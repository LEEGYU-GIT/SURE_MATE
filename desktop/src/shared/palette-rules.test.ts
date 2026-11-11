import { describe, expect, it } from 'vitest'
import { needsResize, palettePosition, paletteReturnTarget, shouldHideOnBlur } from './palette-rules'

it('팔레트 위치', () => {
  expect(palettePosition({ x: 0, y: 0, width: 1920, height: 1040 }, { width: 720, height: 460 })).toEqual({
    x: 600,
    y: 229,
    width: 720,
    height: 460
  })
})

it('크기 재조정 필요 여부', () => {
  expect(needsResize({ width: 1080, height: 690 }, { width: 720, height: 460 }, 2)).toBe(true)
  expect(needsResize({ width: 721, height: 460 }, { width: 720, height: 460 }, 2)).toBe(false)
})

it('blur로 숨길지', () => {
  expect(shouldHideOnBlur(1000, 1100, false)).toBe(false)
  expect(shouldHideOnBlur(1000, 1150, false)).toBe(true)
  expect(shouldHideOnBlur(1000, 5000, true)).toBe(false)
})

describe('paletteReturnTarget: 팔레트를 닫을 때 돌아갈 창(Sure-Mate 창은 기억하지 않는다, M6 최종 검토 I1)', () => {
  const PALETTE = '500'
  const PET = '600'
  const SETTINGS = '700'
  const own = new Set([PALETTE, PET, SETTINGS])
  const isOwn = (h: string): boolean => own.has(h)
  const pick = (foreground: string | null, o: { current?: string | null; returnTo?: string | null } = {}): string | null =>
    paletteReturnTarget({ foreground, palette: PALETTE, current: o.current ?? '111', returnTo: o.returnTo ?? null, isOwn })

  it('사용자 창이 앞에 있으면 그 창', () => {
    expect(pick('4242')).toBe('4242')
    // 조종을 끝내며 돌려받은 창보다 지금 앞에 있는 사용자 창이 먼저다(포커스 복귀가 이미 끝났다)
    expect(pick('4242', { returnTo: '1001' })).toBe('4242')
  })

  it('팔레트 자신이 앞에 있으면(이미 열려 있음) 기억한 창을 그대로 둔다', () => {
    expect(pick(PALETTE)).toBe('111')
    expect(pick(PALETTE, { returnTo: '1001' })).toBe('111')
  })

  it('앞 창이 없으면(Win32 없음) 기억한 창을 그대로 둔다', () => {
    expect(pick(null)).toBe('111')
  })

  it('펫 창(조종 중)이 아직 앞에 있으면 조종을 끝내며 돌려받은 창, 없으면 null(펫 창으로 돌아가지 않는다)', () => {
    expect(pick(PET, { returnTo: '1001' })).toBe('1001')
    expect(pick(PET)).toBeNull()
  })

  it('설정 창 등 다른 Sure-Mate 창은 기억하지 않는다(옛 창으로도 돌아가지 않는다)', () => {
    expect(pick(SETTINGS)).toBeNull()
    expect(pick(SETTINGS, { current: '4242' })).toBeNull()
  })
})
