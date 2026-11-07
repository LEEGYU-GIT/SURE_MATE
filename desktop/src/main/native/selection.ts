import { setTimeout as sleep } from 'node:timers/promises'
import { clipboard, ClipboardItem } from 'electron'
import type { CaptureResult } from '../../shared/types'
import { captureDecision, pasteDecision, shouldRestoreClipboard } from './clipboard-logic'
import { sendChord, waitModifiersReleased } from './input'
import * as w from './win32'
import { getForegroundWindow, getWindowInfo, setForeground } from './windows'

/** 백업·복원할 수 있는 형식. 엑셀·HWP 고유 서식 같은 나머지 형식은 되돌릴 수 없다. */
const SNAPSHOT_TYPES = ['text/plain', 'text/html', 'text/rtf', 'image/png']
/** Windows 클립보드 기록(Win+V)과 클라우드 동기화에서 빼 달라는 표시. 내용은 아무 값이나 된다. */
const EXCLUDE_FROM_HISTORY = 'electron application/osclipboard;format="ExcludeClipboardContentFromMonitorProcessing"'

type Snapshot = { wasEmpty: boolean; data: Record<string, Blob> }

async function snapshotClipboard(): Promise<Snapshot> {
  try {
    const [first] = await clipboard.read()
    if (!first || first.types.length === 0) return { wasEmpty: true, data: {} }
    const data: Record<string, Blob> = {}
    for (const type of SNAPSHOT_TYPES) {
      if (first.types.includes(type)) data[type] = (await first.getType(type)) as Blob
    }
    return { wasEmpty: false, data }
  } catch {
    return { wasEmpty: false, data: {} }
  }
}

async function restoreClipboard(snapshot: Snapshot): Promise<boolean> {
  if (snapshot.wasEmpty) {
    clipboard.clear()
    return true
  }
  if (Object.keys(snapshot.data).length === 0) return false
  await clipboard.write([new ClipboardItem(snapshot.data)])
  return true
}

async function waitSequenceChange(from: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (w.GetClipboardSequenceNumber() !== from) return true
    await sleep(10)
  }
  return false
}

/**
 * 지금 활성 창에서 선택한 글을 가져온다(설계 문서 §10).
 * 보조키가 떼어지길 기다린 뒤 Ctrl+Insert, 안 되면 Ctrl+C를 보내고 클립보드 순번이 바뀌는지 본다.
 * 그사이 사용자가 따로 복사하지 않았으면 원래 클립보드를 되돌린다.
 */
export async function captureSelection(opts: { timeoutMs?: number } = {}): Promise<CaptureResult> {
  const timeoutMs = opts.timeoutMs ?? 500
  const started = Date.now()
  const elapsed = (): number => Date.now() - started

  const foreground = getForegroundWindow()
  const decision = captureDecision(foreground ? getWindowInfo(foreground) : null)
  if (decision.action === 'skip') {
    return { text: null, method: 'none', elapsedMs: elapsed(), restored: false, skipped: decision.reason }
  }

  await waitModifiersReleased(500)
  const backup = await snapshotClipboard()
  const before = w.GetClipboardSequenceNumber()

  let method: CaptureResult['method'] = 'ctrl-insert'
  sendChord(['CONTROL', 'INSERT'])
  let changed = await waitSequenceChange(before, Math.min(250, timeoutMs))
  if (!changed) {
    method = 'ctrl-c'
    sendChord(['CONTROL', 'C'])
    changed = await waitSequenceChange(before, Math.max(0, timeoutMs - elapsed()))
  }
  if (!changed) return { text: null, method: 'none', elapsedMs: elapsed(), restored: false }

  await sleep(40) // 여러 형식을 차례로 쓰는 앱이 끝낼 시간
  const afterCopy = w.GetClipboardSequenceNumber()
  const text = await clipboard.readText()
  const restored = shouldRestoreClipboard(afterCopy, w.GetClipboardSequenceNumber()) ? await restoreClipboard(backup) : false
  return { text: text || null, method, elapsedMs: elapsed(), restored }
}

/**
 * 글을 클립보드에 넣고 대상 창에 붙여넣는다(설계 문서 §10). 붙여넣기 뒤 클립보드는 되돌리지 않는다.
 * 대상이 사라졌거나 관리자 권한 창이면 복사만 한다.
 */
export async function pasteText(hwnd: string, text: string): Promise<{ ok: boolean; reason?: string }> {
  const info = getWindowInfo(hwnd)
  const decision = pasteDecision({ exists: Boolean(info), elevated: info?.elevated ?? null })
  await clipboard.writeText(text)
  if (decision.action === 'copy-only') return { ok: false, reason: decision.reason }

  setForeground(hwnd)
  await sleep(50)
  if (getForegroundWindow() !== hwnd) return { ok: false, reason: 'not-foreground' }
  await waitModifiersReleased(500)
  sendChord(['CONTROL', 'V'])
  return { ok: true }
}

/** Win+V 기록·클라우드 동기화에서 빠지도록 표시를 붙여 글을 쓴다(되돌린 원문용). */
export async function writeExcludedFromHistory(text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await clipboard.write([new ClipboardItem({ 'text/plain': text, [EXCLUDE_FROM_HISTORY]: new Blob([new Uint8Array([1])]) })])
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
