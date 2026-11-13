import type { AppEvents } from '../../shared/app-events'
import { pickBarDisplay } from '../../shared/bar/bar-layout'
import { PET_CRASH_NOTICE, PET_NUDGE_LINES } from '../../shared/pet/pet-copy'
import { NUDGE, nextNudge, startNudge, type NudgeState } from '../../shared/pet/pet-nudge'
import { petWorld, type PetBar, type PetWorld } from '../../shared/pet/pet-world'
import type { Settings } from '../../shared/settings/settings'
import type { MonitorInfo } from '../../shared/types'
import { DISPLAY_SETTLE_MS, type BarController } from '../bar/bar-controller'
import { createTopmostKeeper } from '../bar/topmost-keeper'
import { createErrorOnce } from '../error-once'
import { errorText } from '../error-text'
import type { PetIpc } from '../ipc'
import type { Timers } from '../timers'
import type { PetWindow } from '../windows/pet-window'
import { createPetController, PET_LOOP, type PetController, type PetWindowPort } from './pet-controller'

/** 펫 런타임이 쓰는 바깥 세계(Electron·Win32·시계·앱 일). 실제 값은 pet-env.ts, 시험은 가짜를 넣는다 */
export interface PetRuntimeEnv {
  createWindow(): PetWindow
  monitors(): MonitorInfo[]
  cursor(): { x: number; y: number }
  /** 마우스 버튼이 하나라도 눌렸는지. Win32가 없으면 null */
  mouseButtonDown(): boolean | null
  idleSeconds(): number
  /** OS 애니메이션 효과 끔(prefers-reduced-motion). 읽지 못하면 false */
  systemReducedMotion(): boolean
  /**
   * 조종을 끝낼 때 돌아갈 창(HWND 10진 문자열): 앞 창이되 Sure-Mate 창은 빼고, 팔레트면 팔레트가 돌아갈 창(pet-focus.ts).
   * Win32가 없으면 null
   */
  foreground(): string | null
  /** 그 창을 앞으로. 숨은 창이거나 Win32가 없거나 실패하면 false */
  restoreFocus(hwnd: string): boolean
  /** 모니터 연결·해제·배율·작업 영역이 바뀌면 부른다. 해제 함수를 돌려준다 */
  onDisplays(cb: () => void): () => void
  /** 앱을 끝내기 시작하면(before-quit) 부른다. 해제 함수를 돌려준다 */
  onBeforeQuit(cb: () => void): () => void
  appEvents: Pick<AppEvents, 'on'>
  timers: Timers
  /** 단조 시계(ms). 시스템 시각을 바꿔도 뒤로 가지 않는다(Task 5 이월) */
  now(): number
  random(): number
}

export interface PetRuntimeOptions {
  /** 바 런타임(바 컨트롤러와 전체 화면 상태). 바를 시작하지 못했으면 null: 바 없는 세계이고 전체 화면 숨김이 없다 */
  bar: { bar: BarController; fullscreen(): boolean } | null
  getSettings(): Settings
  /** 더블클릭 */
  openPalette(): void
  /** 메뉴 "펫 설정" */
  openSettings(): Promise<void>
  /** 설정 pet.visible 저장(메뉴 "숨기기"). 저장 뒤 applySettings가 refresh()를 부른다 */
  setPetVisible(v: boolean): Promise<void>
  /** Windows 알림(렌더러가 다시 불러온 뒤에도 죽어 펫을 숨길 때 한 번) */
  notify(message: string): void
  log(event: string, data: Record<string, unknown>): void
}

export interface PetRuntime extends PetIpc {
  controller: PetController
  /** 설정이 바뀐 뒤(applySettings) */
  refresh(): void
  /** 바 창이 바뀐 뒤(바 런타임의 onBarChange). 34ms에 한 번 이하로 묶어 세계를 다시 읽는다 */
  worldChanged(): void
  /** 전체 화면 앱 시작·끝(바 런타임의 onFullscreen: 켜질 때는 바보다 먼저, 꺼질 때는 바 다음) */
  setFullscreen(on: boolean): void
  /** 맨 앞으로(바 런타임의 afterRaise: 바·펼침 창 바로 다음). 숨긴 펫은 올리지 않는다 */
  raise(): void
  /** 구독·타이머를 풀고 창을 닫는다(앱을 끝낼 때, 창이 닫혔을 때) */
  dispose(): void
}

/**
 * 잦은 요청을 묶어 run을 gapMs에 한 번 이하로 부른다(바 끌기는 약 60Hz, 펫은 30fps 이하).
 * 첫 요청도 동기로 부르지 않고 다음 차례(0ms 타이머)에 부른다: 바가 동기로 바꾸는 순서(자동 숨김은 창을 키운 뒤 화면을 펼친다)가
 * 끝난 뒤에 세계를 읽게. 시계가 뒤로 가도 gapMs보다 오래 기다리지 않는다
 */
export function createCoalescer(o: { timers: Timers; now(): number; gapMs: number; run(): void }): { request(): void; dispose(): void } {
  let timer: unknown = null
  let last: number | null = null
  let disposed = false
  const fire = (): void => {
    timer = null
    last = o.now()
    o.run()
  }
  return {
    request() {
      if (disposed || timer !== null) return
      const due = last === null ? 0 : last + o.gapMs - o.now()
      const wait = Number.isFinite(due) ? Math.min(o.gapMs, Math.max(0, due)) : 0
      timer = o.timers.setTimeout(fire, wait)
    },
    dispose() {
      disposed = true
      if (timer !== null) o.timers.clearTimeout(timer)
      timer = null
    }
  }
}

/**
 * 조종을 시작하며 포커스를 요청한 뒤 펫 창이 포커스를 받았는지 확인하기까지(ms, M6 최종 검토 M5).
 * Windows가 앞 창 잠금으로 포커스를 주지 않으면 blur도 Esc도 오지 않아 조종 모드(계획·졸기 없음)가 남는다
 */
export const CONTROL_FOCUS_CHECK_MS = 300

/** 마지막 요청 뒤 ms 동안 조용하면 run을 한 번 부른다(모니터 연결·배율 변화는 몰려 온다) */
export function createSettler(o: { timers: Timers; ms: number; run(): void }): { request(): void; dispose(): void } {
  let timer: unknown = null
  let disposed = false
  return {
    request() {
      if (disposed) return
      if (timer !== null) o.timers.clearTimeout(timer)
      timer = o.timers.setTimeout(() => {
        timer = null
        o.run()
      }, o.ms)
    },
    dispose() {
      disposed = true
      if (timer !== null) o.timers.clearTimeout(timer)
      timer = null
    }
  }
}

/**
 * 펫이 다니는 세계(설계 §14-2): 바 설정의 모니터(바와 같은 규칙)와, 보이고 펼친 바. 자동 숨김으로 접힌 바·숨은 바·
 * 바 런타임 없음은 바 없는 세계다(펫은 떨어지거나 바닥만 다닌다). 바를 읽다 오류가 나도 바 없는 세계로 본다. 모니터가 없으면 null
 */
export function barWorld(monitors: MonitorInfo[], settings: Settings, bar: BarController | null, size: number): PetWorld | null {
  const monitor = pickBarDisplay(monitors, settings.bar.monitor)
  if (!monitor) return null
  let found: PetBar | null = null
  try {
    if (bar && bar.visible() && !bar.state().collapsed) {
      const a = bar.anchor(null)
      if (a) found = { rect: a.bar, edge: a.edge }
    }
  } catch {
    found = null
  }
  return petWorld(monitor, found, size)
}

/**
 * 말랑 메이트를 앱에 연결한다(설계 §14-2·§5). 판단은 모두 컨트롤러(순수)에 있고 여기는 연결만 한다:
 * 창·세계(바 모니터와 바)·커서·시계를 컨트롤러에 주고, 바 변화(34ms에 한 번 이하)·모니터 변화(200ms 뒤 한 번)·전체 화면·
 * 앱 일·창 이벤트(조종 중 blur, Alt+F4 닫기, 조종 시작 뒤 포커스 확인, 렌더러가 죽음)를 컨트롤러에 넘긴다. 맨 앞은 바가 보이면 바 런타임이(afterRaise),
 * 바가 없거나 숨으면 펫이 2초마다 스스로 올린다. 쉬어 가기 말은 펫이 보이고 설정이 켜져 있는 동안 1분에 한 번 확인한다(pet-nudge).
 * 모든 처리기·타이머 콜백은 던지지 않는다(오류는 종류마다 한 번 기록).
 * 만드는 중 실패하면 만든 것을 정리하고 던진다(index.ts가 pet.startError로 기록하고 바·팔레트는 그대로 동작한다).
 */
export function createPetRuntime(o: PetRuntimeOptions, env: PetRuntimeEnv): PetRuntime {
  let disposed = false
  let quitting = false
  /** 펫 창이 보이는지(컨트롤러가 띄우고 숨긴 대로) */
  let shown = false
  /** 마지막으로 읽은 세계의 모니터 */
  let lastDisplay: string | null = null

  const undo: (() => void)[] = []
  /** 만든 순서의 반대로 정리한다. 하나가 실패해도 나머지는 정리한다 */
  const teardown = (): void => {
    if (disposed) return
    disposed = true
    while (undo.length > 0) {
      try {
        undo.pop()?.()
      } catch {
        // 창이 이미 닫혔다(앱을 끝내는 중)
      }
    }
  }

  /**
   * 오류는 종류(곳 + 오류 글)마다 처음 한 번만 기록한다(반복되는 일에서 같은 오류가 로그를 채우지 않게).
   * 같은 곳의 다른 오류는 따로 한 번 남고, 종류 수에는 한도가 있다(M6 최종 검토 Task 9 #4)
   */
  const firstTime = createErrorOnce()
  const report = (where: string, e: unknown): void => {
    const error = errorText(e)
    if (firstTime(where, error)) o.log('pet.error', { where, error })
  }
  const guard =
    <A extends unknown[]>(where: string, fn: (...a: A) => void) =>
    (...a: A): void => {
      try {
        fn(...a)
      } catch (e) {
        report(where, e)
      }
    }
  /** 컨트롤러·묶기·맨 앞 유지의 타이머. 콜백이 던져도 main의 처리하지 않은 예외(오류 창)가 되지 않게 */
  const timers: Timers = {
    setTimeout: (fn, ms) => env.timers.setTimeout(guard('timer', fn), ms),
    clearTimeout: (h) => env.timers.clearTimeout(h),
    setInterval: (fn, ms) => env.timers.setInterval(guard('timer', fn), ms),
    clearInterval: (h) => env.timers.clearInterval(h)
  }

  const win = env.createWindow()
  undo.push(() => win.destroy())

  try {
    const barVisible = (): boolean => {
      try {
        return o.bar?.bar.visible() ?? false
      } catch {
        return false
      }
    }

    // 바가 없거나 숨은 동안 펫 혼자 맨 앞을 지킨다(바가 보이면 바 런타임이 바 → 펼침 창 → 펫 순서로 올린다)
    const keeper = createTopmostKeeper({ raise: () => win.raise(), timers })
    undo.push(() => keeper.stop())
    const syncKeeper = (): void => keeper.setVisible(shown && !barVisible())

    // 조종을 시작하며 포커스를 요청하면 300ms 뒤 한 번 확인한다(M5). 받지 못했으면 blur처럼 끝낸다(포커스는 돌리지 않는다).
    // 조종이 끝나거나(setFocusable(false)) 펫이 숨으면 확인을 지운다(숨긴 펫에는 타이머가 없다)
    let focusCheck: unknown = null
    const clearFocusCheck = (): void => {
      if (focusCheck !== null) timers.clearTimeout(focusCheck)
      focusCheck = null
    }
    undo.push(clearFocusCheck)
    const checkFocus = (): void => {
      focusCheck = null
      if (disposed || !controller.controlling() || win.isFocused()) return
      o.log('pet.focusRefused', {})
      controller.endControl('blur')
    }

    // 쉬어 가기 말(2026-11-13): 펫이 보이고 설정이 켜져 있는 동안만 1분에 한 번 확인한다(컨트롤러에는 타이머를 더하지 않는다).
    // 펫이 숨으면(설정·전체 화면·디스플레이 없음) 멈추고 끝낼 때 지운다. 켤 때(처음 보일 때 포함) 처음부터 센다.
    // 판단은 pet-nudge(순수)가 하고, 기록에는 줄 번호와 건너뛴 까닭만 남긴다(문구는 남기지 않는다)
    let nudgeState: NudgeState | null = null
    let nudgeOn = false
    let nudgeTimer: unknown = null
    const stopNudge = (): void => {
      if (nudgeTimer !== null) timers.clearInterval(nudgeTimer)
      nudgeTimer = null
    }
    undo.push(stopNudge)
    const barFullscreen = (): boolean => {
      try {
        return o.bar?.fullscreen() ?? false
      } catch {
        return false
      }
    }
    const checkNudge = guard('nudge', () => {
      if (disposed || !shown || !nudgeState) return
      const pet = o.getSettings().pet
      const idle = env.idleSeconds()
      const d = nextNudge(nudgeState, env.now(), Number.isFinite(idle) && idle > 0 ? idle * 1000 : 0, {
        intervalMin: pet.nudgeEveryMin,
        shown: controller.status().shown,
        fullscreen: barFullscreen(),
        bubbles: pet.bubbles,
        busy: controller.busy(),
        random: () => env.random()
      })
      nudgeState = d.state
      if (d.action === 'speak') {
        const said = controller.nudge(PET_NUDGE_LINES[d.line])
        o.log('pet.nudge', said ? { line: d.line } : { line: d.line, skip: 'not-shown' })
      } else if (d.action === 'skip') o.log('pet.nudge', { skip: d.reason, retry: d.retry })
    })
    const syncNudge = (): void => {
      const on = !disposed && o.getSettings().pet.nudges
      if (on && !nudgeOn) nudgeState = startNudge({ now: env.now(), random: () => env.random(), lastLine: nudgeState?.lastLine ?? null })
      nudgeOn = on
      if (on && shown) {
        if (nudgeTimer === null) nudgeTimer = timers.setInterval(checkNudge, NUDGE.checkMs)
      } else stopNudge()
    }

    // 컨트롤러가 띄우고 숨기는 곳에서 맨 앞 유지·쉬어 가기 말 확인을 맞춘다. 띄울 때는 먼저 나온 바 앞으로 바로 올린다
    // (바가 없으면 펫 혼자 올리기가 시작하며 올린다)
    const port: PetWindowPort = {
      ...win.port,
      showInactive: () => {
        win.port.showInactive()
        shown = true
        if (barVisible()) win.raise()
        syncKeeper()
        syncNudge()
      },
      hide: () => {
        clearFocusCheck()
        win.port.hide()
        shown = false
        syncKeeper()
        syncNudge()
      },
      setFocusable: (focusable) => {
        if (!focusable) clearFocusCheck()
        win.port.setFocusable(focusable)
      },
      focus: () => {
        win.port.focus()
        clearFocusCheck()
        focusCheck = timers.setTimeout(checkFocus, CONTROL_FOCUS_CHECK_MS)
      }
    }

    const world = (size: number): PetWorld | null => {
      const w = barWorld(env.monitors(), o.getSettings(), o.bar?.bar ?? null, size)
      // 바가 다른 모니터로 갔으면(배율이 다를 수 있다) 다음 놓기에서 창 크기를 다시 확인한다
      if (w && w.displayId !== lastDisplay) {
        if (lastDisplay !== null) win.recheckSize()
        lastDisplay = w.displayId
      }
      return w
    }

    const controller = createPetController({
      window: port,
      world,
      settings: () => o.getSettings().pet,
      masking: () => o.getSettings().masking.mode,
      systemReducedMotion: () => env.systemReducedMotion(),
      cursor: () => env.cursor(),
      mouseButtonDown: () => env.mouseButtonDown(),
      idleSeconds: () => env.idleSeconds(),
      openPalette: () => o.openPalette(),
      foreground: () => env.foreground(),
      restoreFocus: (hwnd) => env.restoreFocus(hwnd),
      setVisible: (v) => o.setPetVisible(v),
      openSettings: () => {
        try {
          o.openSettings().catch((e: unknown) => report('openSettings', e))
        } catch (e) {
          report('openSettings', e)
        }
      },
      timers,
      now: () => env.now(),
      random: () => env.random(),
      log: o.log
    })
    undo.push(() => controller.dispose())

    // 바 변화(끌기 약 60Hz)는 34ms에 한 번 이하로, 모니터 변화는 200ms 조용해진 뒤 한 번 세계를 다시 읽는다
    const sync = createCoalescer({
      timers,
      now: () => env.now(),
      gapMs: PET_LOOP.frameMs,
      run: guard('world', () => {
        controller.worldChanged()
        syncKeeper()
      })
    })
    undo.push(() => sync.dispose())
    const settle = createSettler({ timers, ms: DISPLAY_SETTLE_MS, run: () => sync.request() })
    undo.push(() => settle.dispose())

    // 조종 중 다른 창을 눌렀다(Alt+Tab 포함): 조종을 끝내고 포커스는 그 창에 둔다
    win.onBlur(
      guard('blur', () => {
        if (!disposed && controller.controlling()) controller.endControl('blur')
      })
    )
    // 조종 중 창이 키보드를 받으므로 Alt+F4로 닫힐 수 있다: 앱을 끝내는 중이 아니면 막고, 조종 중이면 Esc처럼 끝낸다
    win.onClose(
      guard('close', (e: { preventDefault(): void }) => {
        if (quitting || disposed) return
        e.preventDefault()
        const controlling = controller.controlling()
        if (controlling) controller.endControl('esc')
        o.log('pet.close', { prevented: true, controlling })
      })
    )
    // 창이 없어지면 컨트롤러·타이머도 멈춘다(앱을 끝내는 중이 아니면 기록)
    win.onClosed(() => {
      if (!disposed && !quitting) o.log('pet.window.closed', {})
      teardown()
    })
    // 렌더러가 죽으면(Task 9 #6): 클릭 통과로 되돌리고 조종을 끝낸 뒤(포커스 복귀 없음) 한 번만 다시 불러온다.
    // 다시 불러온 뒤 또 죽으면 다시 부르지 않고 펫을 숨긴 채 둔다(창을 닫아 타이머·구독도 멈춘다). 앱을 다시 켜면 다시 나온다
    let crashes = 0
    win.onRenderGone(
      guard('renderGone', (reason: string) => {
        if (disposed || crashes >= 2) return
        crashes += 1
        controller.rendererGone()
        o.log('pet.renderGone', { reason, count: crashes })
        if (crashes === 1) {
          win.reload()
          return
        }
        o.notify(PET_CRASH_NOTICE)
        // 창 이벤트 처리 중에 창을 닫지 않고 다음 차례에 정리한다
        timers.setTimeout(teardown, 0)
      })
    )

    undo.push(env.appEvents.on(guard('react', (e) => controller.react(e))))
    undo.push(
      env.onDisplays(
        guard('displays', () => {
          // 배율이 바뀌었을 수 있다: 다음 놓기에서 창 크기를 확인한다
          win.recheckSize()
          settle.request()
        })
      )
    )
    // 앱을 끝낼 때는 닫기를 막지 않는다(막으면 끝내기가 취소된다)
    undo.push(
      env.onBeforeQuit(() => {
        quitting = true
      })
    )

    // 전체 화면 앱이 이미 앞에 있으면 띄우지 않고 시작한다
    let fullscreen = false
    try {
      fullscreen = o.bar?.fullscreen() ?? false
    } catch {
      fullscreen = false
    }
    controller.setFullscreen(fullscreen)
    controller.start()

    return {
      controller,
      petContentsId: win.contentsId,
      petView: () => controller.view(),
      petPress: (down) => controller.press(down),
      petContextMenu: () => controller.contextMenu(),
      petMenu: (a) => controller.menuAction(a),
      petKey: (k, down) => controller.key(k, down),
      petBubbleClick: () => controller.bubbleClick(),
      petBubbleRect: (r) => controller.bubbleRect(r),
      refresh: guard('refresh', () => {
        if (disposed) return
        controller.refresh()
        syncKeeper()
        syncNudge()
      }),
      // 숨긴 펫은 바 변화를 무시한다(숨긴 펫에는 타이머가 없다, Task 9 #3). 다시 표시할 때 새 세계를 읽고,
      // 디스플레이가 없어 숨은 펫은 모니터 변화(settle → sync)로 다시 나타난다
      worldChanged: () => {
        if (!disposed && shown) sync.request()
      },
      setFullscreen: guard('fullscreen', (on: boolean) => {
        if (disposed) return
        controller.setFullscreen(on)
        syncKeeper()
      }),
      raise: guard('raise', () => {
        if (!disposed && shown) win.raise()
      }),
      dispose: teardown
    }
  } catch (e) {
    teardown()
    throw e
  }
}
