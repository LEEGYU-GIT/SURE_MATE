import { useEffect, useRef, useState } from 'react'
import type { SettingsHotkeyId } from '../../../shared/settings/settings-snapshot'
import { acceleratorFromKey } from './accelerator-input'

/**
 * 단축키 녹화 칸(설계 문서 §6). 칸에 포커스가 오면 모든 전역 단축키를 잠시 풀고(main), 떠나면 되살린다.
 * 조합을 누르면 main이 검사(막힘·경고·다른 앱이 씀·겹침)하고, 쓸 수 있으면 바로 바꿔 본다. 실패하면 이전 조합이 그대로다.
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

  useEffect(() => {
    box.current?.focus()
    // 녹화가 어떻게 끝나든(창을 떠남·화면이 바뀜) 단축키를 되살린다. main도 창이 닫히거나 30초가 지나면 되살린다
    return () => api.hotkeyRecord(false)
  }, [api])

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
      return
    }
    const set = await api.hotkeySet(id, r.acc)
    busy.current = false
    if (set.ok) onDone({ acc: set.acc, warning: set.warning })
    else setProblem(`${r.acc}: ${set.reason}`)
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
