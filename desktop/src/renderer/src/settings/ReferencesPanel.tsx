import { useEffect, useId, useState } from 'react'
import type { ReferenceKind } from '../../../shared/ipc-channels'
import { Button, Section, TextField } from './controls'

const WARN = 4000

/**
 * 기준 예시 문서(설계 문서 §7): 종류별로 잘 쓴 문서 한 개를 PC 안에만 둔다. 템플릿의 {{reference:종류}} 자리에 들어가고,
 * 없으면 그 줄이 프롬프트에서 빠진다. 4,000자가 넘으면 경고만(20,000자까지).
 */
export function ReferencesPanel(): React.JSX.Element {
  const api = window.sureMate.settings
  const [kinds, setKinds] = useState<ReferenceKind[] | null>(null)
  const [editing, setEditing] = useState<{ kind: string; text: string; exists: boolean } | null>(null)
  const [newKind, setNewKind] = useState('')
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const id = useId()

  const load = async (): Promise<void> => setKinds(await api.references())
  useEffect(() => {
    void load()
  }, [])

  const open = async (kind: string): Promise<void> => {
    const text = await api.referenceGet(kind)
    setMessage(null)
    setEditing({ kind, text: text ?? '', exists: text !== null })
  }

  const save = async (): Promise<void> => {
    if (!editing) return
    const r = await api.referenceSave(editing.kind, editing.text)
    if (!r.ok) {
      setMessage({ kind: 'error', text: r.reason })
      return
    }
    setMessage({ kind: 'ok', text: r.warning ? `저장했어요 · ${r.warning}` : '저장했어요' })
    setEditing(null)
    await load()
  }

  const remove = async (): Promise<void> => {
    if (!editing) return
    const r = await api.referenceDelete(editing.kind)
    if (!r.ok) setMessage({ kind: 'error', text: '지우지 못했어요' })
    else {
      setMessage({ kind: 'ok', text: '지웠어요' })
      setEditing(null)
      await load()
    }
  }

  if (editing) {
    const length = [...editing.text].length
    return (
      <Section title={`기준 예시: ${editing.kind}`}>
        <div className="flex flex-col gap-2 px-4 py-3">
          <label htmlFor={`${id}-text`} className="text-small text-fg-2">
            이 종류의 잘 쓴 문서를 붙여 넣으세요. PC 밖으로 나가지 않아요(가명 처리는 프롬프트를 만들 때 함께 돼요)
          </label>
          <textarea
            id={`${id}-text`}
            value={editing.text}
            rows={12}
            spellCheck={false}
            onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            className="min-h-56 resize-y rounded-control border border-line bg-surface-inset px-3 py-2 text-body leading-6 text-fg select-text"
          />
          <p className={`text-small ${length > WARN ? 'text-warn' : 'text-fg-2'}`}>
            {length.toLocaleString('ko-KR')}자{length > WARN ? ' · 4,000자가 넘으면 AI가 받는 글이 길어져요' : ' · 4,000자 안을 권해요'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button kind="primary" onClick={() => void save()}>
              저장
            </Button>
            <Button onClick={() => setEditing(null)}>그만두기</Button>
            {editing.exists ? (
              <Button kind="danger" onClick={() => void remove()}>
                지우기
              </Button>
            ) : null}
            <p role="status" className={`ml-2 text-small ${message?.kind === 'error' ? 'text-danger' : 'text-fg-2'}`}>
              {message?.text ?? ''}
            </p>
          </div>
        </div>
      </Section>
    )
  }

  return (
    <Section title="기준 예시 문서">
      {!kinds ? <p className="px-4 py-3 text-small text-fg-2">읽는 중이에요…</p> : null}
      {kinds?.length === 0 ? <p className="border-b border-line px-4 py-3 text-small text-fg-2">템플릿 본문에 {'{{reference:종류}}'}를 넣으면 여기에 나타나요.</p> : null}
      {kinds?.map((k) => (
        <div key={k.kind} className="flex items-center gap-4 border-b border-line px-4 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body text-fg">{k.kind}</span>
            <span className="block truncate text-small text-fg-2">
              {k.length === null ? '아직 없어요 · 이 자리는 프롬프트에서 빠져요' : `${k.length.toLocaleString('ko-KR')}자`}
              {k.usedBy.length ? ` · ${k.usedBy.join(', ')}에서 씀` : ' · 쓰는 템플릿 없음'}
            </span>
          </span>
          <Button label={`${k.kind} 기준 예시 ${k.length === null ? '쓰기' : '고치기'}`} onClick={() => void open(k.kind)}>
            {k.length === null ? '쓰기' : '고치기'}
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <TextField value={newKind} onChange={setNewKind} onCommit={() => newKind.trim() && void open(newKind.trim())} placeholder="새 종류 이름 (예: 주간보고)" width="w-56" maxLength={40} />
        <Button disabled={!newKind.trim()} onClick={() => void open(newKind.trim())}>
          만들기
        </Button>
        <p role="status" className={`ml-2 text-small ${message?.kind === 'error' ? 'text-danger' : 'text-fg-2'}`}>
          {message?.text ?? ''}
        </p>
      </div>
    </Section>
  )
}
