import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { controlReturnTarget, handOffForCapture, waitForeground } from './pet-focus'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const PALETTE = '500'
const SETTINGS = '700'
const own = new Set([PALETTE, '600', SETTINGS])
const isOwn = (h: string): boolean => own.has(h)

describe('controlReturnTarget: 조종을 끝낼 때 돌아갈 창(설정 창이 아닌 Sure-Mate 창은 기억하지 않는다, M6 최종 검토 I1)', () => {
  const pick = (
    foreground: string | null,
    paletteReturn: string | null = '1001',
    settings: string | null = SETTINGS
  ): string | null =>
    controlReturnTarget({
      foreground,
      palette: { hwnd: PALETTE, returnTo: paletteReturn },
      isOwn,
      isReturnable: (h) => h === settings
    })

  it('사용자 창이면 그 창, 앞 창이 없으면(Win32 없음) null', () => {
    expect(pick('4242')).toBe('4242')
    expect(pick(null)).toBeNull()
  })

  it('팔레트를 연 채 조종 단축키: 팔레트 대신 팔레트가 돌아갈 창(숨은 팔레트로 포커스를 돌리지 않는다)', () => {
    expect(pick(PALETTE)).toBe('1001')
    expect(pick(PALETTE, null)).toBeNull()
  })

  it('설정 창(첫 실행 안내·따라 해 보기 포함)은 사용자 창처럼 기억한다: 보이고 포커스를 받는 보통 창이다(2026-11-12)', () => {
    expect(pick(SETTINGS)).toBe(SETTINGS)
  })

  it('펫 같은 그 밖의 Sure-Mate 창은 기억하지 않는다. 설정 창이 닫혀 있으면(null) 그 핸들도 Sure-Mate 창으로 본다', () => {
    expect(pick('600')).toBeNull()
    expect(pick(SETTINGS, '1001', null)).toBeNull()
    // isReturnable을 주지 않으면 예전처럼 모든 Sure-Mate 창을 기억하지 않는다
    expect(
      controlReturnTarget({
        foreground: SETTINGS,
        palette: { hwnd: PALETTE, returnTo: '1001' },
        isOwn
      })
    ).toBeNull()
  })
})

/** 앞 창 차례(조회할 때마다 다음 값, 끝이면 마지막 값) */
function foregrounds(...seq: (string | null)[]): () => string | null {
  let i = 0
  return () => seq[Math.min(i++, seq.length - 1)]
}

const clock = { now: () => Date.now(), sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) }

describe('waitForeground: 그 창이 앞에 올 때까지 기다린다(팔레트 숨김 뒤 기다리기와 같은 80ms)', () => {
  it('이미 앞에 있으면 기다리지 않고 true', async () => {
    const foreground = vi.fn(() => '1001')
    await expect(waitForeground({ target: '1001', foreground, ...clock })).resolves.toBe(true)
    expect(foreground).toHaveBeenCalledTimes(1)
  })

  it('10ms 간격으로 확인해 앞에 오면 true', async () => {
    const p = waitForeground({ target: '1001', foreground: foregrounds('600', '600', '1001'), ...clock })
    await vi.advanceTimersByTimeAsync(20)
    await expect(p).resolves.toBe(true)
  })

  it('80ms 안에 오지 않으면 false(그 뒤에는 기다리지 않는다)', async () => {
    let done: boolean | null = null
    void waitForeground({ target: '1001', foreground: () => '600', ...clock }).then((v) => (done = v))
    await vi.advanceTimersByTimeAsync(70)
    expect(done).toBeNull()
    await vi.advanceTimersByTimeAsync(20)
    expect(done).toBe(false)
  })
})

describe('handOffForCapture: 선택 글을 읽기 전에 조종을 끝내고 원래 창이 앞에 오길 기다린다(바 고정 프롬프트·조회 단축키, I1)', () => {
  it('조종 중이 아니면(null) 앞 창을 조회하지 않고 바로 끝난다', async () => {
    const foreground = vi.fn(() => '600')
    await handOffForCapture({ handOff: () => null, foreground, ...clock })
    expect(foreground).not.toHaveBeenCalled()
  })

  it('조종 중이면 끝낸 뒤(포커스 복귀) 돌려받은 창이 앞에 올 때까지 기다린다', async () => {
    const calls: string[] = []
    const fg = foregrounds('600', '1001')
    let done = false
    void handOffForCapture({
      handOff: () => {
        calls.push('handOff')
        return '1001'
      },
      foreground: () => {
        const h = fg()
        calls.push(`fg:${h}`)
        return h
      },
      ...clock
    }).then(() => (done = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(10)
    expect(done).toBe(true)
    expect(calls).toEqual(['handOff', 'fg:600', 'fg:1001'])
  })

  it('원래 창이 80ms 안에 앞에 오지 않아도 그 뒤에는 진행한다(가져오기가 앞 창을 다시 확인한다)', async () => {
    let done = false
    void handOffForCapture({ handOff: () => '1001', foreground: () => '600', ...clock }).then(() => (done = true))
    await vi.advanceTimersByTimeAsync(90)
    expect(done).toBe(true)
  })
})
