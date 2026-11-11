import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { IPC } from '../../shared/ipc-channels'
import type { PetView } from '../../shared/pet/pet-view'
import type { Rect } from '../../shared/types'

// electron·@electron-toolkit/utils는 Electron 밖(vitest)에서 불러올 수 없어 흉내 낸다.
// BrowserWindow는 만든 옵션과 부른 메서드를 기록하는 가짜다.
const env = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void
  class FakeBrowserWindow {
    static made: FakeBrowserWindow[] = []
    calls: string[] = []
    listeners = new Map<string, Listener[]>()
    contentsListeners = new Map<string, Listener[]>()
    destroyed = false
    static failHandle = false
    webContents = {
      id: 31,
      send: (channel: string, ...args: unknown[]) => void this.calls.push(`send ${channel} ${JSON.stringify(args)}`),
      on: (event: string, fn: Listener) => void this.contentsListeners.set(event, [...(this.contentsListeners.get(event) ?? []), fn])
    }
    constructor(public options: Record<string, unknown>) {
      FakeBrowserWindow.made.push(this)
    }
    removeMenu(): void {
      this.calls.push('removeMenu')
    }
    setAlwaysOnTop(flag: boolean, level?: string): void {
      this.calls.push(`setAlwaysOnTop ${flag} ${level}`)
    }
    setIgnoreMouseEvents(...args: unknown[]): void {
      this.calls.push(`setIgnoreMouseEvents ${JSON.stringify(args)}`)
    }
    getNativeWindowHandle(): Buffer {
      if (FakeBrowserWindow.failHandle) throw new Error('handle')
      const b = Buffer.alloc(8)
      b.writeBigUInt64LE(77n)
      return b
    }
    loadFile(_file: string, o?: { hash?: string }): Promise<void> {
      this.calls.push(`loadFile ${o?.hash ?? ''}`)
      return Promise.resolve()
    }
    loadURL(url: string): Promise<void> {
      this.calls.push(`loadURL ${url}`)
      return Promise.resolve()
    }
    on(event: string, fn: Listener): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), fn])
      return this
    }
    isDestroyed(): boolean {
      return this.destroyed
    }
    focused = false
    isFocused(): boolean {
      return this.focused
    }
    destroy(): void {
      this.calls.push('destroy')
      this.destroyed = true
    }
  }
  return { FakeBrowserWindow, is: { dev: false } }
})
vi.mock('electron', () => ({ BrowserWindow: env.FakeBrowserWindow }))
vi.mock('@electron-toolkit/utils', () => ({ is: env.is }))
vi.mock('../log', () => ({ log: () => {} }))

import { createPetWindow, isSystemMenuKey, petWindowControls, type PetWindowTarget } from './pet-window'

afterEach(() => {
  env.FakeBrowserWindow.made.length = 0
  env.FakeBrowserWindow.failHandle = false
})

const R: Rect = { x: 800, y: 805, width: 320, height: 240 }
const ZERO: Rect = { x: 0, y: 0, width: 0, height: 0 }

/**
 * 펫 창 연결부가 쓰는 BrowserWindow 부분의 가짜. drift가 있으면 getBounds가 그 값을 돌려준다
 * (배율이 다른 모니터에서 크기가 어긋나는 electron#27651 흉내). 한 번 다시 놓으면 맞는다.
 */
type TargetMocks = { [K in Exclude<keyof PetWindowTarget, 'webContents'>]: Mock<PetWindowTarget[K]> } & {
  webContents: { send: Mock<PetWindowTarget['webContents']['send']> }
}
type FakeTarget = { t: TargetMocks; calls: string[]; destroy(): void; setDrift(r: Rect): void }

function target(o: { drift?: Rect } = {}): FakeTarget {
  let destroyed = false
  let placed: Rect | null = null
  let drift = o.drift ?? null
  const calls: string[] = []
  const t: TargetMocks = {
    isDestroyed: vi.fn<PetWindowTarget['isDestroyed']>(() => destroyed),
    setBounds: vi.fn<PetWindowTarget['setBounds']>((r) => {
      // 두 번째 놓기부터는 맞는다
      if (placed && drift && JSON.stringify(placed) === JSON.stringify(r)) drift = null
      placed = r
      calls.push(`setBounds ${JSON.stringify(r)}`)
    }),
    getBounds: vi.fn<PetWindowTarget['getBounds']>(() => {
      calls.push('getBounds')
      return drift ?? placed ?? ZERO
    }),
    showInactive: vi.fn<PetWindowTarget['showInactive']>(() => void calls.push('showInactive')),
    hide: vi.fn<PetWindowTarget['hide']>(() => void calls.push('hide')),
    // 실제로 넘긴 인자를 모두 남긴다(forward 옵션이 붙지 않았는지 본다)
    setIgnoreMouseEvents: vi.fn<PetWindowTarget['setIgnoreMouseEvents']>((...args) => void calls.push(`setIgnoreMouseEvents ${JSON.stringify(args)}`)),
    setFocusable: vi.fn<PetWindowTarget['setFocusable']>((f) => void calls.push(`setFocusable ${f}`)),
    setSkipTaskbar: vi.fn<PetWindowTarget['setSkipTaskbar']>((s) => void calls.push(`setSkipTaskbar ${s}`)),
    focus: vi.fn<PetWindowTarget['focus']>(() => void calls.push('focus')),
    moveTop: vi.fn<PetWindowTarget['moveTop']>(() => void calls.push('moveTop')),
    webContents: {
      send: vi.fn<PetWindowTarget['webContents']['send']>((channel, ...args) => void calls.push(`send ${channel} ${JSON.stringify(args)}`))
    }
  }
  return {
    t,
    calls,
    destroy: () => void (destroyed = true),
    /** 다음 모니터에서 다시 어긋난다 */
    setDrift: (r: Rect) => void (drift = r)
  }
}

const nativeOff = { available: () => false, raiseTopmost: vi.fn(() => false) }

describe('petWindowControls: 펫 창 포트(컨트롤러가 부르는 창 연결부)', () => {
  it('setBounds는 정수 DIP 사각형으로 놓는다(Electron은 소수 좌표를 받지 않는다)', () => {
    const w = target()
    const c = petWindowControls(w.t, '77', nativeOff)
    c.port.setBounds({ x: 800.4, y: 804.6, width: 319.6, height: 240.2 })
    expect(w.t.setBounds).toHaveBeenCalledWith({ x: 800, y: 805, width: 320, height: 240 })
  })

  it('유한하지 않은 사각형은 놓지 않는다(던지지 않는다)', () => {
    const w = target()
    const c = petWindowControls(w.t, '77', nativeOff)
    expect(() => c.port.setBounds({ x: Number.NaN, y: 0, width: 320, height: 240 })).not.toThrow()
    expect(() => c.port.setBounds({ x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 240 })).not.toThrow()
    expect(w.t.setBounds).not.toHaveBeenCalled()
  })

  it('처음 표시할 때만 크기를 한 번 확인하고, 2 DIP 넘게 어긋났으면 같은 사각형으로 한 번 더 놓는다(electron#27651)', () => {
    const w = target({ drift: { x: 800, y: 805, width: 400, height: 300 } })
    const c = petWindowControls(w.t, '77', nativeOff)
    // 컨트롤러는 숨긴 채 놓은 뒤 보인다: 숨긴 동안에는 확인하지 않는다
    c.port.setBounds(R)
    c.port.showInactive()
    expect(w.calls).toEqual([`setBounds ${JSON.stringify(R)}`, 'showInactive', 'getBounds', `setBounds ${JSON.stringify(R)}`])
    // 그 뒤 매 프레임에는 확인하지 않는다
    w.calls.length = 0
    for (let i = 1; i <= 3; i++) c.port.setBounds({ ...R, x: R.x - i })
    expect(w.calls.filter((s) => s === 'getBounds')).toEqual([])
    // 다시 숨겼다 보여도 처음 표시가 아니면 확인하지 않는다
    c.port.hide()
    c.port.showInactive()
    expect(w.t.getBounds).toHaveBeenCalledTimes(1)
  })

  it('2 DIP 안의 어긋남(배율 반올림)은 다시 놓지 않는다', () => {
    const w = target({ drift: { x: 801, y: 804, width: 322, height: 238 } })
    const c = petWindowControls(w.t, '77', nativeOff)
    c.port.setBounds(R)
    c.port.showInactive()
    expect(w.t.getBounds).toHaveBeenCalledTimes(1)
    expect(w.t.setBounds).toHaveBeenCalledTimes(1)
  })

  it('모니터가 바뀐 뒤(recheckSize) 보이는 동안 다음 놓기에서 한 번 확인한다', () => {
    const w = target()
    const c = petWindowControls(w.t, '77', nativeOff)
    c.port.setBounds(R)
    c.port.showInactive()
    expect(w.t.getBounds).toHaveBeenCalledTimes(1)
    c.recheckSize()
    c.port.setBounds({ ...R, x: 10 })
    expect(w.t.getBounds).toHaveBeenCalledTimes(2)
    c.port.setBounds({ ...R, x: 20 })
    expect(w.t.getBounds).toHaveBeenCalledTimes(2)
  })

  it('숨긴 동안 모니터가 바뀌면 다시 보일 때 확인한다', () => {
    const w = target({ drift: { x: 0, y: 0, width: 400, height: 300 } })
    const c = petWindowControls(w.t, '77', nativeOff)
    c.port.setBounds(R)
    c.port.showInactive()
    c.port.hide()
    c.recheckSize()
    // 배율이 다른 모니터로 옮기면 다시 어긋난다
    w.setDrift({ x: -1280, y: 789, width: 400, height: 300 })
    const next = { x: -1280, y: 789, width: 320, height: 240 }
    c.port.setBounds(next)
    expect(w.t.getBounds).toHaveBeenCalledTimes(1)
    c.port.showInactive()
    expect(w.t.getBounds).toHaveBeenCalledTimes(2)
    expect(w.calls.slice(-3)).toEqual(['showInactive', 'getBounds', `setBounds ${JSON.stringify(next)}`])
  })

  it('setIgnoreMouse는 forward 없이 부른다(전역 마우스 훅을 쓰지 않는다, 계획 결정 1)', () => {
    const w = target()
    const c = petWindowControls(w.t, '77', nativeOff)
    c.port.setIgnoreMouse(false)
    c.port.setIgnoreMouse(true)
    expect(w.t.setIgnoreMouseEvents.mock.calls).toEqual([[false], [true]])
  })

  it('setFocusable 뒤에는 작업 표시줄 단추를 늘 숨긴다(조종 모드에도 작업 표시줄에 나오지 않게)', () => {
    const w = target()
    const c = petWindowControls(w.t, '77', nativeOff)
    c.port.setFocusable(true)
    c.port.focus()
    c.port.setFocusable(false)
    expect(w.calls).toEqual(['setFocusable true', 'setSkipTaskbar true', 'focus', 'setFocusable false', 'setSkipTaskbar true'])
  })

  it('send는 펫 화면 채널로, hide는 그대로', () => {
    const w = target()
    const c = petWindowControls(w.t, '77', nativeOff)
    const v = { size: 56 } as unknown as PetView
    c.port.send(v)
    c.port.hide()
    expect(w.t.webContents.send).toHaveBeenCalledWith(IPC.petView, v)
    expect(w.t.hide).toHaveBeenCalledTimes(1)
  })

  it('맨 앞 올리기: Win32가 있으면 SetWindowPos(HWND_TOPMOST)만, 없으면 moveTop', () => {
    const on = target()
    const native = { available: () => true, raiseTopmost: vi.fn(() => true) }
    petWindowControls(on.t, '77', native).raise()
    expect(native.raiseTopmost).toHaveBeenCalledWith('77')
    expect(on.t.moveTop).not.toHaveBeenCalled()

    const off = target()
    petWindowControls(off.t, '77', nativeOff).raise()
    expect(off.t.moveTop).toHaveBeenCalledTimes(1)
  })

  it('창이 닫힌 뒤(앱을 끝내는 중, 정리 중 setFocusable(false))에는 아무것도 하지 않고 던지지 않는다', () => {
    const w = target()
    const c = petWindowControls(w.t, '77', nativeOff)
    w.destroy()
    expect(() => {
      c.port.setBounds(R)
      c.port.showInactive()
      c.port.hide()
      c.port.send({} as PetView)
      c.port.setIgnoreMouse(true)
      c.port.setFocusable(false)
      c.port.focus()
      c.recheckSize()
      c.raise()
    }).not.toThrow()
    expect(w.calls).toEqual([])
  })
})

describe('isSystemMenuKey: 조종 모드에서 막는 시스템 메뉴 키(Alt+Space)', () => {
  type KeyInput = { type: string; alt: boolean; control: boolean; shift: boolean; code: string }
  const key = (o: Partial<KeyInput>): KeyInput => ({
    type: 'keyDown',
    alt: false,
    control: false,
    shift: false,
    code: 'Space',
    ...o
  })

  it('Alt+Space 누름(Shift를 함께 눌러도)', () => {
    expect(isSystemMenuKey(key({ alt: true }))).toBe(true)
    expect(isSystemMenuKey(key({ alt: true, shift: true }))).toBe(true)
  })

  it('Space만(뛰기)·뗌·Ctrl+Alt+Space·Alt+다른 키는 막지 않는다', () => {
    expect(isSystemMenuKey(key({}))).toBe(false)
    expect(isSystemMenuKey(key({ alt: true, type: 'keyUp' }))).toBe(false)
    expect(isSystemMenuKey(key({ alt: true, control: true }))).toBe(false)
    expect(isSystemMenuKey(key({ alt: true, code: 'F4' }))).toBe(false)
    expect(isSystemMenuKey(key({ alt: true, code: 'ArrowLeft' }))).toBe(false)
  })
})

describe('createPetWindow: 펫 창 만들기', () => {
  function made(): { w: ReturnType<typeof createPetWindow>; fake: InstanceType<typeof env.FakeBrowserWindow> } {
    const w = createPetWindow()
    const fake = env.FakeBrowserWindow.made[0]
    return { w, fake }
  }

  it('펫 창 옵션으로 만들고 메뉴 막대를 없앤 뒤 screen-saver 수준·클릭 통과(forward 없음)로 #/pet을 불러온다', () => {
    const { w, fake } = made()
    expect(env.FakeBrowserWindow.made).toHaveLength(1)
    expect(fake.options).toMatchObject({ width: 320, height: 240, focusable: false, transparent: true, show: false })
    expect(fake.options.webPreferences).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: true })
    expect(String((fake.options.webPreferences as { preload: string }).preload)).toMatch(/preload[\\/]index\.js$/)
    expect(fake.calls).toEqual(['removeMenu', 'setAlwaysOnTop true screen-saver', 'setIgnoreMouseEvents [true]', 'loadFile /pet'])
    expect(w.hwnd).toBe('77')
    expect(w.contentsId).toBe(31)
    expect(w.win).toBe(fake)
  })

  it('조종 모드의 Alt+Space(시스템 메뉴)는 페이지에 닿기 전에 막는다. 다른 키는 그대로', () => {
    const { fake } = made()
    const [listener] = fake.contentsListeners.get('before-input-event') ?? []
    expect(listener).toBeTypeOf('function')
    const altSpace = { preventDefault: vi.fn() }
    listener(altSpace, { type: 'keyDown', alt: true, control: false, shift: false, meta: false, code: 'Space', key: ' ' })
    expect(altSpace.preventDefault).toHaveBeenCalledTimes(1)
    const space = { preventDefault: vi.fn() }
    listener(space, { type: 'keyDown', alt: false, control: false, shift: false, meta: false, code: 'Space', key: ' ' })
    expect(space.preventDefault).not.toHaveBeenCalled()
  })

  it('만드는 중 실패하면 만든 창을 없애고 던진다(숨은 창을 남기지 않는다)', () => {
    env.FakeBrowserWindow.failHandle = true
    expect(() => createPetWindow()).toThrow('handle')
    expect(env.FakeBrowserWindow.made).toHaveLength(1)
    expect(env.FakeBrowserWindow.made[0].destroyed).toBe(true)
  })

  it('창 이벤트(blur·close·closed)를 넘기고, destroy는 한 번만', () => {
    const { w, fake } = made()
    const blur = vi.fn()
    const close = vi.fn()
    const closed = vi.fn()
    w.onBlur(blur)
    w.onClose(close)
    w.onClosed(closed)
    const e = { preventDefault: vi.fn() }
    for (const fn of fake.listeners.get('blur') ?? []) fn()
    for (const fn of fake.listeners.get('close') ?? []) fn(e)
    for (const fn of fake.listeners.get('closed') ?? []) fn()
    expect(blur).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledWith(e)
    expect(closed).toHaveBeenCalledTimes(1)
    w.destroy()
    w.destroy()
    expect(fake.calls.filter((s) => s === 'destroy')).toEqual(['destroy'])
  })

  it('(Task 9 #6) 렌더러가 죽으면(render-process-gone) 까닭을 넘기고, reload는 #/pet을 다시 불러온다(닫힌 뒤에는 하지 않는다)', () => {
    const { w, fake } = made()
    const gone = vi.fn()
    w.onRenderGone(gone)
    for (const fn of fake.contentsListeners.get('render-process-gone') ?? []) fn({}, { reason: 'crashed', exitCode: 1 })
    expect(gone).toHaveBeenCalledWith('crashed')
    w.reload()
    expect(fake.calls.filter((c) => c === 'loadFile /pet')).toHaveLength(2)
    w.destroy()
    w.reload()
    expect(fake.calls.filter((c) => c === 'loadFile /pet')).toHaveLength(2)
  })

  it('(M5) isFocused: 창이 포커스를 가졌는지(조종을 시작한 뒤 확인한다). 닫힌 뒤에는 false', () => {
    const { w, fake } = made()
    expect(w.isFocused()).toBe(false)
    fake.focused = true
    expect(w.isFocused()).toBe(true)
    w.destroy()
    expect(w.isFocused()).toBe(false)
  })
})
