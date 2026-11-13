import { app, powerMonitor, screen, systemPreferences } from 'electron'
import { appEvents } from '../app-events'
import { getMonitors } from '../native/coords'
import { mouseButtonDown } from '../native/input'
import { getForegroundWindow, isOwnWindow, isWindowVisible, setForeground } from '../native/windows'
import { realTimers } from '../timers'
import { getPreviousHwnd, paletteHwnd } from '../windows/palette-window'
import { createPetWindow } from '../windows/pet-window'
import { settingsHwnd } from '../windows/settings-window'
import { controlReturnTarget } from './pet-focus'
import type { PetRuntimeEnv } from './pet-runtime'

/**
 * 펫 런타임의 실제 바깥 세계(설계 §14-2·§10). 전역 훅 없이 조회만 한다(커서·버튼·입력 없는 시간).
 * Win32는 native/의 함수로만 부르고, 쓸 수 없거나 던지면 펫이 그대로 동작하는 값(null·false)을 준다.
 * 앱이 준비된 뒤(powerMonitor·screen을 쓸 수 있을 때) 만든다.
 */
export function electronPetEnv(): PetRuntimeEnv {
  return {
    createWindow: () => createPetWindow(),
    monitors: () => getMonitors(),
    cursor: () => screen.getCursorScreenPoint(),
    mouseButtonDown: () => {
      try {
        return mouseButtonDown()
      } catch {
        return null
      }
    },
    // 읽지 못하면 0: 졸기 확인이 남은 시간을 다시 잡는다(던지면 확인 타이머가 다시 잡히지 않아 펫이 영영 졸지 않는다)
    idleSeconds: () => {
      try {
        return powerMonitor.getSystemIdleTime()
      } catch {
        return 0
      }
    },
    // Windows 설정의 "애니메이션 효과" 끔이 prefersReducedMotion이다(설계 §14-2 움직임 줄이기). 읽지 못하면 false
    systemReducedMotion: () => {
      try {
        return systemPreferences.getAnimationSettings()?.prefersReducedMotion === true
      } catch {
        return false
      }
    },
    // 조종을 끝낼 때 돌아갈 창: 설정 창이 아닌 Sure-Mate 창은 기억하지 않는다(팔레트면 팔레트가 돌아갈 창, M6 최종 검토 I1).
    // 설정 창(첫 실행 안내·따라 해 보기 포함)은 팔레트처럼 돌아갈 창으로 쓴다(2026-11-12)
    foreground: () => {
      try {
        const settings = settingsHwnd()
        return controlReturnTarget({
          foreground: getForegroundWindow(),
          palette: { hwnd: paletteHwnd(), returnTo: getPreviousHwnd() },
          isOwn: isOwnWindow,
          isReturnable: (hwnd) => hwnd === settings
        })
      } catch {
        return null
      }
    },
    // 숨은 창(숨긴 팔레트 등)에는 포커스를 주지 않는다: 보이지 않는 창이 키 입력을 받게 된다(I1)
    restoreFocus: (hwnd) => {
      try {
        return isWindowVisible(hwnd) && setForeground(hwnd)
      } catch {
        return false
      }
    },
    onDisplays: (cb) => {
      screen.on('display-added', cb)
      screen.on('display-removed', cb)
      screen.on('display-metrics-changed', cb)
      return () => {
        screen.removeListener('display-added', cb)
        screen.removeListener('display-removed', cb)
        screen.removeListener('display-metrics-changed', cb)
      }
    },
    onBeforeQuit: (cb) => {
      app.on('before-quit', cb)
      return () => {
        app.removeListener('before-quit', cb)
      }
    },
    appEvents,
    timers: realTimers,
    // 단조 시계: 시스템 시각을 바꾸거나 동기화해도 뒤로 가지 않는다(Date.now는 뒤로 갈 수 있다)
    now: () => performance.now(),
    random: () => Math.random()
  }
}
