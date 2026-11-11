import { useEffect, useRef, useState } from 'react'
import { acceleratorFromKey } from '../../../shared/hotkeys/accelerator-input'
import type { SettingsHotkeyId } from '../../../shared/settings/settings-snapshot'

/**
 * 단축키 녹화 칸(설계 문서 §6). 칸에 포커스가 오면 모든 전역 단축키를 잠시 풀고(main), 떠나면 되살린다.
 * 조합을 누르면 main이 검사(막힘·경고·다른 앱이 씀·겹침)하고, 쓸 수 있으면 바로 바꿔 본다. 실패하면 이전 조합이 그대로다.
 * main이 30초가 지나 녹화를 끝내면 칸을 닫는다. 바꾸기에 실패하면(main은 바꾸기 전에 녹화를 끝낸다) 칸이 열려 있는 동안
 * 다시 녹화한다: 단축키가 되살아난 채 칸이 남으면 누른 조합이 거절되지 않고 실행된다
 */
export function HotkeyRecorder({
  id,
  onDone,
  labelledBy
}: {
  id: SettingsHotkeyId
  /** 바꿨으면 새 조합(경고가 있으면 함께), 그만뒀으면 null */
  onDone(result: { acc: string; warning?: string } | null): void
  labelledBy?: string
}): React.JSX.Element {
  const api = window.sureMate.settings
  const box = useRef<HTMLDivElement>(null)
  const [held, setHeld] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const busy = useRef(false)
  /** 칸이 화면에 있는 동안 true(닫힌 뒤 도착한 검사 결과로 다시 녹화하지 않게) */
  const open = useRef(false)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })

  useEffect(() => {
    open.current = true
    box.current?.focus()
    // main이 스스로 녹화를 끝냈다(30초): 칸을 닫는다. 검사·바꾸기 중이면 그 결과가 정한다(실패하면 다시 녹화)
    const off = api.onHotkeyRecordEnded(() => {
      if (!busy.current) done.current(null)
    })
    // 녹화가 어떻게 끝나든(창을 떠남·화면이 바뀜) 단축키를 되살린다. main도 창이 닫히거나 30초가 지나면 되살린다
    return () => {
      open.current = false
      off()
      api.hotkeyRecord(false)
    }
  }, [api])

  /** 칸이 열려 있고 포커스가 있으면 녹화를 이어 간다(main이 끝냈을 수 있다: 바꾸기 실패, 검사하는 동안 30초). 녹화 중이면 그대로 */
  const rearm = (): void => {
    if (open.current && document.activeElement === box.current) api.hotkeyRecord(true)
  }

  const onKeyDown = async (e: React.KeyboardEvent): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    if (busy.current) return
    const r = acceleratorFromKey({ code: e.code, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, metaKey: e.metaKey, isComposing: e.nativeEvent.isComposing })
    if ('pending' in r) {
      setHeld([e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean).join('+'))
      return
    }
    if ('cancel' in r) {
      onDone(null)
      return
    }
    if ('invalid' in r) {
      setProblem(r.invalid)
      return
    }
    busy.current = true
    setHeld(r.acc)
    const check = await api.hotkeyCheck(id, r.acc)
    if (check.level === 'block' || check.level === 'in-use' || check.level === 'same-as-other') {
      setProblem(`${r.acc}: ${check.reason ?? '쓸 수 없는 조합이에요'}`)
      busy.current = false
      rearm()
      return
    }
    const set = await api.hotkeySet(id, r.acc)
    busy.current = false
    if (set.ok) onDone({ acc: set.acc ?? r.acc, warning: set.warning })
    else {
      setProblem(`${r.acc}: ${set.reason}`)
      rearm()
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={box}
        tabIndex={0}
        role="textbox"
        aria-labelledby={labelledBy}
        aria-describedby={`${id}-recorder-help`}
        onFocus={() => api.hotkeyRecord(true)}
        onBlur={() => {
          api.hotkeyRecord(false)
          onDone(null)
        }}
        onKeyDown={(e) => void onKeyDown(e)}
        className="flex h-9 min-w-56 items-center rounded-control border border-brand bg-surface-inset px-3 text-body text-fg outline-none"
      >
        {held || <span className="text-fg-3">새 조합을 누르세요</span>}
      </div>
      <p id={`${id}-recorder-help`} className="text-small text-fg-2">
        녹화하는 동안 다른 단축키는 잠시 멈춰요. Esc로 그만둬요
      </p>
      {problem ? (
        <p role="alert" className="text-small text-danger">
          {problem}
        </p>
      ) : null}
    </div>
  )
}
