import { randomUUID } from 'node:crypto'
import { BrowserWindow, dialog } from 'electron'
import { WORKSPACE_NOTES } from '../../shared/workspace/messages'
import { log } from '../log'
import { getMonitors, toDip, toPhysical } from '../native/coords'
import { nativeStatus } from '../native/win32'
import {
  getForegroundWindow,
  listWindows,
  moveWindow,
  raiseWindow,
  readWindowState,
  selfElevated,
  setForeground,
  showWindowMaximized,
  showWindowNormal
} from '../native/windows'
import { notify } from '../notify'
import { createRestoreRunner } from './restore-runner'
import { createWorkspaceService, type WorkspaceService } from './workspace-service'
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
 * Sure-Mate 자신의 숨은 창인지. 키를 누른 채 팔레트에서 불러오면 팔레트를 둔 채 실행하는데, 그사이 팔레트가 포커스를 잃어
 * 숨으면 실행기가 끝에 그 창을 앞으로 가져와 보이지 않는 창이 키 입력을 받게 된다. 그런 창으로는 포커스를 돌려주지 않는다.
 */
function ownHiddenWindow(hwnd: string): boolean {
  try {
    return BrowserWindow.getAllWindows().some(
      (w) => !w.isDestroyed() && !w.isVisible() && w.getNativeWindowHandle().readBigUInt64LE(0).toString() === hwnd
    )
  } catch {
    return false
  }
}

/**
 * 워크스페이스 연결부(설계 §11): workspaces.json 캐시, Win32 창 기능(native/windows.ts), 화면 좌표 변환(native/coords.ts),
 * 대화상자·알림을 서비스에 넘긴다. Win32를 쓰는 함수는 모두 nativeStatus()를 확인한 뒤에만 부른다(서비스도 nativeOk로 먼저 막는다).
 */
export function createWorkspaceRuntime(o: { userData: string; reportErrors(errors: string[]): void }): WorkspaceService {
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
    setForeground: (hwnd) => !ownHiddenWindow(hwnd) && setForeground(hwnd),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now
  })
  return createWorkspaceService({
    store: createWorkspaceCache(o.userData, o.reportErrors),
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
    log
  })
}
