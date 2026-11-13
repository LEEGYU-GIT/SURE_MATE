import {
  decidePress,
  focusLeftOnHidden,
  HIDE_SESSION_MS,
  type HiddenWindow,
  type HideNote,
  type HideSession,
  type HideTarget,
  pinCheck,
  type PinTrigger,
  pinRelease,
  type PressDecision,
  startSession
} from '../../shared/workspace/hide'

/**
 * 화면 감추기가 쓰는 창 기능(workspace-runtime.ts가 native/windows.ts로 채운다). Win32를 쓸 수 없으면 state는 null, 나머지는 아무것도
 * 하지 않는다(서비스가 먼저 nativeOk로 막는다). 창을 바꾸는 요청은 모두 비동기라 응답 없는 창에서 main이 멈추지 않는다
 */
export interface HidePorts {
  /** 지금 앞 창(없거나 읽지 못하면 null) */
  foreground(): string | null
  /** 그 창의 지금 상태(없어졌거나 숨었으면 null. 최소화한 창은 보이는 창이다) */
  state(hwnd: string): { minimized: boolean; maximized: boolean; hung: boolean } | null
  /** 창이 아직 있는지(IsWindow). 스스로 숨은 창(트레이로 닫은 메신저)도 있는 창이다 */
  exists(hwnd: string): boolean
  /** 활성화 없이 최소화(ShowWindowAsync SW_SHOWMINNOACTIVE). 보내지 못했으면 false */
  minimize(hwnd: string): boolean
  /** 최소화를 푼다: 최대화였으면 최대화로(SW_SHOWMAXIMIZED), 아니면 활성화 없이(SW_SHOWNOACTIVATE) */
  unminimize(hwnd: string, maximized: boolean): void
  /** 다른 창 위로(bringToFront: HWND_TOPMOST 뒤 HWND_NOTOPMOST, 활성화 없음) */
  raise(hwnd: string): void
  setForeground(hwnd: string): boolean
  /** 바탕 화면에 포커스(GetShellWindow) */
  focusDesktop(): boolean
  /** 원래 항상 위(WS_EX_TOPMOST)인지 */
  topmost(hwnd: string): boolean
  /** 항상 위로 고정(HWND_TOPMOST)·풀기(HWND_NOTOPMOST). 이동·크기·활성화 없이 비동기 */
  pin(hwnd: string): void
  unpin(hwnd: string): void
  /** 지금 앞 창의 맨 위 소유 창(대화상자는 그 앱 창)과 그것이 Sure-Mate 자신의 창인지. 없거나 읽지 못하면 null */
  foregroundRoot(): { hwnd: string; own: boolean } | null
  sleep(ms: number): Promise<void>
  now(): number
  /** ms마다 fn을 부른다. 돌려받은 함수로 멈춘다 */
  every(ms: number, fn: () => void): () => void
  /** 건수·까닭만(창 제목·이름 금지) */
  log(event: string, data: Record<string, unknown>): void
}

export const HIDE_TIMING = {
  /** 최소화·되돌리기 요청 뒤 처음 기다림, 이후 확인 간격과 최대 기다림(복원 실행기와 같은 값) */
  settleMs: 120,
  pollMs: 50,
  waitMs: 600,
  /** 되돌린 창을 아래에서 위로 올릴 때 창마다 쉬는 시간(비동기 요청이 차례대로 처리되게) */
  raiseGapMs: 30,
  /** 끝에 앞 창을 올리고 포커스를 주기 전 기다림 */
  focusDelayMs: 100,
  /** 항상 위에 둔 동안 앞 창을 살피는 간격 */
  pinCheckMs: 500,
  /** 사용자가 옮긴 창을 고정을 푼 뒤 다시 올리기 전 기다림(푼 창이 그 창 위로 올라오지 않게) */
  switchRaiseDelayMs: 60
} as const

/** 내리기 결과. hidden은 실제로 내려간 창 */
export interface HideCounts {
  minimized: number
  /** 내려가지 않았고 관리자 권한인지 모르는 창(UIPI로 본다) */
  elevated: number
  hung: number
  failed: number
  hidden: Set<string>
}

export interface HideController {
  /** 지금 앞 창의 맨 위 소유 창(감추기 직전 앞 창으로 기억한다. 대화상자는 그 앱 창, 검토 I2) */
  front(): string | null
  /**
   * 감추기 끝의 실제 앞 창 확인(focusLeftOnHidden, 검토 I2): 키 입력이 내린 창·최소화된 창·숨은 창으로 가면 바탕 화면에 포커스를 준다.
   * needed는 옮겨야 했는지, moved는 실제로 옮겼는지
   */
  settleFocus(hidden: ReadonlySet<string>): { needed: boolean; moved: boolean }
  /** 지금 누르면 할 일(감춘 기록과 지금 창 상태로, decidePress) */
  decide(): PressDecision
  /**
   * 내리고 확인한 뒤 감춘 기록을 새로 시작한다(carry를 이어서 기억). elevated는 관리자 권한이라 고르지 않은 창 수, saved는 남길 창을
   * 저장해 두었는지: 감출 때의 문제(HideNote)로 기록해 두었다가 되돌릴 때 알린다
   */
  hide(o: { targets: readonly HideTarget[]; front: string | null; carry: readonly HiddenWindow[]; elevated?: number; saved?: boolean }): Promise<HideCounts>
  /** 내렸던 창을 되돌리고 감춘 기록을 지운다. earlier는 감출 때의 문제 */
  unhide(d: Extract<PressDecision, { kind: 'restore' }>): Promise<{ restored: number; skipped: number; focused: boolean; earlier?: HideNote }>
  /** 지금 누르면 되돌릴 창 수(없으면 0). 팔레트·바 메뉴·설정 창 표시용 */
  restorable(): number
  /** 그 창들 가운데 지금 항상 위인 창(감추기 전에 읽어 Sure-Mate가 고정한 창과 가린다) */
  topmost(hwnds: Iterable<string>): Set<string>
  /** 감춘 동안 항상 위에 둔다(옵션). keep은 업무 창 전체(앞 창이 이 창들이면 풀지 않는다). 고정한 창 수 */
  pin(hwnds: readonly string[], keep: Iterable<string>): number
  /** 고정한 창만 푼다(없으면 아무 일도 하지 않는다) */
  release(trigger: PinTrigger): void
}

/** 포트를 부르고 던지면 fallback(창 하나의 실패가 감추기 전체를 멈추지 않게) */
function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export function createHideController(p: HidePorts): HideController {
  const T = HIDE_TIMING
  let session: HideSession | null = null
  let pins: { pinned: string[]; keep: Set<string>; until: number; dropped: number; stop: () => void } | null = null

  const state = (hwnd: string): ReturnType<HidePorts['state']> => attempt(() => p.state(hwnd), null)

  /** 조건이 될 때까지 기다린다(처음 settleMs, 이후 pollMs 간격으로 waitMs까지) */
  async function waitUntil(done: () => boolean): Promise<void> {
    await p.sleep(T.settleMs)
    for (let waited = 0; !done() && waited < T.waitMs; waited += T.pollMs) await p.sleep(T.pollMs)
  }

  const decide = (): PressDecision => decidePress({ session, now: p.now(), state })

  function end(trigger: PinTrigger, release: string[], dropped: number): void {
    if (!pins) return
    const total = pins.dropped + dropped
    attempt(() => pins?.stop(), undefined)
    pins = null
    for (const h of release) attempt(() => p.unpin(h), undefined)
    p.log('workspace.unpin', { released: release.length, dropped: total, trigger })
  }

  /** 고정한 창이 아직 있는지: 숨은 창도 풀어야 하므로 보이는지가 아니라 IsWindow로만 판단한다(검토 I1) */
  const exists = (hwnd: string): boolean => attempt(() => p.exists(hwnd), false)

  function release(trigger: PinTrigger): void {
    if (!pins) return
    const r = pinRelease({ pinned: pins.pinned, alive: exists })
    end(trigger, r.release, r.dropped)
    if (trigger !== 'switched') return
    // 사용자가 고른 창(Sure-Mate 설정·팔레트 창 포함): 푼 창이 보통 창 맨 위로 오므로 그 창을 다시 올린다
    const fg = attempt(() => p.foregroundRoot(), null)
    if (fg)
      void p
        .sleep(T.switchRaiseDelayMs)
        .then(() => p.raise(fg.hwnd))
        .catch(() => undefined)
  }

  function tick(): void {
    if (!pins) return
    const r = pinRelease({ pinned: pins.pinned, alive: exists })
    if (r.release.length === 0) {
      end('gone', [], r.dropped)
      return
    }
    pins.dropped += r.dropped
    pins.pinned = r.release
    const why = pinCheck({ until: pins.until, now: p.now(), keep: pins.keep, foreground: attempt(() => p.foregroundRoot(), null) })
    if (why) release(why)
  }

  return {
    front: () => attempt(() => p.foregroundRoot()?.hwnd ?? p.foreground(), null),

    settleFocus(hidden) {
      const needed = focusLeftOnHidden({ foreground: attempt(() => p.foregroundRoot(), null), hidden, state })
      return { needed, moved: needed && attempt(() => p.focusDesktop(), false) }
    },

    decide,

    async hide(o) {
      const posted: HideTarget[] = []
      let hung = 0
      for (const t of o.targets) {
        const s = state(t.hwnd)
        if (!s || s.minimized) continue
        if (s.hung) {
          hung++
          continue
        }
        attempt(() => p.minimize(t.hwnd), false)
        posted.push(t)
      }
      if (posted.length > 0) await waitUntil(() => posted.every((t) => state(t.hwnd)?.minimized !== false))
      const hidden: HiddenWindow[] = []
      let elevated = 0
      let failed = 0
      for (const t of posted) {
        const s = state(t.hwnd)
        if (!s) continue
        if (s.minimized) hidden.push({ hwnd: t.hwnd, maximized: t.maximized })
        else if (t.elevated === false) failed++
        else elevated++
      }
      const note: HideNote = { elevated: (o.elevated ?? 0) + elevated, skipped: hung + failed, saved: o.saved ?? true }
      session = startSession({ now: p.now(), front: o.front, hidden, carry: o.carry, note })
      return { minimized: hidden.length, elevated, hung, failed, hidden: new Set(hidden.map((w) => w.hwnd)) }
    },

    async unhide(d) {
      session = null
      const shown: HiddenWindow[] = []
      let skipped = 0
      for (const w of d.windows) {
        const s = state(w.hwnd)
        if (!s) continue
        if (s.hung) {
          skipped++
          continue
        }
        attempt(() => p.unminimize(w.hwnd, w.maximized), undefined)
        shown.push(w)
      }
      if (shown.length > 0) await waitUntil(() => shown.every((w) => state(w.hwnd)?.minimized !== true))
      let restored = 0
      const raised = new Set<string>()
      // 아래에서 위로 올려 감추기 전 z-순서를 되살린다(요청마다 잠깐 쉬어 비동기 요청이 차례대로 처리되게)
      for (const w of shown) {
        const s = state(w.hwnd)
        if (!s) continue
        if (s.minimized) {
          skipped++
          continue
        }
        attempt(() => p.raise(w.hwnd), undefined)
        raised.add(w.hwnd)
        restored++
        await p.sleep(T.raiseGapMs)
      }
      let focused = false
      if (d.focus !== null && state(d.focus) !== null) {
        const focus = d.focus
        await p.sleep(T.focusDelayMs)
        // 방금 올린 창은 다시 올리지 않는다(검토 C1: 반쯤 처리된 앞 요청 때문에 항상 위로 남을 수 있다). 포커스를 받으면 맨 위로 온다
        if (!raised.has(focus)) attempt(() => p.raise(focus), undefined)
        focused = attempt(() => p.setForeground(focus), false)
      }
      return { restored, skipped, focused, ...(d.note ? { earlier: d.note } : {}) }
    },

    restorable() {
      const d = decide()
      return d.kind === 'restore' ? d.windows.length : 0
    },

    topmost(hwnds) {
      return new Set([...hwnds].filter((h) => attempt(() => p.topmost(h), false)))
    },

    pin(hwnds, keep) {
      release('press')
      const until = (session?.at ?? p.now()) + HIDE_SESSION_MS
      for (const h of hwnds) attempt(() => p.pin(h), undefined)
      p.log('workspace.pin', { pinned: hwnds.length })
      if (hwnds.length === 0) return 0
      const stop = p.every(T.pinCheckMs, tick)
      pins = { pinned: [...hwnds], keep: new Set(keep), until, dropped: 0, stop }
      return hwnds.length
    },

    release
  }
}
