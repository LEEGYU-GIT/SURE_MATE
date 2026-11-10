import { useEffect, useId, useMemo, useState } from 'react'
import type { GlossaryEntry } from '../../../shared/glossary/types'
import { entryToForm, formToDraft, type WikiForm } from '../palette/wiki-form'
import { sourceLabel } from '../palette/wiki-state'
import { Button, Section, TextField } from './controls'

type Editing = { entry: GlossaryEntry | null; form: WikiForm; errors: string[]; duplicate: { term: string } | null }

const firstLine = (s: string): string => s.split('\n', 1)[0] ?? ''

/**
 * 용어 사전(설계 문서 §9): 찾기, 더하기·고치기(팔레트 위키와 같은 검사), 지우기(내 용어·가져온 용어. 고친 기본 용어는 기본으로 되돌림),
 * 용어 팩 가져오기·내보내기(팔레트 명령과 같은 흐름).
 */
export function GlossaryTab(): React.JSX.Element {
  const api = window.sureMate.settings
  const [data, setData] = useState<{ entries: GlossaryEntry[]; builtin: Set<string> } | null>(null)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const id = useId()

  const load = async (): Promise<void> => {
    const r = await api.glossary()
    setData({ entries: r.entries, builtin: new Set(r.builtinIds) })
  }
  useEffect(() => {
    void load()
  }, [])

  const shown = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    const list = q ? data.entries.filter((e) => e.term.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q))) : data.entries
    return list.slice(0, 200)
  }, [data, query])

  const save = async (allowDuplicate: boolean): Promise<void> => {
    if (!editing) return
    const { draft, errors } = formToDraft(editing.form)
    if (!draft) {
      setEditing({ ...editing, errors, duplicate: null })
      return
    }
    const r = await api.glossarySave(draft, { ...(editing.entry ? { id: editing.entry.id } : {}), allowDuplicate })
    if (r.ok) {
      setEditing(null)
      setMessage({ kind: 'ok', text: editing.entry ? '고쳤어요' : '더했어요' })
      await load()
    } else if (r.duplicate) setEditing({ ...editing, errors: [], duplicate: { term: r.duplicate.term } })
    else setEditing({ ...editing, errors: r.errors ?? ['저장하지 못했어요'], duplicate: null })
  }

  const remove = async (e: GlossaryEntry): Promise<void> => {
    const r = await api.glossaryDelete(e.id)
    if (r.ok) {
      setMessage({ kind: 'ok', text: data?.builtin.has(e.id) ? '기본 용어로 되돌렸어요' : '지웠어요' })
      await load()
    } else setMessage({ kind: 'error', text: r.reason === 'save-failed' ? '파일에 쓰지 못했어요. 잠시 뒤 다시 해 보세요' : '지울 수 없는 용어예요' })
  }

  if (!data) return <p className="text-small text-fg-2">용어를 읽는 중이에요…</p>

  if (editing) {
    const f = editing.form
    const set = (patch: Partial<WikiForm>): void => setEditing({ ...editing, form: { ...f, ...patch }, duplicate: null })
    const area = 'resize-y rounded-control border border-line bg-surface-inset px-3 py-2 text-body leading-6 text-fg select-text'
    return (
      <Section title={editing.entry ? `${editing.entry.term} 고치기` : '용어 더하기'}>
        <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-x-4 gap-y-3 px-4 py-4">
          <label htmlFor={`${id}-term`} className="pt-1.5 text-small text-fg-2">
            용어
          </label>
          <input id={`${id}-term`} value={f.term} onChange={(e) => set({ term: e.target.value })} className="h-8 rounded-control border border-line bg-surface-inset px-2.5 text-body text-fg" />
          <span id={`${id}-aliases`} className="pt-1.5 text-small text-fg-2">
            별칭
          </span>
          <TextField labelId={`${id}-aliases`} value={f.aliases} onChange={(aliases) => set({ aliases })} placeholder="쉼표로 나눔" width="w-full" />
          <label htmlFor={`${id}-def`} className="pt-1.5 text-small text-fg-2">
            설명
          </label>
          <textarea id={`${id}-def`} value={f.definition} rows={5} onChange={(e) => set({ definition: e.target.value })} className={area} />
          <label htmlFor={`${id}-ex`} className="pt-1.5 text-small text-fg-2">
            사용 예
          </label>
          <textarea id={`${id}-ex`} value={f.example} rows={2} onChange={(e) => set({ example: e.target.value })} className={area} />
          <label htmlFor={`${id}-links`} className="pt-1.5 text-small text-fg-2">
            링크
          </label>
          <textarea id={`${id}-links`} value={f.links} rows={2} placeholder="한 줄에 하나: 제목 | https://…" onChange={(e) => set({ links: e.target.value })} className={area} />
          <span id={`${id}-tags`} className="pt-1.5 text-small text-fg-2">
            태그
          </span>
          <TextField labelId={`${id}-tags`} value={f.tags} onChange={(tags) => set({ tags })} placeholder="쉼표로 나눔" width="w-full" />
        </div>
        {editing.errors.length ? (
          <p role="alert" className="px-4 pb-2 text-small text-danger">
            {editing.errors.join(' · ')}
          </p>
        ) : null}
        {editing.duplicate ? (
          <div role="alert" className="flex items-center gap-3 bg-warn/10 px-4 py-3 text-small text-fg">
            이름이 같은 용어 &lsquo;{editing.duplicate.term}&rsquo;가 이미 있어요.
            <span className="ml-auto flex gap-2">
              <Button onClick={() => void save(true)}>그래도 더하기</Button>
            </span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <Button kind="primary" onClick={() => void save(false)}>
            저장
          </Button>
          <Button onClick={() => setEditing(null)}>그만두기</Button>
        </div>
      </Section>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <TextField value={query} onChange={setQuery} placeholder="용어·별칭으로 찾기" width="w-64" />
        <span className="ml-auto" />
        <Button kind="primary" onClick={() => setEditing({ entry: null, form: entryToForm(undefined, query.trim()), errors: [], duplicate: null })}>
          용어 더하기
        </Button>
      </div>
      <Section title={`용어 (${data.entries.length}개${shown.length < data.entries.length ? ` 중 ${shown.length}개` : ''})`}>
        {shown.length === 0 ? <p className="px-4 py-3 text-small text-fg-2">맞는 용어가 없어요. 위의 &lsquo;용어 더하기&rsquo;로 만들 수 있어요.</p> : null}
        {shown.map((e) => {
          const edited = e.source !== 'builtin' && data.builtin.has(e.id)
          const label = edited ? '기본을 고침' : sourceLabel(e.source)
          return (
            <div key={e.id} className="flex items-center gap-4 border-b border-line px-4 py-2.5 last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-fg">{e.term}</span>
                <span className="block truncate text-small text-fg-2">{firstLine(e.definition)}</span>
              </span>
              <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-caption text-fg-2">{label}</span>
              <Button label={`${e.term} 고치기`} onClick={() => setEditing({ entry: e, form: entryToForm(e), errors: [], duplicate: null })}>
                고치기
              </Button>
              {e.source !== 'builtin' ? (
                <Button kind="danger" label={`${e.term} ${edited ? '기본으로 되돌리기' : '지우기'}`} onClick={() => void remove(e)}>
                  {edited ? '되돌리기' : '지우기'}
                </Button>
              ) : null}
            </div>
          )
        })}
      </Section>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={async () => {
            await api.glossaryPack('import')
            await load()
          }}
        >
          용어 팩 가져오기
        </Button>
        <Button onClick={() => void api.glossaryPack('export')}>용어 팩 내보내기</Button>
        <p role="status" className={`ml-2 text-small ${message?.kind === 'error' ? 'text-danger' : 'text-fg-2'}`}>
          {message?.text ?? ''}
        </p>
      </div>
    </>
  )
}
