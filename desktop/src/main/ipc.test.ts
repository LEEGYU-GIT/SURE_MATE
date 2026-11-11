import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { BarViewState } from '../shared/bar/bar-items'
import type { FlyoutMessage } from '../shared/flyout/flyout-content'
import { IPC } from '../shared/ipc-channels'
import type { PetView } from '../shared/pet/pet-view'

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

import { registerIpc, type IpcDeps, type OverlayIpc, type PetIpc, type WorkspaceIpc } from './ipc'

const BAR = { sender: { id: 11 } }
const FLYOUT = { sender: { id: 12 } }
const PALETTE = { sender: { id: 1 } }
const IME_LOGGER = { sender: { id: 21 } }
/** 말랑 메이트 창(M6) */
const PET = { sender: { id: 31 } }
/** 설정 창(워크스페이스 보기·편집). 펫 창과 다른 id */
const SETTINGS = { sender: { id: 41 } }
/** 다른 창도 같은 preload를 쓴다 */
const OTHER = { sender: { id: 99 } }

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

const status = { paletteHotkey: 'Ctrl+Alt+Space', maskingMode: 'restore', aiTargetName: 'Claude' }

/** 팔레트·기록기 창 처리기(팔레트 창 id 1, 기록기 창 id 21) */
function paletteFake() {
  return {
    hide: vi.fn(),
    runItem: vi.fn(async () => {}),
    listItems: vi.fn(async () => [{ id: 'prompt:meeting-notes' }]),
    previewPrompt: vi.fn(async () => ({ text: '미리 보기' })),
    runPrompt: vi.fn(async () => ({ ok: true, message: '복사했어요' })),
    cancelPrompt: vi.fn(),
    getStatus: vi.fn(() => status),
    wiki: {
      get: vi.fn(async () => ({ id: 'mcdc' })),
      copy: vi.fn(async () => true),
      openLink: vi.fn(async () => true),
      save: vi.fn(async () => ({ ok: true }))
    },
    saveImeLog: vi.fn(async () => 'ime.json')
  }
}

const VIEW = { size: 56, controlling: false } as unknown as PetView

/** 펫 런타임 가운데 펫 IPC가 부르는 부분(펫 창 id 31) */
type PetFake = { petContentsId: number } & { [K in Exclude<keyof PetIpc, 'petContentsId'>]: Mock<PetIpc[K]> }

function petFake(): PetFake {
  return {
    petContentsId: 31,
    petView: vi.fn<PetIpc['petView']>(() => VIEW),
    petPress: vi.fn<PetIpc['petPress']>(),
    petContextMenu: vi.fn<PetIpc['petContextMenu']>(),
    petMenu: vi.fn<PetIpc['petMenu']>(),
    petKey: vi.fn<PetIpc['petKey']>(),
    petBubbleClick: vi.fn<PetIpc['petBubbleClick']>(),
    petBubbleRect: vi.fn<PetIpc['petBubbleRect']>()
  }
}

const wsView = { workspace: { id: 'ws-qa', name: 'QA 모드', aliases: [], hotkey: null, layouts: {}, updatedAt: '2026-11-11T00:00:00.000Z' }, sameConfig: true }
const wsSaved = { ok: true as const, id: 'ws-qa', name: 'QA 모드', windows: 3, skipped: { minimized: 0, excluded: 0, offscreen: 0, overLimit: 0 } }

/** 워크스페이스 처리기(보기·편집·다시 저장·지우기는 설정 창 id 41, 다른 이름으로 저장은 팔레트 창 id 1) */
function workspacesFake() {
  return {
    get: vi.fn(async () => wsView),
    edit: vi.fn(async () => ({ ok: true as const, workspace: wsView.workspace })),
    recapture: vi.fn(async () => wsSaved),
    remove: vi.fn(async () => true),
    saveAs: vi.fn(async () => wsSaved)
  } satisfies WorkspaceIpc
}

let overlay: ReturnType<typeof overlayFake> | null
let pet: PetFake | null
let palette: ReturnType<typeof paletteFake>
let workspaces: ReturnType<typeof workspacesFake>
let natural: { searchContext: ReturnType<typeof vi.fn>; pick: ReturnType<typeof vi.fn> }
let paletteId: number | null
let imeLoggerId: number | null
let settingsId: number | null

beforeEach(() => {
  reg.on.clear()
  reg.handle.clear()
  reg.logs.length = 0
  overlay = overlayFake()
  pet = petFake()
  palette = paletteFake()
  workspaces = workspacesFake()
  natural = { searchContext: vi.fn(async () => ({ pack: null, learned: [['k', 'a']], usage: [], now: 5 })), pick: vi.fn(async () => {}) }
  paletteId = 1
  imeLoggerId = 21
  settingsId = 41
  const deps = {
    ...palette,
    workspaces,
    natural,
    overlay: () => overlay,
    pet: () => pet,
    paletteContentsId: () => paletteId,
    imeLoggerContentsId: () => imeLoggerId,
    settingsContentsId: () => settingsId
  } as unknown as IpcDeps
  registerIpc(deps)
})

const send = (channel: string, e: { sender: { id: number } }, ...args: unknown[]): unknown => reg.on.get(channel)!(e, ...args)
const invoke = (channel: string, e: { sender: { id: number } }, ...args: unknown[]): unknown => reg.handle.get(channel)!(e, ...args)

const BAD = '요청 형식이 맞지 않아요.'
const REQ = { source: 'selection', target: 'claude' }

/** 팔레트 채널을 모두 한 번씩 보내고 invoke 결과를 모은다 */
async function sendAllPalette(e: { sender: { id: number } }): Promise<unknown[]> {
  send(IPC.paletteHide, e)
  send(IPC.promptCancel, e)
  return [
    await invoke(IPC.paletteRunItem, e, 'prompt:meeting-notes'),
    await invoke(IPC.paletteListItems, e),
    await invoke(IPC.promptPreview, e, REQ),
    await invoke(IPC.promptRun, e, REQ),
    await invoke(IPC.appGetStatus, e),
    await invoke(IPC.wikiGet, e, 'mcdc'),
    await invoke(IPC.wikiCopy, e, 'mcdc'),
    await invoke(IPC.wikiOpenLink, e, 'mcdc', 0),
    await invoke(IPC.wikiSave, e, { term: '가상 용어' }, { allowDuplicate: false })
  ]
}

const paletteHandlers = () => [
  palette.hide,
  palette.cancelPrompt,
  palette.runItem,
  palette.listItems,
  palette.previewPrompt,
  palette.runPrompt,
  palette.getStatus,
  palette.wiki.get,
  palette.wiki.copy,
  palette.wiki.openLink,
  palette.wiki.save
]

describe('팔레트 IPC는 팔레트 창이 보낸 것만 받는다(바·펼침 창, M6의 펫 창이 같은 preload를 쓴다)', () => {
  it('바·펼침 창·펫 창·설정 창·기록기 창·다른 창이 보낸 팔레트 메시지는 처리하지 않고 빈 값을 준다', async () => {
    for (const e of [BAR, FLYOUT, PET, SETTINGS, IME_LOGGER, OTHER]) {
      const results = await sendAllPalette(e)
      expect(results[0]).toBeUndefined()
      expect(results[1]).toEqual([])
      expect(results[2]).toMatchObject({ text: '', warnings: [BAD] })
      expect(results[3]).toEqual({ ok: false, message: BAD })
      expect(results[4]).toBeNull()
      expect(results.slice(5)).toEqual([null, false, false, { ok: false, errors: [BAD] }])
    }
    for (const fn of paletteHandlers()) expect(fn).not.toHaveBeenCalled()
  })

  it('팔레트 창이 보낸 것은 그대로 처리한다', async () => {
    const results = await sendAllPalette(PALETTE)
    for (const fn of paletteHandlers()) expect(fn).toHaveBeenCalledTimes(1)
    expect(palette.runItem).toHaveBeenCalledWith('prompt:meeting-notes')
    expect(palette.runPrompt).toHaveBeenCalledWith(REQ)
    expect(palette.wiki.openLink).toHaveBeenCalledWith('mcdc', 0)
    expect(results[3]).toEqual({ ok: true, message: '복사했어요' })
    expect(results[4]).toBe(status)
  })

  it('팔레트 창이 없으면(null) 어떤 창이 보내도 처리하지 않는다', async () => {
    paletteId = null
    await sendAllPalette(PALETTE)
    for (const fn of paletteHandlers()) expect(fn).not.toHaveBeenCalled()
  })
})

describe('한글 입력 기록 저장은 기록기 창이 보낸 것만 받는다', () => {
  it('기록기 창이 보내면 저장하고 경로를 준다', async () => {
    expect(await invoke(IPC.devSaveImeLog, IME_LOGGER, '새 IME', '{}')).toBe('ime.json')
    expect(palette.saveImeLog).toHaveBeenCalledWith('새 IME', '{}')
  })

  it('팔레트·바·펼침 창이 보내거나 기록기 창이 열려 있지 않으면 저장하지 않는다', async () => {
    for (const e of [PALETTE, BAR, FLYOUT, OTHER]) expect(await invoke(IPC.devSaveImeLog, e, 'x', '{}')).toBe('')
    imeLoggerId = null
    expect(await invoke(IPC.devSaveImeLog, IME_LOGGER, 'x', '{}')).toBe('')
    expect(palette.saveImeLog).not.toHaveBeenCalled()
  })
})

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

const RECT = { x: 60.5, y: 8, width: 200, height: 54 }

/** 펫 채널을 모두 맞는 값으로 한 번씩 보내고 get-view 결과를 준다 */
async function sendAllPet(e: { sender: { id: number } }): Promise<unknown> {
  send(IPC.petPress, e, true)
  send(IPC.petContextMenu, e)
  send(IPC.petMenu, e, 'hide')
  send(IPC.petKey, e, 'left', true)
  send(IPC.petBubbleClick, e)
  send(IPC.petBubbleRect, e, RECT)
  return invoke(IPC.petGetView, e)
}

const petHandlers = (p: PetFake): unknown[] => [p.petPress, p.petContextMenu, p.petMenu, p.petKey, p.petBubbleClick, p.petBubbleRect, p.petView]

describe('펫 IPC는 펫 창이 보낸 것만 받는다(모든 창이 같은 preload를 쓴다)', () => {
  it('팔레트·바·펼침 창·설정 창·다른 창이 보낸 펫 메시지는 처리하지 않고, 화면 상태는 null', async () => {
    for (const e of [PALETTE, BAR, FLYOUT, SETTINGS, IME_LOGGER, OTHER]) expect(await sendAllPet(e)).toBeNull()
    for (const fn of petHandlers(pet!)) expect(fn).not.toHaveBeenCalled()
  })

  it('펫 창이 보낸 맞는 값은 검사한 값으로 넘긴다', async () => {
    const p = pet!
    expect(await sendAllPet(PET)).toBe(VIEW)
    send(IPC.petPress, PET, false)
    send(IPC.petKey, PET, 'end', false)
    send(IPC.petBubbleRect, PET, null)
    send(IPC.petBubbleRect, PET, { ...RECT, extra: 'x' })
    expect(p.petPress.mock.calls).toEqual([[true], [false]])
    expect(p.petContextMenu).toHaveBeenCalledTimes(1)
    expect(p.petMenu).toHaveBeenCalledWith('hide')
    expect(p.petKey.mock.calls).toEqual([
      ['left', true],
      ['end', false]
    ])
    expect(p.petBubbleClick).toHaveBeenCalledTimes(1)
    // 말풍선이 사라졌으면 null을 넘기고, 사각형은 네 값만 옮긴다
    expect(p.petBubbleRect.mock.calls).toEqual([[RECT], [null], [RECT]])
  })

  it('틀린 값은 버린다(키는 키 이름과 누름·뗌을 모두 검사)', () => {
    const p = pet!
    for (const bad of ['true', 1, undefined, null]) send(IPC.petPress, PET, bad)
    for (const bad of ['eval', '', 'constructor', 3, { action: 'hide' }]) send(IPC.petMenu, PET, bad)
    send(IPC.petKey, PET, 'ArrowLeft', true)
    send(IPC.petKey, PET, 'left', 'yes')
    send(IPC.petKey, PET, 'left')
    send(IPC.petKey, PET, undefined, true)
    for (const bad of [{ ...RECT, x: Number.NaN }, { ...RECT, width: 0 }, { ...RECT, width: 5000 }, undefined, 'rect', [1, 2, 3, 4]]) send(IPC.petBubbleRect, PET, bad)
    for (const fn of [p.petPress, p.petMenu, p.petKey, p.petBubbleRect]) expect(fn).not.toHaveBeenCalled()
  })

  it('펫을 시작하지 못했거나 앱을 끝낸 뒤(null)에는 아무것도 하지 않고 화면 상태는 null', async () => {
    pet = null
    expect(await sendAllPet(PET)).toBeNull()
  })

  it('처리 중 오류가 나도 던지지 않고 기록만 하며, 화면 상태는 null', async () => {
    const p = pet!
    p.petPress.mockImplementation(() => {
      throw new Error('boom')
    })
    p.petView.mockImplementation(() => {
      throw new Error('view')
    })
    expect(() => send(IPC.petPress, PET, true)).not.toThrow()
    expect(await invoke(IPC.petGetView, PET)).toBeNull()
    expect(reg.logs).toEqual([
      { event: 'ipc.error', data: { channel: IPC.petPress, error: 'boom' } },
      { event: 'ipc.error', data: { channel: IPC.petGetView, error: 'view' } }
    ])
  })

  it('(Task 9 #4) 펫 채널 오류는 채널과 오류 글마다 한 번만 기록한다(잦은 누름·키·화면 요청이 로그를 채우지 않게)', async () => {
    const p = pet!
    let message = 'boom'
    p.petPress.mockImplementation(() => {
      throw new Error(message)
    })
    p.petKey.mockImplementation(() => {
      throw new Error('boom')
    })
    p.petView.mockImplementation(() => {
      throw new Error('view')
    })
    for (let i = 0; i < 5; i++) send(IPC.petPress, PET, true)
    message = 'other'
    send(IPC.petPress, PET, false)
    send(IPC.petPress, PET, false)
    send(IPC.petKey, PET, 'left', true)
    send(IPC.petKey, PET, 'left', false)
    expect(await invoke(IPC.petGetView, PET)).toBeNull()
    expect(await invoke(IPC.petGetView, PET)).toBeNull()
    expect(reg.logs).toEqual([
      { event: 'ipc.error', data: { channel: IPC.petPress, error: 'boom' } },
      { event: 'ipc.error', data: { channel: IPC.petPress, error: 'other' } },
      { event: 'ipc.error', data: { channel: IPC.petKey, error: 'boom' } },
      { event: 'ipc.error', data: { channel: IPC.petGetView, error: 'view' } }
    ])
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

describe('워크스페이스 IPC: 보기·편집·다시 저장·지우기는 설정 창, 다른 이름으로 저장은 팔레트 창이 보낸 것만', () => {
  const EDIT = { name: '보고서 모드', aliases: ['보고'], rules: [{ id: 'r1', enabled: false, titleIncludes: null, monitor: 'm1' }] }
  const BAD_EDIT = { ok: false, errors: [BAD] }
  const BAD_SAVE = { ok: false, reason: 'invalid', message: BAD }

  /** 워크스페이스 채널을 모두 한 번씩 invoke한 결과 */
  const invokeAll = async (settings: { sender: { id: number } }, paletteWin: { sender: { id: number } }): Promise<unknown[]> => [
    await invoke(IPC.workspaceGet, settings, 'ws-qa'),
    await invoke(IPC.workspaceEdit, settings, 'ws-qa', EDIT),
    await invoke(IPC.workspaceRecapture, settings, 'ws-qa'),
    await invoke(IPC.workspaceRemove, settings, 'ws-qa'),
    await invoke(IPC.workspaceSaveAs, paletteWin, ' QA 모드 ')
  ]
  const handlers = () => [workspaces.get, workspaces.edit, workspaces.recapture, workspaces.remove, workspaces.saveAs]

  it('그 창이 보낸 것은 값을 검사해 넘긴다(이름은 앞뒤 공백을 뺀다)', async () => {
    expect(await invokeAll(SETTINGS, PALETTE)).toEqual([wsView, { ok: true, workspace: wsView.workspace }, wsSaved, true, wsSaved])
    expect(workspaces.get).toHaveBeenCalledWith('ws-qa')
    expect(workspaces.edit).toHaveBeenCalledWith('ws-qa', EDIT)
    expect(workspaces.recapture).toHaveBeenCalledWith('ws-qa')
    expect(workspaces.remove).toHaveBeenCalledWith('ws-qa')
    expect(workspaces.saveAs).toHaveBeenCalledWith('QA 모드')
  })

  it('다른 창이 보냈거나 그 창이 없으면 처리하지 않고 빈 값을 준다', async () => {
    const empty = [null, BAD_EDIT, BAD_SAVE, false, BAD_SAVE]
    // 편집 채널을 팔레트·바·펼침 창·펫 창·다른 창이, 저장 채널을 설정 창·바·펼침 창·펫 창·다른 창이 보냄
    for (const [settings, paletteWin] of [
      [PALETTE, SETTINGS],
      [BAR, BAR],
      [FLYOUT, FLYOUT],
      [PET, PET],
      [OTHER, OTHER]
    ]) {
      expect(await invokeAll(settings, paletteWin)).toEqual(empty)
    }
    settingsId = null
    paletteId = null
    expect(await invokeAll(SETTINGS, PALETTE)).toEqual(empty)
    for (const fn of handlers()) expect(fn).not.toHaveBeenCalled()
  })

  it('틀린 값은 버린다', async () => {
    for (const bad of ['a/b', 'x'.repeat(65), '', 7, null]) {
      expect(await invoke(IPC.workspaceGet, SETTINGS, bad)).toBeNull()
      expect(await invoke(IPC.workspaceEdit, SETTINGS, bad, EDIT)).toEqual(BAD_EDIT)
      expect(await invoke(IPC.workspaceRecapture, SETTINGS, bad)).toEqual(BAD_SAVE)
      expect(await invoke(IPC.workspaceRemove, SETTINGS, bad)).toBe(false)
    }
    for (const bad of [{ ...EDIT, name: 3 }, { ...EDIT, rules: [{ ...EDIT.rules[0], enabled: 'yes' }] }, 'edit', null]) {
      expect(await invoke(IPC.workspaceEdit, SETTINGS, 'ws-qa', bad)).toEqual(BAD_EDIT)
    }
    for (const bad of ['   ', 'x'.repeat(41), 5, null]) expect(await invoke(IPC.workspaceSaveAs, PALETTE, bad)).toEqual(BAD_SAVE)
    for (const fn of handlers()) expect(fn).not.toHaveBeenCalled()
  })

  it('처리 중 오류가 나도 던지지 않고 빈 값을 준다(채널 이름만 기록)', async () => {
    for (const fn of handlers()) fn.mockRejectedValueOnce(new Error('boom'))
    expect(await invokeAll(SETTINGS, PALETTE)).toEqual([null, BAD_EDIT, BAD_SAVE, false, BAD_SAVE])
    expect(reg.logs.map((l) => l.data.channel).sort()).toEqual(
      [IPC.workspaceGet, IPC.workspaceEdit, IPC.workspaceRecapture, IPC.workspaceRemove, IPC.workspaceSaveAs].sort()
    )
  })
})

describe('말하듯 입력 채널(팔레트 창만)', () => {
  const pick = { id: 'cmd.unmask', remember: true, query: '가명 되돌려줘' }

  it('팔레트 창이 보내면 검색 문맥을 주고 선택 기록을 넘긴다', async () => {
    expect(await invoke(IPC.paletteSearchContext, PALETTE)).toEqual({ pack: null, learned: [['k', 'a']], usage: [], now: 5 })
    send(IPC.palettePick, PALETTE, pick)
    expect(natural.pick).toHaveBeenCalledWith(pick)
  })

  it('다른 창이 보내면 빈 문맥을 주고 선택 기록은 무시한다', async () => {
    expect(await invoke(IPC.paletteSearchContext, SETTINGS)).toEqual({ pack: null, learned: [], usage: [], now: 0 })
    send(IPC.palettePick, SETTINGS, pick)
    expect(natural.searchContext).not.toHaveBeenCalled()
    expect(natural.pick).not.toHaveBeenCalled()
  })
})
