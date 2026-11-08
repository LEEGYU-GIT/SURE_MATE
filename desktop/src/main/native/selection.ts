import { setTimeout as delay } from 'node:timers/promises'
import { clipboard, ClipboardItem } from 'electron'
import type { CaptureResult } from '../../shared/types'
import { runCapture, runPaste, type ClipboardSnapshot } from './capture-flow'
import { sendChord, waitModifiersReleased } from './input'
import * as w from './win32'
import { getForegroundWindow, getWindowInfo, setForeground } from './windows'

/** 백업·복원할 수 있는 형식. 엑셀·HWP 고유 서식 같은 나머지 형식은 되돌릴 수 없다. */
const SNAPSHOT_TYPES = ['text/plain', 'text/html', 'text/rtf', 'image/png']
/** Windows 클립보드 기록(Win+V)과 클라우드 동기화에서 빼 달라는 표시. 내용은 아무 값이나 된다. */
const EXCLUDE_FROM_HISTORY = 'electron application/osclipboard;format="ExcludeClipboardContentFromMonitorProcessing"'

const sleep = async (ms: number): Promise<void> => {
  await delay(ms)
}

async function snapshotClipboard(): Promise<ClipboardSnapshot> {
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

async function restoreClipboard(snapshot: ClipboardSnapshot): Promise<boolean> {
  if (snapshot.wasEmpty) {
    clipboard.clear()
    return true
  }
  if (Object.keys(snapshot.data).length === 0) return false
  await clipboard.write([new ClipboardItem(snapshot.data)])
  return true
}

/** 지금 활성 창에서 선택한 글을 가져온다(설계 문서 §10). */
export async function captureSelection(opts: { timeoutMs?: number } = {}): Promise<CaptureResult> {
  const { result } = await runCapture(
    {
      now: Date.now,
      sleep,
      target: () => {
        const fg = getForegroundWindow()
        return fg ? getWindowInfo(fg) : null
      },
      waitModifiersReleased,
      snapshot: snapshotClipboard,
      sequence: () => w.GetClipboardSequenceNumber(),
      sendChord,
      readText: () => clipboard.readText(),
      restore: restoreClipboard
    },
    opts
  )
  return result
}

/**
 * 글을 클립보드에 넣고 대상 창에 붙여넣는다(설계 문서 §10). 붙여넣기 뒤 클립보드는 되돌리지 않는다.
 * 대상이 사라졌거나 관리자 권한 창이면 복사만 한다.
 */
export function pasteText(hwnd: string, text: string): Promise<{ ok: boolean; reason?: string }> {
  return runPaste(
    {
      sleep,
      target: () => {
        const info = getWindowInfo(hwnd)
        return { exists: Boolean(info), elevated: info?.elevated ?? null }
      },
      writeText: (t) => clipboard.writeText(t),
      focus: () => setForeground(hwnd),
      isForeground: () => getForegroundWindow() === hwnd,
      waitModifiersReleased,
      sendChord
    },
    text
  )
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
