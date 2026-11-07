import { useEffect, useRef } from 'react'

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
      className="flex h-screen flex-col bg-zinc-900/90 text-zinc-100 outline-none"
    >
      <div className="flex h-12 shrink-0 items-center border-b border-white/10 px-5 font-medium">
        {props.title}
        <span className="ml-auto text-xs font-normal text-zinc-500">Esc로 닫기</span>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto px-5 py-3 font-mono text-xs leading-5 whitespace-pre-wrap break-all text-zinc-300">
        {props.text}
      </pre>
    </div>
  )
}
