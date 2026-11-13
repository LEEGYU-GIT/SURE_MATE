import { randomUUID } from 'node:crypto'
import { BrowserWindow, dialog } from 'electron'
import { WORKSPACE_NOTES } from '../../shared/workspace/messages'
import { log } from '../log'
import { getMonitors, toDip, toPhysical } from '../native/coords'
import { nativeStatus } from '../native/win32'
import {
  focusDesktop,
  foregroundRoot,
  getForegroundWindow,
  isTopmost,
  isWindowVisible,
  listWindows,
  minimizeWindow,
  moveWindow,
  pinWindow,
  raiseWindow,
  readWindowState,
  selfElevated,
  setForeground,
  showWindowMaximized,
  showWindowNormal
} from '../native/windows'
import { notify } from '../notify'
import { createHideController } from './hide-runner'
import { createRestoreRunner, type OwnWindowState, unfocusableOwnWindow } from './restore-runner'
import { createWorkspaceService, type WorkspaceService, type WorkspaceSource } from './workspace-service'
import { createWorkspaceCache } from './workspace-store'

/** 다른 모니터 구성에서 저장한 배치를 주 모니터로 모을지 묻는다(부모 창 없이, 용어 팩 가져오기 확인과 같은 방식) */
async function confirmGather(o: { savedMonitors: number; currentMonitors: number }): Promise<boolean> {
  const answer = await dialog.showMessageBox({
    type: 'question',
    title: 'Sure-Mate',
    message: WORKSPACE_NOTES.gatherQuestion,
    detail: WORKSPACE_NOTES.gatherDetail(o.savedMonitors, o.currentMonitors),
    buttons: [WORKSPACE_NOTES.gatherYes, WORKSPACE_NOTES.cancel],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  })
  return answer.response === 0
}

/**
 * Sure-Mate 자신의 창들(끝의 포커스 판단용: unfocusableOwnWindow, 실행기 own 포트). 읽지 못하면 빈 목록(다른 앱 창으로 본다)
 */
function ownWindows(): OwnWindowState[] {
  try {
    return BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed())
      .map((w) => ({ hwnd: w.getNativeWindowHandle().readBigUInt64LE(0).toString(), visible: w.isVisible(), focusable: w.isFocusable() }))
  } catch {
    return []
  }
}

/**
 * 워크스페이스 연결부(설계 §11): workspaces.json 캐시, Win32 창 기능(native/windows.ts), 화면 좌표 변환(native/coords.ts),
 * 대화상자·알림을 서비스에 넘긴다. Win32를 쓰는 함수는 모두 nativeStatus()를 확인한 뒤에만 부른다(서비스도 nativeOk로 먼저 막는다).
 */
export function createWorkspaceRuntime(o: {
  userData: string
  reportErrors(errors: string[]): void
  /** 그 워크스페이스 단축키로 지금 등록된 조합(설정 창의 '쓰는 중'·'등록 못 함'). 단축키 관리자가 생기기 전에는 undefined */
  hotkeyBound?(workspaceId: string): string | undefined
  /** 불러오기가 성공해 끝날 때마다 부른다(서비스의 restored로 그대로 넘긴다) */
  restored?(id: string, source: WorkspaceSource): void
}): WorkspaceService {
  const native = (): boolean => nativeStatus().ok
  const runner = createRestoreRunner({
    // Win32를 못 쓰면 null(사라진 창으로 처리)이라 실행기는 move까지 가지 않는다
    state: readWindowState,
    normalize: (hwnd, x) => showWindowNormal(hwnd, x.activate),
    move: async (hwnd, physical, dpi) => {
      // moveWindow는 win32()를 바로 부르므로 여기서도 막는다(던지면 실행기가 그 창을 failed로 기록)
      if (!native()) throw new Error('native-unavailable')
      // 응답 없는 앱에 동기 호출하면 main(팔레트·바)이 멈추므로 비동기 이동
      await moveWindow(hwnd, physical, dpi, { async: true })
    },
    maximize: showWindowMaximized,
    raise: raiseWindow,
    toPhysical,
    foreground: getForegroundWindow,
    // 끝에 시작 때 앞 창을 올리고 포커스를 줄 수 있는지: 아직 있고 보이며, 숨은 창·포커스를 받지 않는 Sure-Mate 창(바·펼침 창,
    // 조종이 끝난 펫)이 아니다(Win32를 못 쓰면 false)
    focusable: (hwnd) => isWindowVisible(hwnd) && !unfocusableOwnWindow(hwnd, ownWindows()),
    // 시작 때 앞 창이 Sure-Mate 자신의 창(설정·첫 실행 안내 창 등)인지. 그 창이 포커스를 받을 수 있을 때만(focusable) 그 창에 포커스를 남긴다
    own: (hwnd) => ownWindows().some((w) => w.hwnd === hwnd),
    setForeground,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now
  })
  // 화면 감추기(기본 워크스페이스): 다른 앱 창을 활성화 없이 내리고 되돌리며, 옵션이 켜져 있으면 업무 창을 항상 위에 둔다.
  // 창 기능은 모두 nativeStatus()를 확인한다(서비스가 먼저 nativeOk로 막는다)
  const hide = createHideController({
    foreground: getForegroundWindow,
    // 숨은 창(숨은 팔레트, 트레이로 숨은 앱)은 사라진 창으로 본다: 되돌리거나 포커스를 주지 않는다(최소화한 창은 보이는 창이다)
    state: (hwnd) => {
      const s = isWindowVisible(hwnd) ? readWindowState(hwnd) : null
      return s ? { minimized: s.minimized, maximized: s.maximized, hung: s.hung } : null
    },
    minimize: minimizeWindow,
    unminimize: (hwnd, maximized) => (maximized ? showWindowMaximized(hwnd) : showWindowNormal(hwnd, false)),
    raise: raiseWindow,
    setForeground,
    focusDesktop,
    topmost: isTopmost,
    pin: (hwnd) => pinWindow(hwnd, true),
    unpin: (hwnd) => pinWindow(hwnd, false),
    foregroundRoot,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
    every: (ms, fn) => {
      const t = setInterval(fn, ms)
      return () => clearInterval(t)
    },
    log
  })
  // 이번 실행에서 workspaces.json을 읽다가 문제가 있었는지(있으면 기본 워크스페이스를 자동으로 저장하지 않는다)
  let loadErrors = false
  return createWorkspaceService({
    store: createWorkspaceCache(o.userData, (errors) => {
      loadErrors = true
      o.reportErrors(errors)
    }),
    loadClean: () => !loadErrors,
    hide,
    selfPid: process.pid,
    nativeOk: native,
    snapshot: () => ({ windows: native() ? listWindows() : [], monitors: getMonitors() }),
    monitors: getMonitors,
    toDip,
    selfElevated: () => (native() ? selfElevated() : null),
    runner,
    confirmGather,
    notify,
    newId: randomUUID,
    now: () => new Date(),
    log,
    hotkeyBound: o.hotkeyBound,
    restored: o.restored
  })
}
