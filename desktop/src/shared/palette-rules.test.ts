import { describe, expect, it } from 'vitest'
import { confirmBounds, needsResize, palettePosition, paletteReturnTarget, parseConfirmSize, shouldHideOnBlur } from './palette-rules'

describe('confirmBounds: 확인 화면 창 자리(기본 1040×760, 지난 크기 기억, 작업 영역 여백 16, 최소 720×460)', () => {
  const FHD = { x: 0, y: 0, width: 1920, height: 1040 }

  it('저장한 크기가 없으면 1040×760을 가로 가운데·위 22%에 둔다', () => {
    expect(confirmBounds(FHD, null)).toEqual({ x: 440, y: 229, width: 1040, height: 760 })
  })

  it('위 22%에 두면 아래 여백 16을 넘을 때는 위로 당긴다(1600×852)', () => {
    expect(confirmBounds({ x: 0, y: 0, width: 1600, height: 852 }, null)).toEqual({ x: 280, y: 76, width: 1040, height: 760 })
  })

  it('작업 영역이 작으면 여백 16을 남기고 줄인다(1280×720 125% → 1024×536)', () => {
    expect(confirmBounds({ x: 0, y: 0, width: 1024, height: 536 }, null)).toEqual({ x: 16, y: 16, width: 992, height: 504 })
  })

  it('작업 영역이 최소 크기보다 작아도 화면 안에 맞춘다(1280×720 150% → 853×480)', () => {
    expect(confirmBounds({ x: 0, y: 0, width: 853, height: 480 }, null)).toEqual({ x: 16, y: 16, width: 821, height: 448 })
  })

  it('저장한 크기로 연다', () => {
    expect(confirmBounds(FHD, { width: 1200, height: 900 })).toEqual({ x: 360, y: 124, width: 1200, height: 900 })
  })

  it('저장한 크기가 작업 영역보다 크면(큰 모니터에서 키운 뒤 옮김) 작업 영역 안으로 줄인다', () => {
    expect(confirmBounds(FHD, { width: 3000, height: 2000 })).toEqual({ x: 16, y: 16, width: 1888, height: 1008 })
  })

  it('저장한 크기가 최소보다 작으면 최소 720×460으로 연다', () => {
    expect(confirmBounds(FHD, { width: 600, height: 300 })).toEqual({ x: 600, y: 229, width: 720, height: 460 })
  })

  it('왼쪽 보조 모니터(음수 좌표)에서도 그 작업 영역 안에 둔다', () => {
    expect(confirmBounds({ x: -1920, y: 0, width: 1920, height: 1040 }, null)).toEqual({ x: -1480, y: 229, width: 1040, height: 760 })
  })
})

describe('parseConfirmSize: 설정 파일의 확인 화면 크기', () => {
  it('정상 값은 정수로 반올림해 받는다', () => {
    expect(parseConfirmSize({ width: 1100.4, height: 800 })).toEqual({ width: 1100, height: 800 })
  })

  it('깨진 값은 없는 것으로 본다', () => {
    for (const raw of ['big', null, undefined, 3, { width: -1, height: 800 }, { width: 0, height: 800 }, { width: 9000, height: 800 }, { width: 1000 }, { width: '1000', height: 800 }, { width: Number.NaN, height: 800 }]) {
      expect(parseConfirmSize(raw)).toBeNull()
    }
  })
})

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
  const BAR = '800'
  const own = new Set([PALETTE, PET, SETTINGS, BAR])
  const isOwn = (h: string): boolean => own.has(h)
  const isReturnable = (h: string): boolean => h === SETTINGS
  const pick = (foreground: string | null, o: { current?: string | null; returnTo?: string | null } = {}): string | null =>
    paletteReturnTarget({ foreground, palette: PALETTE, current: o.current ?? '111', returnTo: o.returnTo ?? null, isOwn, isReturnable })

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

  it('바·펼침 창 같은 다른 Sure-Mate 창은 기억하지 않는다(옛 창으로도 돌아가지 않는다)', () => {
    expect(pick(BAR)).toBeNull()
    expect(pick(BAR, { current: '4242' })).toBeNull()
  })

  it('설정 창(첫 실행 안내 포함)은 돌아갈 창으로 기억한다: 따라 해 보기의 메모를 그 창에서 가져온다(2026-11-12)', () => {
    expect(pick(SETTINGS)).toBe(SETTINGS)
    expect(pick(SETTINGS, { current: '4242', returnTo: '1001' })).toBe(SETTINGS)
  })

  it('isReturnable이 없으면 예전처럼 모든 Sure-Mate 창을 기억하지 않는다', () => {
    expect(paletteReturnTarget({ foreground: SETTINGS, palette: PALETTE, current: '111', returnTo: null, isOwn })).toBeNull()
  })
})
