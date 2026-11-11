/**
 * 말랑 메이트 조종 모드와 Sure-Mate의 다른 창(팔레트·바·조회 단축키) 사이의 포커스 이음새(설계 §14-2, M6 최종 검토 I1).
 * Win32·Electron 없이 시험할 수 있게 앞 창·시계를 주입받는다.
 */

/**
 * 조종을 끝낼 때(Esc·단축키·팔레트·선택 글 가져오기) 포커스를 돌려줄 창. Sure-Mate 창은 기억하지 않는다:
 * 팔레트가 앞에 있으면(팔레트를 연 채 조종 단축키) 팔레트가 돌아갈 창을 쓴다. 팔레트는 펫이 포커스를 가져가면 숨으므로
 * 숨은 팔레트로 포커스를 돌리면 보이지 않는 창이 키 입력을 받는다(Enter가 강조된 항목을 실행할 수 있다).
 * 그 밖의 Sure-Mate 창(설정 창 등)이면 null(포커스를 돌리지 않는다). 앞 창이 없으면(Win32 없음) null
 */
export function controlReturnTarget(o: {
  foreground: string | null
  palette: { hwnd: string | null; returnTo: string | null }
  isOwn(hwnd: string): boolean
}): string | null {
  const fg = o.foreground
  if (!fg) return null
  if (fg === o.palette.hwnd) return o.palette.returnTo
  return o.isOwn(fg) ? null : fg
}

/** 앞 창이 바뀌기를 기다리는 시간과 확인 간격(ms). 팔레트를 숨긴 뒤 원래 창을 기다리는 시간(hidePaletteAndRefocus)과 같다 */
export const FOREGROUND_WAIT = { timeoutMs: 80, pollMs: 10 } as const

export interface ForegroundClock {
  /** 지금 앞에 있는 창(HWND 10진 문자열). Win32가 없으면 null */
  foreground(): string | null
  now(): number
  sleep(ms: number): Promise<void>
}

/** target이 앞에 올 때까지 기다린다(최대 80ms, 10ms 간격). 왔으면 true */
export async function waitForeground(o: ForegroundClock & { target: string }): Promise<boolean> {
  const deadline = o.now() + FOREGROUND_WAIT.timeoutMs
  for (;;) {
    if (o.foreground() === o.target) return true
    if (!(o.now() < deadline)) return false
    await o.sleep(FOREGROUND_WAIT.pollMs)
  }
}

/**
 * 사용자 창에서 선택 글을 읽기 전에 부른다(바 고정 프롬프트·조회 단축키). 조종 중이면 handOff가 기억한 창으로 포커스를
 * 돌리며 조종을 끝내고, 그 창이 앞에 올 때까지 기다린다(조종 중에는 펫 창이 앞에 있어 펫 창에서 가져오게 된다).
 * 80ms 안에 오지 않아도 진행한다(가져오기가 앞 창을 다시 확인한다)
 */
export async function handOffForCapture(d: ForegroundClock & { handOff(): string | null }): Promise<void> {
  const back = d.handOff()
  if (back !== null) await waitForeground({ ...d, target: back })
}
