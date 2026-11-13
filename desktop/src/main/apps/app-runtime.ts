import { existsSync } from 'node:fs'
import { powerMonitor, shell } from 'electron'
import { errorText } from '../error-text'
import { nativeStatus } from '../native/win32'
import { listWindows, raiseWindow, setForeground, showWindowNormal } from '../native/windows'
import { type AppId, createAppCommands, KNOWN_APPS, type KnownApp, locateApp } from './app-commands'

/**
 * 사내 업무 프로그램 열기의 연결부: 설치 위치는 파일이 있는지로, 창은 Win32 창 목록(native/windows.ts)에서 실행 파일 이름으로 찾는다.
 * 창 목록에는 창 제목도 들어 있지만 쓰지 않는다(메신저 창 제목에는 대화방·동료 이름이 있다). Win32를 쓸 수 없으면 실행 파일만 연다
 */
export function createAppRuntime(o: {
  waitKeysReleased(): Promise<boolean>
  hidePalette(restoreFocus: boolean): void
  notify(message: string): void
  log(event: string, data: Record<string, unknown>): void
}): { run(id: string): Promise<boolean>; installed(): AppId[] } {
  const locate = (app: KnownApp): string | null => {
    try {
      return locateApp(app, { env: process.env, exists: existsSync })
    } catch {
      return null
    }
  }
  const commands = createAppCommands({
    locate,
    nativeOk: () => nativeStatus().ok,
    windows: (exe) => {
      try {
        const name = exe.toLowerCase()
        return listWindows()
          .filter((w) => w.exe.toLowerCase() === name)
          .map((w) => ({ hwnd: w.hwnd, minimized: w.minimized }))
      } catch {
        return []
      }
    },
    restore: (hwnd) => showWindowNormal(hwnd, true),
    focus: setForeground,
    raise: raiseWindow,
    launch: async (path) => {
      try {
        // 오류 글은 로그에 남으므로 사용자 폴더 경로를 가린다(사용자 폴더에 설치한 메신저)
        const error = await shell.openPath(path)
        return error ? errorText(error) : ''
      } catch (e) {
        return errorText(e) || 'unknown'
      }
    },
    // 읽지 못하면 0(방금 입력이 있었던 것으로 보고 늦게 뜬 창의 포커스를 빼앗지 않는다)
    idleSeconds: () => {
      try {
        return powerMonitor.getSystemIdleTime()
      } catch {
        return 0
      }
    },
    waitKeysReleased: o.waitKeysReleased,
    hidePalette: o.hidePalette,
    notify: o.notify,
    log: o.log,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now
  })
  return {
    run: (id) => commands.run(id),
    // 팔레트를 열 때마다 본다(파일 몇 개가 있는지만 확인한다). 앱을 지우거나 새로 깔면 다음에 열 때 바뀐다
    installed: () => KNOWN_APPS.filter((a) => locate(a) !== null).map((a) => a.id)
  }
}
