import type { PaletteItem } from '../../shared/types'

/**
 * 팔레트로 여는 사내 업무 프로그램(2026-11-13): 사내 메신저와 Ttree(근무 시작·컴퓨터 종료·휴가 신청·이석 사유).
 * 두 앱 모두 다른 프로그램이 특정 화면을 바로 여는 방법(URL 프로토콜·명령줄)이 없어서 창을 앞으로 가져오기만 한다.
 * 이 PC에 설치된 앱만 팔레트에 보인다. 창 제목(대화방·동료 이름)은 읽지 않고 실행 파일 이름으로만 창을 찾는다.
 */
export type AppId = 'messenger' | 'ttree'

export interface KnownApp {
  id: AppId
  /** 팔레트 명령 id */
  command: string
  /** 알림에 쓰는 이름(목적격 조사까지) */
  object: string
  /** 실행 파일 이름. 창을 찾을 때 대소문자를 가리지 않고 비교한다 */
  exe: string
  /** 설치 위치 후보. %이름%은 환경 변수로 바꾸고, 앞의 것부터 본다 */
  paths: readonly string[]
  title: string
  subtitle: string
  keywords: readonly string[]
}

export const KNOWN_APPS: readonly KnownApp[] = [
  {
    id: 'messenger',
    command: 'cmd.open-messenger',
    object: '사내 메신저를',
    exe: 'SURESOFTMessenger.exe',
    paths: [
      '%ProgramFiles%\\SURESOFTMessenger\\SURESOFTMessenger.exe',
      '%ProgramFiles(x86)%\\SURESOFTMessenger\\SURESOFTMessenger.exe',
      '%LOCALAPPDATA%\\Programs\\SURESOFTMessenger\\SURESOFTMessenger.exe'
    ],
    title: '사내 메신저 열기',
    subtitle: '메신저 창을 앞으로 가져와요 · 꺼져 있으면 켜요',
    keywords: ['메신저', '사내 메신저', '쪽지', '채팅', 'messenger', 'SURESOFTMessenger']
  },
  {
    id: 'ttree',
    command: 'cmd.open-ttree',
    object: 'Ttree를',
    exe: 'ttree.exe',
    paths: [
      '%SystemDrive%\\ttree\\ttree.exe',
      'C:\\ttree\\ttree.exe',
      '%ProgramFiles%\\ttree\\ttree.exe',
      '%LOCALAPPDATA%\\Programs\\ttree\\ttree.exe'
    ],
    title: 'Ttree 열기 (근무·휴가)',
    subtitle: '근무 시간·휴가 신청·이석 사유 창을 앞으로 가져와요 · 꺼져 있으면 켜요',
    keywords: [
      'Ttree',
      '티트리',
      '근무',
      '근무 시간',
      '근무시간',
      '근태',
      '출근',
      '퇴근',
      '근무 시작',
      '컴퓨터 종료',
      '휴가',
      '휴가 신청',
      '연차',
      '반차',
      '이석'
    ]
  }
]

/** 후보 경로의 %이름%을 환경 변수로 바꾼다. 값이 없는 변수가 있으면 null(그 후보는 보지 않는다) */
export function expandEnv(
  path: string,
  env: Readonly<Record<string, string | undefined>>
): string | null {
  let missing = false
  const out = path.replace(/%([^%\\]+)%/g, (_, name: string) => {
    const value = env[name]
    if (!value) missing = true
    return value ?? ''
  })
  return missing ? null : out
}

/** 설치된 실행 파일 경로(후보 중 처음 있는 것). 없으면 null */
export function locateApp(
  app: KnownApp,
  o: { env: Readonly<Record<string, string | undefined>>; exists(path: string): boolean }
): string | null {
  for (const candidate of app.paths) {
    const path = expandEnv(candidate, o.env)
    if (path && o.exists(path)) return path
  }
  return null
}

/** 설치된 앱의 팔레트 명령(KNOWN_APPS 순서). 명령 구역의 설정 열기 명령 다음에 둔다 */
export function appCommandItems(installed: readonly AppId[]): PaletteItem[] {
  return KNOWN_APPS.filter((a) => installed.includes(a.id)).map((a): PaletteItem => ({
    id: a.command,
    group: 'command',
    title: a.title,
    subtitle: a.subtitle,
    keywords: [...a.keywords]
  }))
}

/**
 * 실행 파일을 연 뒤 창이 보이기를 기다리는 시간과 확인 간격(Electron 앱이 처음 켜지는 데 몇 초 걸린다).
 * graceMs 안에 뜬 창은 늘 앞으로 가져온다(트레이에 숨어 있던 앱은 1초 안팎에 다시 보인다). 그 뒤에 뜬 창은 연 뒤에 입력이 없었을 때만
 */
export const APP_LAUNCH = { waitMs: 10_000, pollMs: 250, graceMs: 2_000 } as const

export interface AppWindow {
  hwnd: string
  minimized: boolean
}

export interface AppCommandDeps {
  /** 설치된 실행 파일 경로(locateApp). 없으면 null */
  locate(app: KnownApp): string | null
  /** Win32 창 기능을 쓸 수 있는지. 못 쓰면 창을 찾지 않고 실행 파일만 연다 */
  nativeOk(): boolean
  /** 그 실행 파일의 보이는 최상위 창(앞에 있는 것부터). 트레이로 숨은 창은 없다 */
  windows(exe: string): AppWindow[]
  /** 최소화를 풀고 활성화한다 */
  restore(hwnd: string): void
  /** 앞으로 가져와 포커스를 준다. 못 하면 false */
  focus(hwnd: string): boolean
  /** 포커스는 그대로 두고 다른 창 위로만 올린다(포커스를 주지 못했을 때) */
  raise(hwnd: string): void
  /** 실행 파일을 연다. 성공이면 빈 글, 실패면 오류 글(electron shell.openPath) */
  launch(path: string): Promise<string>
  /** 마지막 입력 뒤 지난 초(powerMonitor.getSystemIdleTime) */
  idleSeconds(): number
  /** 명령을 고른 Enter·보조키를 뗄 때까지 기다린다. 시간 안에 안 떼면 false */
  waitKeysReleased(): Promise<boolean>
  hidePalette(restoreFocus: boolean): void
  notify(message: string): void
  log(event: string, data: Record<string, unknown>): void
  sleep(ms: number): Promise<void>
  now(): number
}

/** 로그 apps.open의 result */
export type AppOpenResult =
  | 'focused'
  | 'raised'
  | 'launched'
  | 'launched-unfocused'
  | 'no-window'
  | 'not-found'
  | 'launch-failed'
  | 'keys-held'

/**
 * 앱 열기: 보이는 창이 있으면 그 창(가장 앞의 것)을 앞으로 가져오고, 없으면(꺼짐·트레이로 숨음) 실행 파일을 연다.
 * 두 앱 모두 한 번만 실행되는 앱이라, 켜져 있으면 실행 파일을 다시 열 때 그 앱이 자기 주 창을 다시 보인다(second-instance).
 * 연 뒤에는 창이 보일 때까지 기다렸다가 앞으로 가져온다. 그 사이 사용자가 다른 일을 시작했으면(입력이 있었으면) 포커스를 빼앗지 않는다.
 * 로그에는 앱 id·결과·걸린 시간만 남긴다(창 제목·경로 없음)
 */
export function createAppCommands(d: AppCommandDeps): { run(id: string): Promise<boolean> } {
  /** 창을 앞으로. 포커스를 주지 못하면 위로만 올린다 */
  const bringUp = (w: AppWindow): boolean => {
    if (w.minimized) d.restore(w.hwnd)
    const focused = d.focus(w.hwnd)
    if (!focused) d.raise(w.hwnd)
    return focused
  }

  async function open(app: KnownApp): Promise<AppOpenResult> {
    // 누른 채로 다른 앱에 포커스를 주면 자동 반복 Enter가 그 앱(메신저 입력칸)으로 간다. 떼지 않았으면 팔레트를 그대로 두고 다시 고르게 한다
    if (!(await d.waitKeysReleased())) {
      d.notify('Enter에서 손을 뗀 뒤 다시 골라 주세요.')
      return 'keys-held'
    }
    // 다른 앱으로 넘어가므로 원래 창으로 돌아가지 않는다
    d.hidePalette(false)
    const native = d.nativeOk()
    const shown = native ? d.windows(app.exe)[0] : undefined
    if (shown) return bringUp(shown) ? 'focused' : 'raised'

    const path = d.locate(app)
    if (!path) {
      d.notify(`${app.object} 이 PC에서 찾지 못했어요. 시작 메뉴에서 직접 열어 주세요.`)
      return 'not-found'
    }
    const error = await d.launch(path)
    if (error) {
      d.notify(`${app.object} 켜지 못했어요. 시작 메뉴에서 직접 열어 주세요.`)
      d.log('apps.launchError', { app: app.id, error })
      return 'launch-failed'
    }
    if (!native) return 'launched'

    const launchedAt = d.now()
    while (d.now() - launchedAt < APP_LAUNCH.waitMs) {
      await d.sleep(APP_LAUNCH.pollMs)
      const w = d.windows(app.exe)[0]
      if (!w) continue
      // 늦게 뜬 창: 연 뒤에 입력이 있었으면(다른 창에서 일을 시작했으면) 그 창에서 포커스를 빼앗지 않는다(그 앱이 스스로 창을 보인다).
      // 입력 없는 시간은 초 단위라 1초를 봐준다
      const elapsed = d.now() - launchedAt
      if (elapsed > APP_LAUNCH.graceMs && d.idleSeconds() * 1000 + 1000 <= elapsed)
        return 'launched-unfocused'
      bringUp(w)
      return 'launched'
    }
    d.notify(
      `${app.object} 켰는데 창이 보이지 않아요. 작업 표시줄 오른쪽 알림 영역(시계 옆)의 아이콘을 눌러 주세요.`
    )
    return 'no-window'
  }

  return {
    async run(id) {
      const app = KNOWN_APPS.find((a) => a.command === id)
      if (!app) return false
      const started = d.now()
      const result = await open(app)
      d.log('apps.open', { app: app.id, result, ms: d.now() - started })
      return true
    }
  }
}
