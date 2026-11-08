import type { CaptureResult, PasteFailReason, WindowInfo } from '../../shared/types'
import { captureDecision, pasteDecision, shouldRestoreClipboard } from './clipboard-logic'
import type { ChordKey } from './input'

// 선택 글 가져오기·붙여넣기 순서(설계 문서 §10). Win32·Electron 기능은 주입받아 시간 흐름까지 시험할 수 있게 한다.

export type ClipboardSnapshot = {
  /** 백업할 때의 클립보드 형식 수(CountClipboardFormats). 0이면 비어 있었다. */
  formatCount: number
  /** 되돌릴 수 있는 형식만 */
  data: Record<string, Blob>
}

export interface CaptureDeps {
  now(): number
  sleep(ms: number): Promise<void>
  /** 지금 활성 창 정보. 없으면 null */
  target(): WindowInfo | null
  /** Sure-Mate 자신이 관리자 권한인지. 모르면 null */
  selfElevated(): boolean | null
  waitModifiersReleased(timeoutMs: number): Promise<boolean>
  snapshot(): Promise<ClipboardSnapshot>
  /** GetClipboardSequenceNumber */
  sequence(): number
  sendChord(keys: ChordKey[]): number
  readText(): Promise<string>
  restore(snapshot: ClipboardSnapshot): Promise<boolean>
}

/** 대기 시간(ms). 단계마다 따로 잰다. 앞 단계(보조키 떼기)가 오래 걸려도 뒤 단계 대기가 줄지 않는다. */
export const CAPTURE_TIMING = {
  /** 사용자가 단축키의 보조키를 뗄 때까지(§10 1단계) */
  modifiersMs: 500,
  /** Ctrl+Insert 뒤 복사를 기다리는 시간. 지원하지 않는 앱이면 이만큼 쓰고 Ctrl+C로 넘어간다. */
  insertMs: 250,
  /** Ctrl+C 뒤 복사를 기다리는 시간(§10 4단계의 500ms) */
  ctrlCMs: 500,
  /** 여러 형식을 차례로 쓰는 앱이 끝낼 시간 */
  settleMs: 40,
  /** 시간 안에 복사가 안 됐을 때, 늦게 끝나는 복사를 지켜보다 되돌리는 시간 */
  lateWatchMs: 500,
  pollMs: 10
}
export type CaptureTiming = typeof CAPTURE_TIMING

async function waitSequenceChange(
  d: Pick<CaptureDeps, 'now' | 'sleep' | 'sequence'>,
  from: number,
  timeoutMs: number,
  pollMs: number
): Promise<boolean> {
  const deadline = d.now() + timeoutMs
  for (;;) {
    if (d.sequence() !== from) return true
    if (d.now() >= deadline) return false
    await d.sleep(pollMs)
  }
}

/** result는 바로 쓰고, settled는 뒷정리(늦게 끝난 복사 되돌리기)가 끝나면 풀린다. */
export type CaptureOutcome = { result: CaptureResult; settled: Promise<void> }

/**
 * 보조키가 떼어지길 기다린 뒤 Ctrl+Insert, 안 되면 Ctrl+C를 보내고 클립보드 순번이 바뀌는지 본다.
 * 그사이 사용자가 따로 복사하지 않았으면 원래 클립보드를 되돌린다.
 */
export async function runCapture(d: CaptureDeps, t: CaptureTiming = CAPTURE_TIMING): Promise<CaptureOutcome> {
  const started = d.now()
  const none = (extra: Partial<CaptureResult> = {}): CaptureResult => ({
    text: null,
    method: 'none',
    elapsedMs: d.now() - started,
    restored: false,
    ...extra
  })
  const nothingPending = Promise.resolve()

  const first = d.target()
  const decision = captureDecision(first, d.selfElevated())
  if (decision.action === 'skip' || !first) {
    return { result: none({ skipped: decision.action === 'skip' ? decision.reason : 'no-foreground' }), settled: nothingPending }
  }
  /** 처음 본 창이 아직 앞에 있는지. 그사이 앞에 온 다른 창(터미널이면 Ctrl+C가 실행 중단)에 키를 보내지 않게 키마다 본다 */
  const stillThere = (): boolean => d.target()?.hwnd === first.hwnd

  // 보조키를 누른 채로 보내면 Ctrl+Alt+C(워드에서는 ©)처럼 섞이므로 아예 보내지 않는다
  if (!(await d.waitModifiersReleased(t.modifiersMs))) {
    return { result: none({ skipped: 'modifiers-held' }), settled: nothingPending }
  }

  const backup = await d.snapshot()
  const before = d.sequence()
  if (!stillThere()) return { result: none({ skipped: 'focus-changed' }), settled: nothingPending }

  // 앱이 늦게 복사를 끝내면 사용자 클립보드가 선택 글로 덮이므로, 조금 더 지켜보다 되돌린다
  const watchLateCopy = async (): Promise<void> => {
    try {
      if (!(await waitSequenceChange(d, before, t.lateWatchMs, t.pollMs))) return
      await d.sleep(t.settleMs)
      await d.restore(backup)
    } catch {
      // 뒷정리 실패로 다음 가져오기가 막히면 안 된다
    }
  }

  let method: CaptureResult['method'] = 'ctrl-insert'
  d.sendChord(['CONTROL', 'INSERT'])
  let changed = await waitSequenceChange(d, before, t.insertMs, t.pollMs)
  if (!changed && decision.insertOnly) return { result: none(), settled: watchLateCopy() }
  if (!changed) {
    if (!stillThere()) return { result: none({ skipped: 'focus-changed' }), settled: watchLateCopy() }
    method = 'ctrl-c'
    d.sendChord(['CONTROL', 'C'])
    changed = await waitSequenceChange(d, before, t.ctrlCMs, t.pollMs)
  }
  if (!changed) return { result: none(), settled: watchLateCopy() }

  await d.sleep(t.settleMs)
  const afterCopy = d.sequence()
  const text = await d.readText()
  const restored = shouldRestoreClipboard(afterCopy, d.sequence()) ? await d.restore(backup) : false
  return { result: { text: text || null, method, elapsedMs: d.now() - started, restored }, settled: nothingPending }
}

export interface PasteDeps {
  sleep(ms: number): Promise<void>
  target(): { exists: boolean; elevated: boolean | null }
  /** Sure-Mate 자신이 관리자 권한인지. 모르면 null */
  selfElevated(): boolean | null
  writeText(text: string): Promise<void>
  /** 대상 창을 앞으로 가져온다 */
  focus(): boolean
  /** 대상 창이 지금 앞에 있는지 */
  isForeground(): boolean
  waitModifiersReleased(timeoutMs: number): Promise<boolean>
  sendChord(keys: ChordKey[]): number
}

export type PasteResult = { ok: boolean; reason?: PasteFailReason }

/** 글을 클립보드에 넣고 대상 창에 붙여넣는다. 붙여넣지 못하면 복사만 한 상태로 끝난다. 붙여넣기 뒤 클립보드는 되돌리지 않는다. */
export async function runPaste(d: PasteDeps, text: string): Promise<PasteResult> {
  const decision = pasteDecision(d.target(), d.selfElevated())
  await d.writeText(text)
  if (decision.action === 'copy-only') return { ok: false, reason: decision.reason }

  d.focus()
  await d.sleep(50)
  if (!d.isForeground()) return { ok: false, reason: 'not-foreground' }
  // 보조키를 누른 채로 보내면 Ctrl+Alt+V처럼 섞인다. 글은 이미 클립보드에 있다.
  if (!(await d.waitModifiersReleased(500))) return { ok: false, reason: 'modifiers-held' }
  d.sendChord(['CONTROL', 'V'])
  return { ok: true }
}
