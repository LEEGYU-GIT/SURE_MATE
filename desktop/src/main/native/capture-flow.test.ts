import { expect, it } from 'vitest'
import type { WindowInfo } from '../../shared/types'
import { runCapture, runPaste, type CaptureDeps, type ClipboardSnapshot, type PasteDeps } from './capture-flow'
import type { ChordKey } from './input'

/** 시계·클립보드·대상 앱을 흉내 낸다. sleep은 시계를 앞으로 돌리며 그사이 예약된 일을 실행한다. */
class FakeDesktop implements CaptureDeps {
  t = 0
  seq = 100
  clip = '원래 클립보드'
  /** 사용자가 단축키의 보조키를 떼는 시각 */
  modifiersUpAt = 0
  /** 대상 앱이 복사 단축키에 반응하기까지 걸리는 시간. null이면 그 단축키를 지원하지 않는다. */
  copyDelay: Record<'INSERT' | 'C', number | null> = { INSERT: 20, C: 20 }
  selection: string | null = '선택한 글'
  windowElevated: boolean | null = false
  sent: string[] = []
  restores = 0
  private timers: { at: number; run: () => void }[] = []

  advance(ms: number): void {
    const end = this.t + ms
    for (;;) {
      const due = this.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      this.timers.splice(this.timers.indexOf(due), 1)
      this.t = Math.max(this.t, due.at)
      due.run()
    }
    this.t = end
  }

  now = (): number => this.t
  sleep = async (ms: number): Promise<void> => {
    this.advance(ms)
  }
  target = (): WindowInfo | null => ({ exe: 'notepad.exe', className: 'Notepad', elevated: this.windowElevated }) as WindowInfo
  selfElevated = (): boolean | null => false
  waitModifiersReleased = async (timeoutMs: number): Promise<boolean> => {
    const wait = Math.max(0, this.modifiersUpAt - this.t)
    if (wait > timeoutMs) {
      this.advance(timeoutMs)
      return false
    }
    this.advance(wait)
    return true
  }
  snapshot = async (): Promise<ClipboardSnapshot> => ({ formatCount: 1, data: { 'text/plain': new Blob([this.clip]) } })
  sequence = (): number => this.seq
  sendChord = (keys: ChordKey[]): number => {
    this.sent.push(keys.join('+'))
    const key = keys[keys.length - 1]
    const delay = key === 'INSERT' || key === 'C' ? this.copyDelay[key] : null
    const selection = this.selection
    if (selection !== null && delay !== null) {
      this.timers.push({
        at: this.t + delay,
        run: () => {
          this.seq++
          this.clip = selection
        }
      })
    }
    return keys.length * 2
  }
  readText = async (): Promise<string> => this.clip
  restore = async (s: ClipboardSnapshot): Promise<boolean> => {
    this.restores++
    this.clip = await (s.data['text/plain'] as Blob).text()
    this.seq++
    return true
  }
}

it('보조키를 0.3초 늦게 떼도, Ctrl+Insert를 못 받는 앱에서 Ctrl+C로 가져오고 클립보드를 되돌린다', async () => {
  const d = new FakeDesktop()
  d.modifiersUpAt = 300
  d.copyDelay = { INSERT: null, C: 120 }
  const { result } = await runCapture(d)
  expect(result).toMatchObject({ text: '선택한 글', method: 'ctrl-c', restored: true })
  expect(d.clip).toBe('원래 클립보드')
})

it('보조키를 0.5초 넘게 누르고 있으면 키를 보내지 않고 modifiers-held로 끝낸다', async () => {
  const d = new FakeDesktop()
  d.modifiersUpAt = 2000
  const { result } = await runCapture(d)
  expect(result).toMatchObject({ text: null, method: 'none', skipped: 'modifiers-held' })
  expect(d.sent).toEqual([])
})

it('복사가 기다리는 시간보다 늦게 끝나도 원래 클립보드를 되돌린다', async () => {
  const d = new FakeDesktop()
  d.copyDelay = { INSERT: null, C: 700 }
  const { result, settled } = await runCapture(d)
  expect(result).toMatchObject({ text: null, method: 'none' })
  await settled
  d.advance(2000)
  expect(d.clip).toBe('원래 클립보드')
})

it('선택한 글이 없으면 클립보드를 건드리지 않는다', async () => {
  const d = new FakeDesktop()
  d.selection = null
  const { result, settled } = await runCapture(d)
  await settled
  expect(result).toMatchObject({ text: null, method: 'none', restored: false })
  expect(d.restores).toBe(0)
  expect(d.clip).toBe('원래 클립보드')
})

it('Sure-Mate도 관리자 권한이면(UAC가 꺼진 PC) 관리자 권한 창에서도 가져온다', async () => {
  const d = new FakeDesktop()
  d.windowElevated = true
  d.selfElevated = () => true
  const { result } = await runCapture(d)
  expect(result.text).toBe('선택한 글')
})

class FakePaste implements PasteDeps {
  modifiersReleased = true
  windowElevated: boolean | null = false
  written: string[] = []
  sent: string[] = []
  sleep = async (): Promise<void> => {}
  target = (): { exists: boolean; elevated: boolean | null } => ({ exists: true, elevated: this.windowElevated })
  selfElevated = (): boolean | null => false
  writeText = async (text: string): Promise<void> => {
    this.written.push(text)
  }
  focus = (): boolean => true
  isForeground = (): boolean => true
  waitModifiersReleased = async (): Promise<boolean> => this.modifiersReleased
  sendChord = (keys: ChordKey[]): number => {
    this.sent.push(keys.join('+'))
    return keys.length * 2
  }
}

it('붙여넣기: 보조키를 계속 누르고 있으면 Ctrl+V를 보내지 않고 복사만 한다', async () => {
  const d = new FakePaste()
  d.modifiersReleased = false
  expect(await runPaste(d, '상용구')).toEqual({ ok: false, reason: 'modifiers-held' })
  expect(d.written).toEqual(['상용구'])
  expect(d.sent).toEqual([])
})

it('붙여넣기: Sure-Mate도 관리자 권한이면 관리자 권한 창에도 붙여넣는다', async () => {
  const d = new FakePaste()
  d.windowElevated = true
  d.selfElevated = () => true
  expect(await runPaste(d, '상용구')).toEqual({ ok: true })
  expect(d.sent).toEqual(['CONTROL+V'])
})
