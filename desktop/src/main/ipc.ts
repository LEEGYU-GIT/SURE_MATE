import { ipcMain } from 'electron'
import type { BarViewState } from '../shared/bar/bar-items'
import { parseBarContextY, parseBarDrag, parseBarHover, parseBarId, parsePointer } from '../shared/bar/bar-ipc'
import { parseFlyoutAction, parseFlyoutReady } from '../shared/flyout/flyout-action'
import type { FlyoutAction, FlyoutMessage } from '../shared/flyout/flyout-content'
import { IPC, type AppStatus, type PromptPreview, type PromptRequest, type PromptRunResult } from '../shared/ipc-channels'
import { parsePromptRequest } from '../shared/prompt-request'
import type { PaletteItem } from '../shared/types'
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
}

const BAD_REQUEST = '요청 형식이 맞지 않아요.'

/** renderer가 보낸 용어 id(문자열, 200자 이하)만 받는다 */
const wikiId = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : null)

export function registerIpc(d: IpcDeps): void {
  ipcMain.on(IPC.paletteHide, () => d.hide())
  ipcMain.handle(IPC.paletteRunItem, (_e, id: unknown) => d.runItem(String(id)))
  ipcMain.handle(IPC.paletteListItems, () => d.listItems())
  ipcMain.handle(IPC.promptPreview, (_e, raw: unknown): Promise<PromptPreview> => {
    const req = parsePromptRequest(raw)
    return req
      ? d.previewPrompt(req)
      : Promise.resolve({
          text: '',
          truncated: false,
          inputLength: 0,
          warnings: [BAD_REQUEST],
          notes: [],
          highlights: [],
          masking: { mode: 'restore', items: [] },
          maskRanges: []
        })
  })
  ipcMain.handle(IPC.promptRun, (_e, raw: unknown): Promise<PromptRunResult> => {
    const req = parsePromptRequest(raw)
    return req ? d.runPrompt(req) : Promise.resolve({ ok: false, message: BAD_REQUEST })
  })
  ipcMain.on(IPC.promptCancel, () => d.cancelPrompt())
  ipcMain.handle(IPC.appGetStatus, () => d.getStatus())
  ipcMain.handle(IPC.wikiGet, (_e, id: unknown) => {
    const ok = wikiId(id)
    return ok ? d.wiki.get(ok) : null
  })
  ipcMain.handle(IPC.wikiCopy, (_e, id: unknown) => {
    const ok = wikiId(id)
    return ok ? d.wiki.copy(ok) : false
  })
  ipcMain.handle(IPC.wikiOpenLink, (_e, id: unknown, index: unknown) => {
    const ok = wikiId(id)
    return ok && Number.isInteger(index) && (index as number) >= 0 && (index as number) < 10 ? d.wiki.openLink(ok, index as number) : false
  })
  // 내용 검사는 런타임이 팩과 같은 규칙으로 한다. 여기서는 옵션 모양만 본다
  ipcMain.handle(IPC.wikiSave, (_e, draft: unknown, options: unknown) => {
    const o = typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : {}
    const id = o.id === undefined ? undefined : wikiId(o.id)
    if (o.id !== undefined && !id) return { ok: false, errors: [BAD_REQUEST] }
    return d.wiki.save(draft, { ...(id ? { id } : {}), allowDuplicate: o.allowDuplicate === true })
  })
  ipcMain.handle(IPC.devSaveImeLog, (_e, label: unknown, json: unknown) => d.saveImeLog(String(label), String(json)))
  registerOverlayIpc(d.overlay)
}

type Sender = { sender: { id: number } }
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
