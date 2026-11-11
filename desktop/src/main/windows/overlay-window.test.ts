import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Rect } from '../../shared/types'

// electron·@electron-toolkit/utils는 Electron 밖(vitest)에서 불러올 수 없어 흉내 낸다. is.dev는 시험마다 바꾼다.
const env = vi.hoisted(() => ({ is: { dev: false }, logs: [] as { event: string; data: Record<string, unknown> }[] }))
vi.mock('electron', () => ({ BrowserWindow: class {} }))
vi.mock('@electron-toolkit/utils', () => ({ is: env.is }))
vi.mock('../log', () => ({ log: (event: string, data: Record<string, unknown> = {}) => void env.logs.push({ event, data }) }))

import { PET_WINDOW } from '../../shared/pet/pet-view'
import { hwndOf, loadRoute, overlayWindowOptions, petWindowOptions, raiseOverlay } from './overlay-window'

afterEach(() => {
  env.is.dev = false
  env.logs.length = 0
  vi.unstubAllEnvs()
})

describe('overlayWindowOptions: 바·펼침 창 공통 옵션(설계 §14-1·§9)', () => {
  it('보안 옵션과 포커스를 받지 않는 창 옵션', () => {
    const o = overlayWindowOptions('p')
    expect(o.webPreferences?.contextIsolation).toBe(true)
    expect(o.webPreferences?.nodeIntegration).toBe(false)
    expect(o.webPreferences?.sandbox).toBe(true)
    expect(o.webPreferences?.spellcheck).toBe(false)
    expect(o.focusable).toBe(false)
    expect(o.transparent).toBe(true)
    expect(o.type).toBe('toolbar')
    expect(o.skipTaskbar).toBe(true)
    expect(o.alwaysOnTop).toBe(true)
    expect(o.resizable).toBe(false)
    expect(o.frame).toBe(false)
    expect(o.thickFrame).toBe(false)
    expect(o.show).toBe(false)
  })

  it('계획에 적힌 값 그대로(숨긴 펼침 창도 그리고 재도록 backgroundThrottling 끔)', () => {
    expect(overlayWindowOptions('p')).toEqual({
      show: false,
      frame: false,
      transparent: true,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      type: 'toolbar',
      alwaysOnTop: true,
      hasShadow: false,
      thickFrame: false,
      roundedCorners: false,
      backgroundColor: '#00000000',
      webPreferences: { preload: 'p', contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false }
    })
  })

  it('부를 때마다 새 객체(한 창의 옵션을 고쳐도 다른 창에 번지지 않게)', () => {
    const a = overlayWindowOptions('p')
    const b = overlayWindowOptions('p')
    expect(a).not.toBe(b)
    expect(a.webPreferences).not.toBe(b.webPreferences)
  })
})

describe('petWindowOptions: 말랑 메이트 창 옵션(설계 §14-2·§5)', () => {
  it('보안 옵션, 포커스를 받지 않는 투명 창, 320×240, 숨긴 동안 그리지 않음', () => {
    const o = petWindowOptions('p')
    expect(o.webPreferences?.preload).toBe('p')
    expect(o.webPreferences?.contextIsolation).toBe(true)
    expect(o.webPreferences?.nodeIntegration).toBe(false)
    expect(o.webPreferences?.sandbox).toBe(true)
    expect(o.webPreferences?.spellcheck).toBe(false)
    expect(o.focusable).toBe(false)
    expect(o.transparent).toBe(true)
    expect(o.frame).toBe(false)
    expect(o.skipTaskbar).toBe(true)
    expect(o.alwaysOnTop).toBe(true)
    expect(o.type).toBe('toolbar')
    expect(o.width).toBe(320)
    expect(o.height).toBe(240)
    expect({ width: o.width, height: o.height }).toEqual(PET_WINDOW)
    expect(o.webPreferences?.backgroundThrottling).toBe(true)
    expect(o.show).toBe(false)
  })

  it('바·펼침 창 공통 옵션에서 크기와 backgroundThrottling만 다르다', () => {
    const { width, height, webPreferences, ...rest } = petWindowOptions('p')
    const { webPreferences: base, ...baseRest } = overlayWindowOptions('p')
    expect(rest).toEqual(baseRest)
    expect({ width, height }).toEqual({ width: 320, height: 240 })
    expect(webPreferences).toEqual({ ...base, backgroundThrottling: true })
  })

  it('부를 때마다 새 객체이고 공통 옵션을 바꾸지 않는다', () => {
    const a = petWindowOptions('p')
    const b = petWindowOptions('p')
    expect(a).not.toBe(b)
    expect(a.webPreferences).not.toBe(b.webPreferences)
    expect(overlayWindowOptions('p').webPreferences?.backgroundThrottling).toBe(false)
  })
})

describe('loadRoute: 같은 renderer 번들을 # 경로로 불러온다', () => {
  const html = join(__dirname, '../renderer/index.html')
  const fakeWindow = (fail = false) => ({
    loadURL: vi.fn(() => (fail ? Promise.reject(new Error('ERR_ABORTED')) : Promise.resolve())),
    loadFile: vi.fn(() => (fail ? Promise.reject(new Error('ERR_FILE_NOT_FOUND')) : Promise.resolve()))
  })

  it('설치본: index.html을 파일로, 경로는 hash로', () => {
    const w = fakeWindow()
    loadRoute(w, '/bar')
    expect(w.loadFile).toHaveBeenCalledWith(html, { hash: '/bar' })
    loadRoute(w, '')
    expect(w.loadFile).toHaveBeenLastCalledWith(html)
    expect(w.loadURL).not.toHaveBeenCalled()
  })

  it('펫 창은 #/pet(App.tsx의 펫 화면)', () => {
    const w = fakeWindow()
    loadRoute(w, '/pet')
    expect(w.loadFile).toHaveBeenCalledWith(html, { hash: '/pet' })
    env.is.dev = true
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')
    loadRoute(w, '/pet')
    expect(w.loadURL).toHaveBeenCalledWith('http://localhost:5173#/pet')
  })

  it('설치본은 ELECTRON_RENDERER_URL이 있어도 주소를 불러오지 않는다(바깥 주소에 preload API가 열리지 않게)', () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')
    const w = fakeWindow()
    loadRoute(w, '/flyout')
    expect(w.loadURL).not.toHaveBeenCalled()
    expect(w.loadFile).toHaveBeenCalledWith(html, { hash: '/flyout' })
  })

  it('개발 모드: 개발 서버 주소에 #경로', () => {
    env.is.dev = true
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')
    const w = fakeWindow()
    loadRoute(w, '/flyout')
    expect(w.loadURL).toHaveBeenCalledWith('http://localhost:5173#/flyout')
    loadRoute(w, '')
    expect(w.loadURL).toHaveBeenLastCalledWith('http://localhost:5173')
    expect(w.loadFile).not.toHaveBeenCalled()
  })

  it('불러오지 못하면 기록만 하고 처리하지 않은 거부를 남기지 않는다', async () => {
    const w = fakeWindow(true)
    loadRoute(w, '/ime-logger')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(env.logs).toEqual([{ event: 'window.load.failed', data: { route: '/ime-logger', error: 'ERR_FILE_NOT_FOUND' } }])
  })
})

it('hwndOf: 창 핸들 버퍼(x64는 8바이트, 리틀 엔디언)를 10진 문자열로(IPC·로그에 BigInt를 넘기지 않게)', () => {
  const b = Buffer.alloc(8)
  b.writeBigUInt64LE(0x1a2b3cn)
  expect(hwndOf(b)).toBe('1715004')
  const big = Buffer.alloc(8)
  big.writeBigUInt64LE(0xffffffff_00000010n)
  expect(hwndOf(big)).toBe('18446744069414584336')
  expect(hwndOf(Buffer.from([0x10, 0, 0, 0]))).toBe('16')
  expect(hwndOf(Buffer.alloc(0))).toBe('0')
})

describe('raiseOverlay: 맨 앞(TOPMOST)으로 올리기', () => {
  const LAST: Rect = { x: 1864, y: 292, width: 56, height: 456 }
  function handle(o: { actual?: Rect; last?: Rect | null; moveTopThrows?: boolean } = {}) {
    const calls: string[] = []
    return {
      calls,
      w: {
        hwnd: '42',
        moveTop: vi.fn(() => {
          calls.push('moveTop')
          if (o.moveTopThrows) throw new Error('Object has been destroyed')
        }),
        getBounds: vi.fn(() => o.actual ?? LAST),
        setBounds: vi.fn((r: Rect) => void calls.push(`setBounds ${JSON.stringify(r)}`)),
        lastBounds: () => (o.last === undefined ? LAST : o.last)
      }
    }
  }
  const native = (o: { available: boolean; result?: boolean; throws?: boolean }) => ({
    available: vi.fn(() => o.available),
    raiseTopmost: vi.fn((hwnd: string) => {
      if (o.throws) throw new Error(`koffi: ${hwnd}`)
      return o.result ?? true
    })
  })

  it('Win32를 쓸 수 있으면 SetWindowPos(HWND_TOPMOST)만(이동·크기 없음), moveTop은 부르지 않는다', () => {
    const h = handle()
    const n = native({ available: true })
    raiseOverlay(h.w, n)
    expect(n.raiseTopmost).toHaveBeenCalledWith('42')
    expect(h.w.moveTop).not.toHaveBeenCalled()
    expect(h.w.setBounds).not.toHaveBeenCalled()
  })

  it('Win32가 막혔으면 moveTop 뒤 창이 마지막 사각형에서 벗어났을 때만 되돌린다(moveTop의 배율 화면 동작 미확인)', () => {
    const drifted = handle({ actual: { x: 1243, y: 195, width: 37, height: 304 } })
    raiseOverlay(drifted.w, native({ available: false }))
    expect(drifted.calls).toEqual(['moveTop', `setBounds ${JSON.stringify(LAST)}`])

    const near = handle({ actual: { x: 1865, y: 291, width: 57, height: 455 } })
    raiseOverlay(near.w, native({ available: false }))
    expect(near.calls).toEqual(['moveTop'])

    const never = handle({ last: null, actual: { x: 0, y: 0, width: 10, height: 10 } })
    raiseOverlay(never.w, native({ available: false }))
    expect(never.calls).toEqual(['moveTop'])
  })

  it('SetWindowPos가 실패하거나 던지면 moveTop으로 대신한다', () => {
    const failed = handle()
    raiseOverlay(failed.w, native({ available: true, result: false }))
    expect(failed.calls).toEqual(['moveTop'])
    const threw = handle()
    raiseOverlay(threw.w, native({ available: true, throws: true }))
    expect(threw.calls).toEqual(['moveTop'])
  })

  it('창이 이미 닫혔어도 던지지 않는다(2초마다·펼칠 때마다 불린다)', () => {
    const h = handle({ moveTopThrows: true })
    expect(() => raiseOverlay(h.w, native({ available: false }))).not.toThrow()
  })
})
