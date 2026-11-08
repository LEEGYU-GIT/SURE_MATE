import type { CaptureResult, WindowInfo } from '../../shared/types'
import { captureDecision, pasteDecision, shouldRestoreClipboard } from './clipboard-logic'
import type { ChordKey } from './input'

// 선택 글 가져오기·붙여넣기 순서(설계 문서 §10). Win32·Electron 기능은 주입받아 시간 흐름까지 시험할 수 있게 한다.

/** 클립보드 백업. data에는 되돌릴 수 있는 형식만 담는다. */
export type ClipboardSnapshot = { wasEmpty: boolean; data: Record<string, Blob> }

export interface CaptureDeps {
  now(): number
  sleep(ms: number): Promise<void>
  /** 지금 활성 창 정보. 없으면 null */
  target(): WindowInfo | null
  waitModifiersReleased(timeoutMs: number): Promise<boolean>
  snapshot(): Promise<ClipboardSnapshot>
  /** GetClipboardSequenceNumber */
  sequence(): number
  sendChord(keys: ChordKey[]): number
  readText(): Promise<string>
  restore(snapshot: ClipboardSnapshot): Promise<boolean>
}

async function waitSequenceChange(d: Pick<CaptureDeps, 'now' | 'sleep' | 'sequence'>, from: number, timeoutMs: number): Promise<boolean> {
  const deadline = d.now() + timeoutMs
  while (d.now() < deadline) {
    if (d.sequence() !== from) return true
    await d.sleep(10)
  }
  return false
}

/** result는 바로 쓰고, settled는 뒷정리(늦게 끝난 복사 되돌리기)가 끝나면 풀린다. */
export type CaptureOutcome = { result: CaptureResult; settled: Promise<void> }

/**
 * 보조키가 떼어지길 기다린 뒤 Ctrl+Insert, 안 되면 Ctrl+C를 보내고 클립보드 순번이 바뀌는지 본다.
 * 그사이 사용자가 따로 복사하지 않았으면 원래 클립보드를 되돌린다.
 */
export async function runCapture(d: CaptureDeps, opts: { timeoutMs?: number } = {}): Promise<CaptureOutcome> {
  return { result: await captureOnce(d, opts), settled: Promise.resolve() }
}

async function captureOnce(d: CaptureDeps, opts: { timeoutMs?: number }): Promise<CaptureResult> {
  const timeoutMs = opts.timeoutMs ?? 500
  const started = d.now()
  const elapsed = (): number => d.now() - started

  const decision = captureDecision(d.target())
  if (decision.action === 'skip') {
    return { text: null, method: 'none', elapsedMs: elapsed(), restored: false, skipped: decision.reason }
  }

  await d.waitModifiersReleased(500)
  const backup = await d.snapshot()
  const before = d.sequence()

  let method: CaptureResult['method'] = 'ctrl-insert'
  d.sendChord(['CONTROL', 'INSERT'])
  let changed = await waitSequenceChange(d, before, Math.min(250, timeoutMs))
  if (!changed) {
    method = 'ctrl-c'
    d.sendChord(['CONTROL', 'C'])
    changed = await waitSequenceChange(d, before, Math.max(0, timeoutMs - elapsed()))
  }
  if (!changed) return { text: null, method: 'none', elapsedMs: elapsed(), restored: false }

  await d.sleep(40) // 여러 형식을 차례로 쓰는 앱이 끝낼 시간
  const afterCopy = d.sequence()
  const text = await d.readText()
  const restored = shouldRestoreClipboard(afterCopy, d.sequence()) ? await d.restore(backup) : false
  return { text: text || null, method, elapsedMs: elapsed(), restored }
}

export interface PasteDeps {
  sleep(ms: number): Promise<void>
  target(): { exists: boolean; elevated: boolean | null }
  writeText(text: string): Promise<void>
  /** 대상 창을 앞으로 가져온다 */
  focus(): boolean
  /** 대상 창이 지금 앞에 있는지 */
  isForeground(): boolean
  waitModifiersReleased(timeoutMs: number): Promise<boolean>
  sendChord(keys: ChordKey[]): number
}

/** 글을 클립보드에 넣고 대상 창에 붙여넣는다. 붙여넣기 뒤 클립보드는 되돌리지 않는다. */
export async function runPaste(d: PasteDeps, text: string): Promise<{ ok: boolean; reason?: string }> {
  const decision = pasteDecision(d.target())
  await d.writeText(text)
  if (decision.action === 'copy-only') return { ok: false, reason: decision.reason }

  d.focus()
  await d.sleep(50)
  if (!d.isForeground()) return { ok: false, reason: 'not-foreground' }
  await d.waitModifiersReleased(500)
  d.sendChord(['CONTROL', 'V'])
  return { ok: true }
}
