import { setTimeout as delay } from 'node:timers/promises'
import { clipboard, ClipboardItem } from 'electron'
import type { CaptureResult } from '../../shared/types'
import { runCapture, runPaste, type ClipboardSnapshot, type PasteResult } from './capture-flow'
import { createClipboardGate } from './clipboard-gate'
import { restoreAction } from './clipboard-logic'
import { sendChord, waitModifiersReleased } from './input'
import { nativeStatus, win32 } from './win32'
import { getForegroundWindow, getWindowInfo, selfElevated, setForeground } from './windows'

/** 백업·복원할 수 있는 형식. 엑셀·HWP 고유 서식 같은 나머지 형식은 되돌릴 수 없다. */
const SNAPSHOT_TYPES = ['text/plain', 'text/html', 'text/rtf', 'image/png']
/** Windows 클립보드 기록(Win+V)과 클라우드 동기화에서 빼 달라는 표시. 내용은 아무 값이나 된다. */
const EXCLUDE_FROM_HISTORY = 'electron application/osclipboard;format="ExcludeClipboardContentFromMonitorProcessing"'

const sleep = async (ms: number): Promise<void> => {
  await delay(ms)
}

/**
 * 가져오기·붙여넣기·글 쓰기는 클립보드를 같이 쓰므로 한 줄로 세운다.
 * Sure-Mate가 클립보드에 쓰는 일은 모두 이 파일의 함수를 거친다(늦은 복사 지켜보기가 우리 글을 되돌리지 않게).
 */
const gate = createClipboardGate()

const skipped = (reason: CaptureResult['skipped']): CaptureResult => ({ text: null, method: 'none', elapsedMs: 0, restored: false, skipped: reason })

async function snapshotClipboard(): Promise<ClipboardSnapshot> {
  // 탐색기 파일 복사처럼 웹 형식이 없는 클립보드도 비어 있다고 착각하지 않도록 Win32로 형식 수를 센다
  const formatCount = win32().CountClipboardFormats()
  try {
    const [first] = await clipboard.read()
    const data: Record<string, Blob> = {}
    for (const type of SNAPSHOT_TYPES) {
      if (first?.types.includes(type)) data[type] = (await first.getType(type)) as Blob
    }
    return { formatCount, data }
  } catch {
    return { formatCount, data: {} }
  }
}

async function restoreClipboard(snapshot: ClipboardSnapshot): Promise<boolean> {
  switch (restoreAction({ formatCount: snapshot.formatCount, restorableTypes: Object.keys(snapshot.data).length })) {
    case 'clear':
      clipboard.clear()
      return true
    case 'write':
      await clipboard.write([new ClipboardItem(snapshot.data)])
      return true
    default:
      return false
  }
}

/** 지금 활성 창에서 선택한 글을 가져온다(설계 문서 §10). 이미 가져오거나 붙여넣는 중이면 busy. */
export function captureSelection(): Promise<CaptureResult> {
  if (!nativeStatus().ok) return Promise.resolve(skipped('native-unavailable'))
  return gate.tryRun(
    async () => {
      const { result, settled } = await runCapture({
        now: Date.now,
        sleep,
        target: () => {
          const fg = getForegroundWindow()
          return fg ? getWindowInfo(fg) : null
        },
        selfElevated,
        waitModifiersReleased,
        snapshot: snapshotClipboard,
        sequence: () => win32().GetClipboardSequenceNumber(),
        sendChord,
        readText: () => clipboard.readText(),
        restore: restoreClipboard
      })
      gate.settleAfter(settled)
      return result
    },
    () => skipped('busy')
  )
}

/**
 * 글을 클립보드에 넣고 대상 창에 붙여넣는다(설계 문서 §10). 붙여넣기 뒤 클립보드는 되돌리지 않는다.
 * 대상이 사라졌거나 관리자 권한 창이면 복사만 한다.
 */
export async function pasteText(hwnd: string, text: string): Promise<PasteResult> {
  if (!nativeStatus().ok) {
    await writeClipboardText(text, { excludeFromHistory: false })
    return { ok: false, reason: 'native-unavailable' }
  }
  return gate.tryRun(
    async () => {
      return runPaste(
        {
          sleep,
          target: () => {
            const info = getWindowInfo(hwnd)
            return { exists: Boolean(info), elevated: info?.elevated ?? null }
          },
          selfElevated,
          writeText: (t) => clipboard.writeText(t),
          focus: () => setForeground(hwnd),
          isForeground: () => getForegroundWindow() === hwnd,
          waitModifiersReleased,
          sendChord
        },
        text
      )
    },
    (): PasteResult => ({ ok: false, reason: 'busy' })
  )
}

/**
 * 우리 글(프롬프트·되돌린 원문)을 클립보드에 쓴다. 가져오기와 늦은 복사 지켜보기가 끝날 때까지 기다렸다가 쓴다.
 * excludeFromHistory면 Win+V 기록·클라우드 동기화에서 빠지도록 표시를 붙이고, 안 되면 보통으로라도 쓴다.
 * excluded는 표시를 붙여 썼는지, error는 표시를 붙이지 못한 까닭.
 */
export function writeClipboardText(text: string, o: { excludeFromHistory: boolean }): Promise<{ excluded: boolean; error?: string }> {
  return gate.queue(async () => {
    if (o.excludeFromHistory) {
      try {
        await clipboard.write([new ClipboardItem({ 'text/plain': text, [EXCLUDE_FROM_HISTORY]: new Blob([new Uint8Array([1])]) })])
        return { excluded: true }
      } catch (e) {
        await clipboard.writeText(text)
        return { excluded: false, error: String(e) }
      }
    }
    // Electron 45의 writeText는 Promise다. 끝날 때까지 기다려야 클립보드 줄이 먼저 풀리지 않는다
    await clipboard.writeText(text)
    return { excluded: false }
  })
}
