import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BarViewState } from '../shared/bar/bar-items'
import type { FlyoutMessage } from '../shared/flyout/flyout-content'
import { IPC } from '../shared/ipc-channels'

// ipcMain을 흉내 내 등록된 처리기를 직접 부른다(Electron 밖에서는 ipcMain이 없다)
type Listener = (e: { sender: { id: number } }, ...args: unknown[]) => unknown
const reg = vi.hoisted(() => ({ on: new Map<string, Listener>(), handle: new Map<string, Listener>(), logs: [] as { event: string; data: Record<string, unknown> }[] }))
vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, fn: Listener) => void reg.on.set(channel, fn),
    handle: (channel: string, fn: Listener) => void reg.handle.set(channel, fn)
  }
}))
vi.mock('./log', () => ({ log: (event: string, data: Record<string, unknown> = {}) => void reg.logs.push({ event, data }) }))

import { registerIpc, type IpcDeps, type OverlayIpc } from './ipc'

const BAR = { sender: { id: 11 } }
const FLYOUT = { sender: { id: 12 } }
const PALETTE = { sender: { id: 1 } }

const state: BarViewState = { shape: 'edge', edge: 'right', items: [], opacity: 1, collapsed: false, busyItem: null }
const message: FlyoutMessage = { seq: 3, content: { kind: 'label', text: '설정' }, pad: { top: 16, right: 0, bottom: 32, left: 24 }, edge: 'right' }

function overlayFake() {
  return {
    barContentsId: 11,
    flyoutContentsId: 12,
    barState: vi.fn(() => state),
    barAction: vi.fn(async () => {}),
    barHover: vi.fn(),
    barPointer: vi.fn(),
    barContextMenu: vi.fn(),
    barDrag: vi.fn(),
    flyoutMessage: vi.fn((): FlyoutMessage | null => message),
    flyoutReady: vi.fn(),
    flyoutPointer: vi.fn(),
    flyoutAction: vi.fn(async () => true)
  } satisfies OverlayIpc
}

let overlay: ReturnType<typeof overlayFake> | null

beforeEach(() => {
  reg.on.clear()
  reg.handle.clear()
  reg.logs.length = 0
  overlay = overlayFake()
  const deps = { overlay: () => overlay } as unknown as IpcDeps
  registerIpc(deps)
})

const send = (channel: string, e: { sender: { id: number } }, ...args: unknown[]): unknown => reg.on.get(channel)!(e, ...args)
const invoke = (channel: string, e: { sender: { id: number } }, ...args: unknown[]): unknown => reg.handle.get(channel)!(e, ...args)

describe('바·펼침 창 IPC는 그 창이 보낸 것만 받는다', () => {
  it('팔레트나 펼침 창이 보낸 바 메시지는 무시한다', () => {
    for (const e of [PALETTE, FLYOUT]) {
      send(IPC.barAction, e, 'logo')
      send(IPC.barHover, e, 'logo')
      send(IPC.barPointer, e, true)
      send(IPC.barContextMenu, e, 10)
      send(IPC.barDrag, e, 'start', 300)
    }
    const o = overlay!
    for (const fn of [o.barAction, o.barHover, o.barPointer, o.barContextMenu, o.barDrag]) expect(fn).not.toHaveBeenCalled()
  })

  it('바나 팔레트가 보낸 펼침 창 메시지는 무시하고, 동작은 false', async () => {
    for (const e of [PALETTE, BAR]) {
      send(IPC.flyoutReady, e, 3, 120, 24)
      send(IPC.flyoutPointer, e, true)
      expect(await invoke(IPC.flyoutAction, e, { type: 'close' })).toBe(false)
      expect(await invoke(IPC.flyoutGetContent, e)).toBeNull()
    }
    const o = overlay!
    for (const fn of [o.flyoutReady, o.flyoutPointer, o.flyoutAction, o.flyoutMessage]) expect(fn).not.toHaveBeenCalled()
  })

  it('지금 바 상태·펼침 창 내용은 그 창에만 준다', async () => {
    expect(await invoke(IPC.barGetState, BAR)).toBe(state)
    expect(await invoke(IPC.barGetState, PALETTE)).toBeNull()
    expect(await invoke(IPC.flyoutGetContent, FLYOUT)).toBe(message)
  })

  it('바를 시작하지 못했으면(overlay null) 아무것도 하지 않고 빈 값을 준다', async () => {
    overlay = null
    expect(() => send(IPC.barAction, BAR, 'logo')).not.toThrow()
    expect(await invoke(IPC.barGetState, BAR)).toBeNull()
    expect(await invoke(IPC.flyoutGetContent, FLYOUT)).toBeNull()
    expect(await invoke(IPC.flyoutAction, FLYOUT, { type: 'close' })).toBe(false)
  })
})

describe('값을 검사한 뒤에만 넘긴다(renderer는 믿지 않는다)', () => {
  it('맞는 값은 그대로 넘긴다', async () => {
    const o = overlay!
    send(IPC.barAction, BAR, 'prompt:meeting-notes')
    send(IPC.barHover, BAR, 'masking')
    send(IPC.barHover, BAR, null)
    send(IPC.barPointer, BAR, false)
    send(IPC.barContextMenu, BAR, 212.5)
    send(IPC.barDrag, BAR, 'move', -40)
    send(IPC.flyoutReady, FLYOUT, 3, 183.5, 52)
    send(IPC.flyoutPointer, FLYOUT, true)
    expect(await invoke(IPC.flyoutAction, FLYOUT, { type: 'set-masking', mode: 'off', extra: 'x' })).toBe(true)
    expect(o.barAction).toHaveBeenCalledWith('prompt:meeting-notes')
    expect(o.barHover.mock.calls).toEqual([['masking'], [null]])
    expect(o.barPointer).toHaveBeenCalledWith(false)
    expect(o.barContextMenu).toHaveBeenCalledWith(212.5)
    expect(o.barDrag).toHaveBeenCalledWith('move', -40)
    expect(o.flyoutReady).toHaveBeenCalledWith(3, { width: 183.5, height: 52 })
    expect(o.flyoutPointer).toHaveBeenCalledWith(true)
    // 동작에 쓰지 않는 값은 버리고 넘긴다
    expect(o.flyoutAction).toHaveBeenCalledWith({ type: 'set-masking', mode: 'off' })
  })

  it('틀린 값은 버린다', async () => {
    const o = overlay!
    for (const bad of [3, '', 'x'.repeat(201), null, { id: 'logo' }]) send(IPC.barAction, BAR, bad)
    for (const bad of [3, '', undefined]) send(IPC.barHover, BAR, bad)
    for (const bad of ['true', 1, undefined]) send(IPC.barPointer, BAR, bad)
    for (const bad of [-1, Number.NaN, '5', Number.POSITIVE_INFINITY]) send(IPC.barContextMenu, BAR, bad)
    send(IPC.barDrag, BAR, 'jump', 1)
    send(IPC.barDrag, BAR, 'move', Number.NaN)
    send(IPC.flyoutReady, FLYOUT, 1.5, 10, 10)
    send(IPC.flyoutReady, FLYOUT, 1, 0, 10)
    send(IPC.flyoutPointer, FLYOUT, 'yes')
    expect(await invoke(IPC.flyoutAction, FLYOUT, { type: 'eval' })).toBe(false)
    expect(await invoke(IPC.flyoutAction, FLYOUT, 'close')).toBe(false)
    for (const fn of [o.barAction, o.barHover, o.barPointer, o.barContextMenu, o.barDrag, o.flyoutReady, o.flyoutPointer, o.flyoutAction]) {
      expect(fn).not.toHaveBeenCalled()
    }
  })
})

describe('처리 중 오류가 나도 던지지 않는다(main의 처리하지 않은 예외는 오류 창을 띄운다)', () => {
  it('동기 오류·거부 모두 기록만 하고, invoke는 빈 값을 준다', async () => {
    const o = overlay!
    o.barHover.mockImplementation(() => {
      throw new Error('boom')
    })
    o.barAction.mockRejectedValueOnce(new Error('late'))
    o.flyoutAction.mockRejectedValueOnce(new Error('nope'))
    o.barState.mockImplementation(() => {
      throw new Error('layout')
    })
    expect(() => send(IPC.barHover, BAR, 'logo')).not.toThrow()
    send(IPC.barAction, BAR, 'logo')
    expect(await invoke(IPC.flyoutAction, FLYOUT, { type: 'close' })).toBe(false)
    expect(await invoke(IPC.barGetState, BAR)).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reg.logs.map((l) => l.data.channel).sort()).toEqual([IPC.barAction, IPC.barGetState, IPC.barHover, IPC.flyoutAction].sort())
    expect(reg.logs.every((l) => l.event === 'ipc.error')).toBe(true)
  })
})
