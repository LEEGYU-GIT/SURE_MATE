import { describe, expect, it, vi } from 'vitest'
import {
  APP_LAUNCH,
  appCommandItems,
  createAppCommands,
  expandEnv,
  KNOWN_APPS,
  locateApp,
  type AppCommandDeps,
  type AppWindow
} from './app-commands'

const messenger = KNOWN_APPS.find((a) => a.id === 'messenger')!
const ttree = KNOWN_APPS.find((a) => a.id === 'ttree')!
const ENV = {
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local',
  SystemDrive: 'C:'
}

describe('팔레트 항목', () => {
  it('설치된 앱만, 정해진 순서(메신저, Ttree)로 명령 구역에 둔다', () => {
    expect(appCommandItems([]).map((i) => i.id)).toEqual([])
    expect(appCommandItems(['ttree']).map((i) => i.id)).toEqual(['cmd.open-ttree'])
    const both = appCommandItems(['ttree', 'messenger'])
    expect(both.map((i) => i.id)).toEqual(['cmd.open-messenger', 'cmd.open-ttree'])
    expect(both.every((i) => i.group === 'command')).toBe(true)
  })

  it('메신저는 메신저·쪽지·영문으로, Ttree는 근무 시간·휴가 신청·이석·퇴근·영문으로 찾힌다', () => {
    const [m, t] = appCommandItems(['messenger', 'ttree'])
    expect(m).toMatchObject({
      title: '사내 메신저 열기',
      keywords: expect.arrayContaining(['메신저', '사내 메신저', '쪽지', 'messenger'])
    })
    expect(t).toMatchObject({
      title: 'Ttree 열기 (근무·휴가)',
      keywords: expect.arrayContaining([
        'Ttree',
        '근무 시간',
        '휴가 신청',
        '이석',
        '퇴근',
        '근무 시작'
      ])
    })
    // 받은 목록을 고쳐도 정의가 바뀌지 않는다
    t.keywords!.push('바뀜')
    expect(ttree.keywords).not.toContain('바뀜')
  })
})

describe('설치 위치', () => {
  it('%이름%을 환경 변수로 바꾸고, 값이 없는 변수가 있으면 null', () => {
    expect(expandEnv('%ProgramFiles%\\A\\a.exe', ENV)).toBe('C:\\Program Files\\A\\a.exe')
    expect(expandEnv('%ProgramFiles(x86)%\\A\\a.exe', ENV)).toBe(
      'C:\\Program Files (x86)\\A\\a.exe'
    )
    expect(expandEnv('C:\\ttree\\ttree.exe', ENV)).toBe('C:\\ttree\\ttree.exe')
    expect(expandEnv('%NOPE%\\a.exe', ENV)).toBeNull()
    expect(expandEnv('%ProgramFiles%\\a.exe', { ProgramFiles: '' })).toBeNull()
  })

  it('후보 중 처음 있는 경로. 없으면 null', () => {
    const exists = (p: string): boolean =>
      p === 'C:\\Program Files\\SURESOFTMessenger\\SURESOFTMessenger.exe' ||
      p === 'C:\\ttree\\ttree.exe'
    expect(locateApp(messenger, { env: ENV, exists })).toBe(
      'C:\\Program Files\\SURESOFTMessenger\\SURESOFTMessenger.exe'
    )
    expect(locateApp(ttree, { env: ENV, exists })).toBe('C:\\ttree\\ttree.exe')
    expect(locateApp(ttree, { env: ENV, exists: () => false })).toBeNull()
    // 사용자 폴더에 설치한 메신저(환경 변수가 없는 후보는 건너뛴다)
    const perUser =
      'C:\\Users\\u\\AppData\\Local\\Programs\\SURESOFTMessenger\\SURESOFTMessenger.exe'
    expect(
      locateApp(messenger, {
        env: { LOCALAPPDATA: ENV.LOCALAPPDATA },
        exists: (p) => p === perUser
      })
    ).toBe(perUser)
  })
})

interface RigOptions {
  /** 실행하기 전에 보이는 창 */
  shown?: AppWindow[]
  /** 실행한 뒤 이 번째 확인부터 창이 보인다(null이면 끝까지 안 보임) */
  appearAfter?: number | null
  released?: boolean
  native?: boolean
  path?: string | null
  launchError?: string
  focusOk?: boolean
  /** 실행한 시각(0) 기준으로 입력이 있었던 때. 없으면 실행한 뒤로 입력 없음 */
  inputAtMs?: number
}

interface Rig {
  d: AppCommandDeps
  calls: string[]
  /** 로그 apps.open의 내용 */
  result(): unknown
  polls(): number
}

/** 가짜 시계와 창 목록 */
function rig(o: RigOptions): Rig {
  const calls: string[] = []
  let clock = 0
  let polls = 0
  let launched = false
  const late: AppWindow = { hwnd: '200', minimized: false }
  const d: AppCommandDeps = {
    locate: vi.fn(() => (o.path === undefined ? 'C:\\ttree\\ttree.exe' : o.path)),
    nativeOk: () => o.native ?? true,
    windows: vi.fn(() => {
      if (!launched) return o.shown ?? []
      polls++
      return o.appearAfter != null && polls >= o.appearAfter ? [late] : []
    }),
    restore: vi.fn((h: string) => void calls.push(`restore:${h}`)),
    focus: vi.fn((h: string) => {
      calls.push(`focus:${h}`)
      return o.focusOk ?? true
    }),
    raise: vi.fn((h: string) => void calls.push(`raise:${h}`)),
    launch: vi.fn(async (p: string) => {
      calls.push(`launch:${p}`)
      launched = true
      return o.launchError ?? ''
    }),
    // 마지막 입력: inputAtMs(있으면), 아니면 실행 50ms 전에 뗀 Enter
    idleSeconds: () =>
      Math.floor(
        (o.inputAtMs !== undefined && clock >= o.inputAtMs ? clock - o.inputAtMs : clock + 50) /
          1000
      ),
    waitKeysReleased: vi.fn(async () => {
      calls.push('wait')
      return o.released ?? true
    }),
    hidePalette: vi.fn((restoreFocus: boolean) => void calls.push(`hide:${restoreFocus}`)),
    notify: vi.fn(),
    log: vi.fn(),
    sleep: vi.fn(async (ms: number) => {
      clock += ms
    }),
    now: () => clock
  }
  const result = (): unknown =>
    (d.log as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === 'apps.open')?.[1]
  return { d, calls, result, polls: () => polls }
}

describe('앱 열기', () => {
  it('다른 명령은 처리하지 않는다(Object 원형의 이름도)', async () => {
    const { d, calls } = rig({})
    for (const id of ['cmd.open-settings', 'toString', '__proto__', 'constructor'])
      await expect(createAppCommands(d).run(id), id).resolves.toBe(false)
    expect(calls).toEqual([])
    expect(d.log).not.toHaveBeenCalled()
  })

  it('보이는 창이 있으면: 키를 뗀 뒤 팔레트를 숨기고(원래 창으로 돌아가지 않음) 가장 앞의 창에 포커스, 실행하지 않는다', async () => {
    const r = rig({
      shown: [
        { hwnd: '11', minimized: false },
        { hwnd: '12', minimized: false }
      ]
    })
    await expect(createAppCommands(r.d).run('cmd.open-messenger')).resolves.toBe(true)
    expect(r.calls).toEqual(['wait', 'hide:false', 'focus:11'])
    expect(r.d.windows).toHaveBeenCalledWith('SURESOFTMessenger.exe')
    expect(r.result()).toEqual({ app: 'messenger', result: 'focused', ms: 0 })
  })

  it('최소화한 창은 되살린 뒤 포커스. 포커스를 못 주면 위로만 올린다', async () => {
    const r = rig({ shown: [{ hwnd: '11', minimized: true }], focusOk: false })
    await createAppCommands(r.d).run('cmd.open-ttree')
    expect(r.calls).toEqual(['wait', 'hide:false', 'restore:11', 'focus:11', 'raise:11'])
    expect(r.result()).toMatchObject({ app: 'ttree', result: 'raised' })
  })

  it('Enter를 떼지 않았으면 팔레트를 그대로 두고 다른 앱에 포커스를 주지 않는다(자동 반복 Enter가 메신저 입력칸으로 가지 않게)', async () => {
    const r = rig({ shown: [{ hwnd: '11', minimized: false }], released: false })
    await createAppCommands(r.d).run('cmd.open-messenger')
    expect(r.calls).toEqual(['wait'])
    expect(r.d.notify).toHaveBeenCalledWith('Enter에서 손을 뗀 뒤 다시 골라 주세요.')
    expect(r.result()).toMatchObject({ result: 'keys-held' })
  })

  it('보이는 창이 없으면(꺼짐·트레이로 숨음) 실행 파일을 열고, 창이 보이면 포커스', async () => {
    const r = rig({ appearAfter: 3 })
    await createAppCommands(r.d).run('cmd.open-ttree')
    expect(r.calls).toEqual(['wait', 'hide:false', 'launch:C:\\ttree\\ttree.exe', 'focus:200'])
    expect(r.result()).toEqual({ app: 'ttree', result: 'launched', ms: 3 * APP_LAUNCH.pollMs })
    expect(r.d.notify).not.toHaveBeenCalled()
  })

  it('늦게 뜬 창: 연 뒤에 입력이 있었으면 포커스를 빼앗지 않는다. 입력이 없었으면 포커스', async () => {
    const lateTick = Math.ceil((APP_LAUNCH.graceMs + 1000) / APP_LAUNCH.pollMs)
    const typed = rig({ appearAfter: lateTick, inputAtMs: 1500 })
    await createAppCommands(typed.d).run('cmd.open-ttree')
    expect(typed.calls).toEqual(['wait', 'hide:false', 'launch:C:\\ttree\\ttree.exe'])
    expect(typed.result()).toMatchObject({ result: 'launched-unfocused' })
    const quiet = rig({ appearAfter: lateTick })
    await createAppCommands(quiet.d).run('cmd.open-ttree')
    expect(quiet.calls.at(-1)).toBe('focus:200')
    expect(quiet.result()).toMatchObject({ result: 'launched' })
  })

  it('곧(graceMs 안에) 뜬 창은 연 뒤에 마우스를 움직였어도 포커스', async () => {
    const r = rig({ appearAfter: 4, inputAtMs: 300 })
    await createAppCommands(r.d).run('cmd.open-ttree')
    expect(r.calls.at(-1)).toBe('focus:200')
    expect(r.result()).toMatchObject({ result: 'launched' })
  })

  it('창이 끝내 보이지 않으면 기다리기를 멈추고 알림 영역 아이콘을 누르라고 알린다', async () => {
    const r = rig({ appearAfter: null })
    await createAppCommands(r.d).run('cmd.open-ttree')
    expect(r.polls()).toBe(APP_LAUNCH.waitMs / APP_LAUNCH.pollMs)
    expect(r.d.notify).toHaveBeenCalledWith(
      'Ttree를 켰는데 창이 보이지 않아요. 작업 표시줄 오른쪽 알림 영역(시계 옆)의 아이콘을 눌러 주세요.'
    )
    expect(r.result()).toMatchObject({ result: 'no-window', ms: APP_LAUNCH.waitMs })
  })

  it('설치 위치에 없으면 실행하지 않고 알린다', async () => {
    const r = rig({ path: null })
    await createAppCommands(r.d).run('cmd.open-messenger')
    expect(r.calls).toEqual(['wait', 'hide:false'])
    expect(r.d.notify).toHaveBeenCalledWith(
      '사내 메신저를 이 PC에서 찾지 못했어요. 시작 메뉴에서 직접 열어 주세요.'
    )
    expect(r.result()).toMatchObject({ result: 'not-found' })
  })

  it('실행하지 못하면 알리고 오류 글을 로그에 남긴다', async () => {
    const r = rig({ launchError: 'Failed to open path' })
    await createAppCommands(r.d).run('cmd.open-ttree')
    expect(r.d.notify).toHaveBeenCalledWith(
      'Ttree를 켜지 못했어요. 시작 메뉴에서 직접 열어 주세요.'
    )
    expect(r.d.log).toHaveBeenCalledWith('apps.launchError', {
      app: 'ttree',
      error: 'Failed to open path'
    })
    expect(r.result()).toMatchObject({ result: 'launch-failed' })
  })

  it('Win32를 쓸 수 없으면 창을 찾지 않고 실행 파일만 연다(기다리지 않는다)', async () => {
    const r = rig({ native: false, shown: [{ hwnd: '11', minimized: false }] })
    await createAppCommands(r.d).run('cmd.open-ttree')
    expect(r.d.windows).not.toHaveBeenCalled()
    expect(r.calls).toEqual(['wait', 'hide:false', 'launch:C:\\ttree\\ttree.exe'])
    expect(r.result()).toMatchObject({ result: 'launched' })
  })
})
