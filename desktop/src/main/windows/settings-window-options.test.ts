import { expect, it } from 'vitest'
import { settingsWindowOptions } from './settings-window-options'

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
