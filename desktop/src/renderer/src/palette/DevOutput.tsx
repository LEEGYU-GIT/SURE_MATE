import { useEffect, useRef } from 'react'
import { CommandIcon } from '../design/icons'

/** 개발 명령 결과를 보여 주는 화면. Esc로 팔레트를 닫는다. */
export function DevOutput(props: { title: string; text: string; onClose: () => void }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [props.title, props.text])

  return (
    <div
      ref={ref}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.code === 'Escape' || e.key === 'Escape') {
          e.preventDefault()
          props.onClose()
        }
      }}
      className="flex h-screen flex-col bg-surface-palette font-ui text-fg outline-none"
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-5">
        <CommandIcon size={18} className="text-fg-3" />
        <span className="text-input font-semibold">{props.title}</span>
        <span className="ml-auto text-caption text-fg-3">Esc 닫기</span>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto px-5 py-3 font-mono text-caption leading-5 break-all whitespace-pre-wrap text-fg-2">{props.text}</pre>
    </div>
  )
}
