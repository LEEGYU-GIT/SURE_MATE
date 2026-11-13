import { describe, expect, it } from 'vitest'
import {
  guideWindowSize,
  keepWindowTitle,
  planSettingsOpen,
  settingsWindowOptions
} from './settings-window-options'

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

it('온보딩: 같은 창 모양에 크기만 720×520 고정(1280×720 125%의 작업 영역 약 1024×536에 들어간다)', () => {
  const o = settingsWindowOptions('preload.js', '/onboarding')
  expect(o).toMatchObject({
    width: 720,
    height: 520,
    resizable: false,
    maximizable: false,
    title: 'Sure-Mate 시작하기'
  })
  expect(
    settingsWindowOptions('preload.js', '/onboarding', { width: 1024, height: 536 })
  ).toMatchObject({ width: 720, height: 520 })
  // 설정 창은 작업 영역과 상관없이 그대로(크기를 바꿀 수 있다)
  expect(
    settingsWindowOptions('preload.js', '/settings', { width: 800, height: 400 })
  ).toMatchObject({ width: 880, height: 640, minWidth: 720, minHeight: 520 })
})

it('30초 따라 해 보기: 첫 실행 안내와 같은 작은 고정 크기, 제목 "Sure-Mate 따라 해 보기"', () => {
  expect(settingsWindowOptions('preload.js', '/try')).toMatchObject({
    width: 720,
    height: 520,
    resizable: false,
    maximizable: false,
    title: 'Sure-Mate 따라 해 보기'
  })
  expect(settingsWindowOptions('preload.js', '/try', { width: 853, height: 448 })).toMatchObject({
    width: 720,
    height: 432
  })
  // 같은 창 하나를 쓴다: 첫 실행 안내·설정에서 오면 경로를 바꾸고(탭은 붙지 않는다), 이미 열려 있으면 앞으로만
  expect(planSettingsOpen(null, '/try')).toEqual({ kind: 'create', hash: '/try' })
  expect(planSettingsOpen({ route: '/onboarding', loading: false }, '/try')).toEqual({
    kind: 'switch-route',
    hash: '/try'
  })
  expect(planSettingsOpen({ route: '/settings', loading: false }, '/try', 'pet')).toEqual({
    kind: 'switch-route',
    hash: '/try'
  })
  expect(planSettingsOpen({ route: '/try', loading: false }, '/try')).toEqual({
    kind: 'show',
    tab: null,
    ws: null
  })
  expect(planSettingsOpen({ route: '/try', loading: false }, '/settings', 'masking')).toEqual({
    kind: 'switch-route',
    hash: '/settings?tab=masking'
  })
})

describe('guideWindowSize: 작업 영역이 더 작으면 여백을 남기고 줄인다(내용은 안에서 스크롤, 아래 단추 줄은 늘 보인다)', () => {
  it('작업 영역을 모르면 720×520, 넉넉하면 그대로', () => {
    expect(guideWindowSize()).toEqual({ width: 720, height: 520 })
    expect(guideWindowSize({ width: 1920, height: 1040 })).toEqual({ width: 720, height: 520 })
    expect(guideWindowSize({ width: 1024, height: 536 })).toEqual({ width: 720, height: 520 })
  })

  it('1280×720 150%(작업 영역 약 853×448)에서는 높이를 작업 영역 − 16으로 줄인다', () => {
    expect(guideWindowSize({ width: 853, height: 448 })).toEqual({ width: 720, height: 432 })
  })

  it('좁은 작업 영역은 좌우 16씩 남기고, 아주 작아도 560×400 아래로는 줄이지 않는다', () => {
    expect(guideWindowSize({ width: 700, height: 500 })).toEqual({ width: 668, height: 484 })
    expect(guideWindowSize({ width: 400, height: 300 })).toEqual({ width: 560, height: 400 })
  })

  it('소수 DIP 작업 영역은 내림한다(창이 작업 영역을 넘지 않게)', () => {
    expect(guideWindowSize({ width: 853.33, height: 448.8 })).toEqual({ width: 720, height: 432 })
  })
})

it('(13b) 화면의 <title>(Sure-Mate)이 창 제목(Sure-Mate 설정·시작하기)을 바꾸지 않게 page-title-updated를 막는다', () => {
  const listeners = new Map<string, (e: { preventDefault(): void }) => void>()
  keepWindowTitle({ on: (event, listener) => void listeners.set(event, listener) })
  let prevented = 0
  listeners.get('page-title-updated')?.({ preventDefault: () => void prevented++ })
  expect(prevented).toBe(1)
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
    expect(planSettingsOpen({ route: '/settings', loading: false }, '/settings', 'pet')).toEqual({ kind: 'show', tab: 'pet', ws: null })
    // 탭 없이 열면 보던 탭 그대로 앞으로만
    expect(planSettingsOpen({ route: '/settings', loading: false }, '/settings')).toEqual({ kind: 'show', tab: null, ws: null })
    expect(planSettingsOpen({ route: '/onboarding', loading: false }, '/onboarding', 'pet')).toEqual({ kind: 'show', tab: null, ws: null })
  })

  it('설정 창을 아직 읽는 중이면(화면이 알림을 아직 못 받음) 탭을 붙여 다시 읽는다', () => {
    expect(planSettingsOpen({ route: '/settings', loading: true }, '/settings', 'pet')).toEqual({ kind: 'reload', hash: '/settings?tab=pet' })
    expect(planSettingsOpen({ route: '/settings', loading: true }, '/settings')).toEqual({ kind: 'show', tab: null, ws: null })
  })

  it('워크스페이스 탭은 열 워크스페이스를 함께: 새 창·다시 읽기는 주소에, 열린 창은 탭 고르기 알림에 붙인다', () => {
    expect(planSettingsOpen(null, '/settings', 'workspace', 'ws-qa')).toEqual({ kind: 'create', hash: '/settings?tab=workspace&ws=ws-qa' })
    expect(planSettingsOpen({ route: '/onboarding', loading: false }, '/settings', 'workspace', 'ws-qa')).toEqual({
      kind: 'switch-route',
      hash: '/settings?tab=workspace&ws=ws-qa'
    })
    expect(planSettingsOpen({ route: '/settings', loading: true }, '/settings', 'workspace', 'ws-qa')).toEqual({ kind: 'reload', hash: '/settings?tab=workspace&ws=ws-qa' })
    expect(planSettingsOpen({ route: '/settings', loading: false }, '/settings', 'workspace', 'ws-qa')).toEqual({ kind: 'show', tab: 'workspace', ws: 'ws-qa' })
    expect(planSettingsOpen({ route: '/settings', loading: false }, '/settings', 'workspace')).toEqual({ kind: 'show', tab: 'workspace', ws: null })
    // 형식이 틀린 id, 다른 탭의 id는 버린다
    expect(planSettingsOpen({ route: '/settings', loading: false }, '/settings', 'workspace', 'a/b')).toEqual({ kind: 'show', tab: 'workspace', ws: null })
    expect(planSettingsOpen({ route: '/settings', loading: false }, '/settings', 'pet', 'ws-qa')).toEqual({ kind: 'show', tab: 'pet', ws: null })
    expect(planSettingsOpen(null, '/settings', 'pet', 'ws-qa')).toEqual({ kind: 'create', hash: '/settings?tab=pet' })
  })

  it("말하듯 입력 탭(openSettings('/settings', { tab: 'natural' })): 만들기·경로 바꾸기·다시 읽기는 주소에, 열린 창은 탭 고르기 알림", () => {
    expect(planSettingsOpen(null, '/settings', 'natural')).toEqual({ kind: 'create', hash: '/settings?tab=natural' })
    expect(planSettingsOpen({ route: '/onboarding', loading: false }, '/settings', 'natural')).toEqual({ kind: 'switch-route', hash: '/settings?tab=natural' })
    expect(planSettingsOpen({ route: '/settings', loading: true }, '/settings', 'natural')).toEqual({ kind: 'reload', hash: '/settings?tab=natural' })
    expect(planSettingsOpen({ route: '/settings', loading: false }, '/settings', 'natural')).toEqual({ kind: 'show', tab: 'natural', ws: null })
  })
})
