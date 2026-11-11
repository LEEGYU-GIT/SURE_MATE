import { describe, expect, it } from 'vitest'
import { planSettingsOpen, settingsWindowOptions } from './settings-window-options'

it('설정 창: 일반 창(포커스·작업 표시줄), 어두운 제목 줄, 처음엔 숨김, 크기 880×640(최소 720×520)', () => {
  const o = settingsWindowOptions('preload.js', '/settings')
  expect(o).toMatchObject({
    show: false,
    width: 880,
    height: 640,
    minWidth: 720,
    minHeight: 520,
    resizable: true,
    skipTaskbar: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    backgroundColor: '#1E212A',
    title: 'Sure-Mate 설정'
  })
  expect(o.titleBarOverlay).toEqual({ color: '#1E212A', symbolColor: '#C9D0DD', height: 40 })
  expect(o.focusable).not.toBe(false)
  expect(o.webPreferences).toMatchObject({ preload: 'preload.js', contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false })
})

it('온보딩: 같은 창 모양에 크기만 640×560 고정', () => {
  const o = settingsWindowOptions('preload.js', '/onboarding')
  expect(o).toMatchObject({ width: 640, height: 560, resizable: false, maximizable: false, title: 'Sure-Mate 시작하기' })
})

describe('설정 창을 탭과 함께 열기(펫 메뉴 "펫 설정" → 말랑 메이트 탭)', () => {
  it('닫혀 있으면 그 탭을 주소에 붙여 만든다(탭이 없으면 일반 탭)', () => {
    expect(planSettingsOpen(null, '/settings', 'pet')).toEqual({ kind: 'create', hash: '/settings?tab=pet' })
    expect(planSettingsOpen(null, '/settings')).toEqual({ kind: 'create', hash: '/settings' })
    expect(planSettingsOpen(null, '/onboarding', 'pet')).toEqual({ kind: 'create', hash: '/onboarding' })
  })

  it('첫 실행 안내가 열려 있으면 설정 창으로 바꿔 그 탭을 연다', () => {
    expect(planSettingsOpen({ route: '/onboarding', loading: false }, '/settings', 'pet')).toEqual({ kind: 'switch-route', hash: '/settings?tab=pet' })
  })

  it('설정 창이 열려 있으면 다시 읽지 않고 그 탭을 고르라고 알린다(쓰던 녹화·입력을 지킨다)', () => {
    expect(planSettingsOpen({ route: '/settings', loading: false }, '/settings', 'pet')).toEqual({ kind: 'show', tab: 'pet' })
    // 탭 없이 열면 보던 탭 그대로 앞으로만
    expect(planSettingsOpen({ route: '/settings', loading: false }, '/settings')).toEqual({ kind: 'show', tab: null })
    expect(planSettingsOpen({ route: '/onboarding', loading: false }, '/onboarding', 'pet')).toEqual({ kind: 'show', tab: null })
  })

  it('설정 창을 아직 읽는 중이면(화면이 알림을 아직 못 받음) 탭을 붙여 다시 읽는다', () => {
    expect(planSettingsOpen({ route: '/settings', loading: true }, '/settings', 'pet')).toEqual({ kind: 'reload', hash: '/settings?tab=pet' })
    expect(planSettingsOpen({ route: '/settings', loading: true }, '/settings')).toEqual({ kind: 'show', tab: null })
  })
})
