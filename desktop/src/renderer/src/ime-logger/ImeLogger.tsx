import { useRef, useState } from 'react'

type Row = {
  t: number
  type: string
  key?: string
  code?: string
  keyCode?: number
  isComposing?: boolean
  data?: string | null
  inputType?: string
  value: string
}

/**
 * 개발용: 한글 IME에서 음절 중간에 Enter·↓·Esc·Tab·Space를 누를 때의 이벤트 순서를 기록한다.
 * 결과로 팔레트의 Enter 처리 방식을 정한다(설계 문서 §6 한글 입력 규칙).
 */
export function ImeLogger(): React.JSX.Element {
  const [rows, setRows] = useState<Row[]>([])
  const [label, setLabel] = useState('새 IME')
  const [saved, setSaved] = useState('')
  const start = useRef(performance.now())

  const push = (row: Omit<Row, 't'>): void => {
    setRows((prev) => [...prev, { t: Math.round(performance.now() - start.current), ...row }])
  }

  const onKey = (type: string) => (e: React.KeyboardEvent<HTMLInputElement>) =>
    push({ type, key: e.key, code: e.code, keyCode: e.keyCode, isComposing: e.nativeEvent.isComposing, value: e.currentTarget.value })
  const onComposition = (type: string) => (e: React.CompositionEvent<HTMLInputElement>) =>
    push({ type, data: e.data, value: e.currentTarget.value })
  const onInputEvent = (type: string) => (e: React.FormEvent<HTMLInputElement>) => {
    const native = e.nativeEvent as InputEvent
    push({ type, data: native.data, inputType: native.inputType, isComposing: native.isComposing, value: e.currentTarget.value })
  }

  const save = async (): Promise<void> => {
    const path = await window.sureMate.saveImeLog(label, JSON.stringify({ label, ua: navigator.userAgent, rows }, null, 1))
    setSaved(path)
  }

  return (
    <div className="flex h-screen flex-col gap-3 bg-zinc-900 p-4 text-sm text-zinc-100 select-text">
      <div className="flex items-center gap-2">
        <input
          onKeyDown={onKey('keydown')}
          onKeyUp={onKey('keyup')}
          onCompositionStart={onComposition('compositionstart')}
          onCompositionUpdate={onComposition('compositionupdate')}
          onCompositionEnd={onComposition('compositionend')}
          onBeforeInput={onInputEvent('beforeinput')}
          onInput={onInputEvent('input')}
          autoFocus
          spellCheck={false}
          placeholder="여기에 한글을 치다가 음절 중간에 Enter·↓·Esc·Tab·Space를 눌러 보세요"
          className="flex-1 rounded border border-white/20 bg-zinc-800 px-3 py-2 outline-none"
        />
        <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-32 rounded border border-white/20 bg-zinc-800 px-2 py-2" title="기록 이름(예: 새 IME, 이전 IME)" />
        <button onClick={() => void save()} className="rounded bg-sky-700 px-3 py-2">JSON 저장</button>
        <button onClick={() => { setRows([]); setSaved(''); start.current = performance.now() }} className="rounded bg-zinc-700 px-3 py-2">지우기</button>
      </div>
      {saved && <div className="text-xs text-emerald-400">저장됨: {saved}</div>}
      <div className="min-h-0 flex-1 overflow-auto rounded border border-white/10">
        <table className="w-full font-mono text-xs">
          <thead className="sticky top-0 bg-zinc-800 text-left">
            <tr>{['ms', 'type', 'key', 'code', 'keyCode', 'isComposing', 'data', 'inputType', 'value'].map((h) => <th key={h} className="px-2 py-1">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="px-2">{r.t}</td>
                <td className="px-2">{r.type}</td>
                <td className="px-2">{r.key}</td>
                <td className="px-2">{r.code}</td>
                <td className="px-2">{r.keyCode}</td>
                <td className="px-2">{r.isComposing === undefined ? '' : String(r.isComposing)}</td>
                <td className="px-2">{r.data ?? ''}</td>
                <td className="px-2">{r.inputType}</td>
                <td className="px-2">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
