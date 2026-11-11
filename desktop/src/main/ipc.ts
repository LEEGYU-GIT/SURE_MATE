import { ipcMain } from 'electron'
import type { BarViewState } from '../shared/bar/bar-items'
import { parseBarContextY, parseBarDrag, parseBarHover, parseBarId, parsePointer } from '../shared/bar/bar-ipc'
import { parseFlyoutAction, parseFlyoutReady } from '../shared/flyout/flyout-action'
import type { FlyoutAction, FlyoutMessage } from '../shared/flyout/flyout-content'
import type { GlossaryEntry, WikiSaveResult } from '../shared/glossary/types'
import type { SearchContextPayload } from '../shared/natural/natural-ipc'
import { IPC, type AppStatus, type PromptPreview, type PromptRequest, type PromptRunResult } from '../shared/ipc-channels'
import { parsePromptRequest } from '../shared/prompt-request'
import type { PaletteItem } from '../shared/types'
import type { WorkspaceEdit } from '../shared/workspace/edit'
import {
  parseWorkspaceEdit,
  parseWorkspaceId,
  parseWorkspaceName,
  type WorkspaceEditResult,
  type WorkspaceSaveResult,
  type WorkspaceView
} from '../shared/workspace/workspace-ipc'
import { errorText } from './error-text'
import type { GlossaryRuntime } from './glossary/glossary-runtime'
import { log } from './log'

/** 바·펼침 창 IPC가 부르는 런타임(main/bar/bar-runtime.ts). 값은 모두 검사를 마친 것이다 */
export interface OverlayIpc {
  /** 보낸 창 확인용 webContents id */
  barContentsId: number
  flyoutContentsId: number
  barState(): BarViewState
  barAction(id: string): Promise<void>
  barHover(id: string | null): void
  barPointer(inside: boolean): void
  barContextMenu(y: number): void
  barDrag(phase: 'start' | 'move' | 'end', screenY: number): void
  flyoutMessage(): FlyoutMessage | null
  flyoutReady(seq: number, size: { width: number; height: number }): void
  flyoutPointer(inside: boolean): void
  flyoutAction(a: FlyoutAction): Promise<boolean>
}

/** 워크스페이스 IPC가 부르는 기능(설계 §11). 값은 모두 검사를 마친 것이다 */
export interface WorkspaceIpc {
  get(id: string): Promise<WorkspaceView | null>
  edit(id: string, edit: WorkspaceEdit): Promise<WorkspaceEditResult>
  /** 편집 화면의 [지금 배치로 다시 저장](결과는 화면에 보이므로 알리지 않는다) */
  recapture(id: string): Promise<WorkspaceSaveResult>
  remove(id: string): Promise<boolean>
  /** 팔레트 `@이름` 줄(키 확인·성공 시 팔레트 숨김 포함) */
  saveAs(name: string): Promise<WorkspaceSaveResult>
}

export interface IpcDeps {
  hide: () => void
  runItem: (id: string) => Promise<void>
  listItems: () => Promise<PaletteItem[]>
  previewPrompt: (req: PromptRequest) => Promise<PromptPreview>
  runPrompt: (req: PromptRequest) => Promise<PromptRunResult>
  cancelPrompt: () => void
  getStatus: () => AppStatus
  wiki: GlossaryRuntime
  saveImeLog: (label: string, json: string) => Promise<string>
  /** 바·펼침 창 런타임. 바를 시작하지 못했거나 앱을 끝내는 중이면 null */
  overlay: () => OverlayIpc | null
  /** 팔레트 창의 webContents id(팔레트 채널은 이 창이 보낸 것만 받는다). 창이 없으면 null */
  paletteContentsId: () => number | null
  /** 한글 입력 기록기 창의 webContents id(기록 저장은 이 창이 보낸 것만 받는다). 열려 있지 않으면 null */
  imeLoggerContentsId: () => number | null
  workspaces: WorkspaceIpc
  /** 말하듯 입력: 검색 문맥과 선택 기록(값 검사는 pick이 한다. pick은 던지지 않는다) */
  natural: { searchContext(): Promise<SearchContextPayload>; pick(raw: unknown): Promise<void> }
  /** 설정 창의 webContents id(워크스페이스 보기·편집·다시 저장·지우기는 이 창이 보낸 것만 받는다). 열려 있지 않으면 null */
  settingsContentsId: () => number | null
}

const BAD_REQUEST = '요청 형식이 맞지 않아요.'

type Sender = { sender: { id: number } }

/** 보낸 창이 id의 창인지(창이 없으면 아니다) */
const sentBy = (e: Sender, id: number | null): boolean => id !== null && e.sender.id === id

/** renderer가 보낸 용어 id(문자열, 200자 이하)만 받는다 */
const wikiId = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : null)

const badPreview = (): PromptPreview => ({
  text: '',
  truncated: false,
  inputLength: 0,
  warnings: [BAD_REQUEST],
  notes: [],
  highlights: [],
  masking: { mode: 'restore', items: [] },
  maskRanges: []
})

/**
 * 팔레트 채널은 팔레트 창이 보낸 것만 받는다. 바·펼침 창(M6의 펫 창도)이 같은 preload를 쓰므로,
 * 다른 창이 보낸 메시지는 처리하지 않고 invoke에는 빈 값(요청 형식 오류와 같은 값)을 준다.
 * 한글 입력 기록 저장(개발용)은 기록기 창이 보낸 것만 받는다.
 */
export function registerIpc(d: IpcDeps): void {
  const fromPalette = (e: Sender): boolean => sentBy(e, d.paletteContentsId())
  const on = (channel: string, fn: (...args: unknown[]) => void): void => {
    ipcMain.on(channel, (e, ...args: unknown[]) => {
      if (fromPalette(e)) fn(...args)
    })
  }
  const handle = <T>(channel: string, fallback: () => T, fn: (...args: unknown[]) => T | Promise<T>): void => {
    ipcMain.handle(channel, (e, ...args: unknown[]) => (fromPalette(e) ? fn(...args) : fallback()))
  }

  on(IPC.paletteHide, () => d.hide())
  handle<SearchContextPayload>(IPC.paletteSearchContext, () => ({ pack: null, learned: [], usage: [], now: 0 }), () => d.natural.searchContext())
  on(IPC.palettePick, (raw) => void d.natural.pick(raw))
  handle<void>(IPC.paletteRunItem, () => undefined, (id) => d.runItem(String(id)))
  handle<PaletteItem[]>(IPC.paletteListItems, () => [], () => d.listItems())
  handle<PromptPreview>(IPC.promptPreview, badPreview, (raw) => {
    const req = parsePromptRequest(raw)
    return req ? d.previewPrompt(req) : badPreview()
  })
  handle<PromptRunResult>(IPC.promptRun, () => ({ ok: false, message: BAD_REQUEST }), (raw) => {
    const req = parsePromptRequest(raw)
    return req ? d.runPrompt(req) : { ok: false, message: BAD_REQUEST }
  })
  on(IPC.promptCancel, () => d.cancelPrompt())
  handle<AppStatus | null>(IPC.appGetStatus, () => null, () => d.getStatus())
  handle<GlossaryEntry | null>(IPC.wikiGet, () => null, (id) => {
    const ok = wikiId(id)
    return ok ? d.wiki.get(ok) : null
  })
  handle<boolean>(IPC.wikiCopy, () => false, (id) => {
    const ok = wikiId(id)
    return ok ? d.wiki.copy(ok) : false
  })
  handle<boolean>(IPC.wikiOpenLink, () => false, (id, index) => {
    const ok = wikiId(id)
    return ok && Number.isInteger(index) && (index as number) >= 0 && (index as number) < 10 ? d.wiki.openLink(ok, index as number) : false
  })
  // 내용 검사는 런타임이 팩과 같은 규칙으로 한다. 여기서는 옵션 모양만 본다
  handle<WikiSaveResult>(IPC.wikiSave, () => ({ ok: false, errors: [BAD_REQUEST] }), (draft, options) => {
    const o = typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : {}
    const id = o.id === undefined ? undefined : wikiId(o.id)
    if (o.id !== undefined && !id) return { ok: false, errors: [BAD_REQUEST] }
    return d.wiki.save(draft, { ...(id ? { id } : {}), allowDuplicate: o.allowDuplicate === true })
  })
  ipcMain.handle(IPC.devSaveImeLog, (e, label: unknown, json: unknown) =>
    sentBy(e, d.imeLoggerContentsId()) ? d.saveImeLog(String(label), String(json)) : ''
  )
  registerOverlayIpc(d.overlay)
  registerWorkspaceIpc(d)
}

/**
 * 워크스페이스 IPC(설계 §11). 편집 화면은 설정 창의 탭이므로 보기·편집·다시 저장·지우기는 설정 창이, `@이름` 저장 줄은
 * 팔레트 창이 보낸 것만 받는다(모든 창이 같은 preload를 쓴다). 값 검사를 통과하지 못하거나 보낸 창이 다르면
 * null·false·요청 형식 오류를 주고, 처리 중 오류는 기록만 하고 같은 값을 준다.
 */
function registerWorkspaceIpc(d: IpcDeps): void {
  const badEdit: WorkspaceEditResult = { ok: false, errors: [BAD_REQUEST] }
  const badSave: WorkspaceSaveResult = { ok: false, reason: 'invalid', message: BAD_REQUEST }
  const fromSettings = (e: Sender): boolean => sentBy(e, d.settingsContentsId())

  ipcMain.handle(IPC.workspaceGet, (e, raw: unknown) => {
    const id = parseWorkspaceId(raw)
    return fromSettings(e) && id ? attempt(IPC.workspaceGet, null, () => d.workspaces.get(id)) : null
  })
  ipcMain.handle(IPC.workspaceEdit, (e, raw: unknown, rawEdit: unknown) => {
    const id = parseWorkspaceId(raw)
    const edit = parseWorkspaceEdit(rawEdit)
    return fromSettings(e) && id && edit ? attempt(IPC.workspaceEdit, badEdit, () => d.workspaces.edit(id, edit)) : badEdit
  })
  ipcMain.handle(IPC.workspaceRecapture, (e, raw: unknown) => {
    const id = parseWorkspaceId(raw)
    return fromSettings(e) && id ? attempt(IPC.workspaceRecapture, badSave, () => d.workspaces.recapture(id)) : badSave
  })
  ipcMain.handle(IPC.workspaceRemove, (e, raw: unknown) => {
    const id = parseWorkspaceId(raw)
    return fromSettings(e) && id ? attempt(IPC.workspaceRemove, false, () => d.workspaces.remove(id)) : false
  })
  ipcMain.handle(IPC.workspaceSaveAs, (e, raw: unknown) => {
    const name = parseWorkspaceName(raw)
    return sentBy(e, d.paletteContentsId()) && name ? attempt(IPC.workspaceSaveAs, badSave, () => d.workspaces.saveAs(name)) : badSave
  })
}

type Window = 'bar' | 'flyout'

/**
 * fn이 던지거나 거부해도 fallback을 돌려준다(오류는 채널 이름과 함께 기록).
 * main에서 처리하지 않은 예외는 Electron이 오류 창을 띄우므로 바·펼침 창 처리기는 던지지 않는다.
 */
function attempt<T>(channel: string, fallback: T, fn: () => T | Promise<T>): T | Promise<T> {
  const fail = (e: unknown): T => {
    log('ipc.error', { channel, error: errorText(e) })
    return fallback
  }
  try {
    const r = fn()
    return r instanceof Promise ? r.catch(fail) : r
  } catch (e) {
    return fail(e)
  }
}

/**
 * 바·펼침 창 IPC. 그 창의 webContents가 보낸 것만 받고(다른 창이 보낸 메시지는 버린다),
 * 값은 검사를 통과한 것만 넘긴다(renderer는 믿지 않는다). 처리 중 오류는 기록만 하고 던지지 않는다.
 */
function registerOverlayIpc(overlay: () => OverlayIpc | null): void {
  const from = (e: Sender, which: Window): OverlayIpc | null => {
    const o = overlay()
    if (!o) return null
    return e.sender.id === (which === 'bar' ? o.barContentsId : o.flyoutContentsId) ? o : null
  }
  const on = (channel: string, which: Window, fn: (o: OverlayIpc, ...args: unknown[]) => unknown): void => {
    ipcMain.on(channel, (e, ...args: unknown[]) => {
      const o = from(e, which)
      if (o) void attempt(channel, undefined, () => fn(o, ...args))
    })
  }
  const handle = <T>(channel: string, which: Window, fallback: T, fn: (o: OverlayIpc, ...args: unknown[]) => T | Promise<T>): void => {
    ipcMain.handle(channel, (e, ...args: unknown[]) => {
      const o = from(e, which)
      return o ? attempt(channel, fallback, () => fn(o, ...args)) : fallback
    })
  }

  on(IPC.barAction, 'bar', (o, raw) => {
    const id = parseBarId(raw)
    return id === null ? undefined : o.barAction(id)
  })
  on(IPC.barHover, 'bar', (o, raw) => {
    const h = parseBarHover(raw)
    if (h) o.barHover(h.id)
  })
  on(IPC.barPointer, 'bar', (o, raw) => {
    const inside = parsePointer(raw)
    if (inside !== null) o.barPointer(inside)
  })
  on(IPC.barContextMenu, 'bar', (o, raw) => {
    const y = parseBarContextY(raw)
    if (y !== null) o.barContextMenu(y)
  })
  on(IPC.barDrag, 'bar', (o, phase, y) => {
    const g = parseBarDrag(phase, y)
    if (g) o.barDrag(g.phase, g.screenY)
  })
  handle<BarViewState | null>(IPC.barGetState, 'bar', null, (o) => o.barState())

  handle<FlyoutMessage | null>(IPC.flyoutGetContent, 'flyout', null, (o) => o.flyoutMessage())
  on(IPC.flyoutReady, 'flyout', (o, seq, w, h) => {
    const r = parseFlyoutReady(seq, w, h)
    if (r) o.flyoutReady(r.seq, { width: r.width, height: r.height })
  })
  on(IPC.flyoutPointer, 'flyout', (o, raw) => {
    const inside = parsePointer(raw)
    if (inside !== null) o.flyoutPointer(inside)
  })
  handle<boolean>(IPC.flyoutAction, 'flyout', false, (o, raw) => {
    const a = parseFlyoutAction(raw)
    return a ? o.flyoutAction(a) : false
  })
}
