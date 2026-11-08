import { useEffect, useRef, useState } from 'react'
import { GLOSSARY_LIMITS } from '../../../shared/glossary/types'
import type { GlossaryEntry } from '../../../shared/glossary/types'
import { isImeComposing } from '../../../shared/ime'
import { WikiIcon } from '../design/icons'
import { entryToForm, formToDraft, type WikiForm } from './wiki-form'

const fieldClass =
  'w-full rounded-control border border-line bg-black/20 px-3 text-body text-fg outline-none select-text placeholder:text-fg-3 focus:border-brand/70'

function Field(props: { label: string; hint?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline gap-2 text-caption text-fg-3">
        <span className="text-fg-2">{props.label}</span>
        {props.hint && <span>{props.hint}</span>}
      </span>
      {props.children}
    </label>
  )
}

/**
 * 용어 추가·수정(설계 문서 §9). Ctrl+Enter 저장, Esc 취소. 한글 조합 중에는 둘 다 하지 않는다.
 * 새로 추가할 때 같은 이름이 있으면 먼저 보여 주고, Ctrl+Enter를 한 번 더 누르면 그래도 추가한다.
 */
export function WikiEdit(props: { entry?: GlossaryEntry; prefillTerm?: string; onCancel: () => void; onSaved: (entry: GlossaryEntry) => void }): React.JSX.Element {
  const [form, setForm] = useState<WikiForm>(() => entryToForm(props.entry, props.prefillTerm))
  const [errors, setErrors] = useState<string[]>([])
  const [duplicate, setDuplicate] = useState<Pick<GlossaryEntry, 'id' | 'term' | 'definition'> | null>(null)
  const [saving, setSaving] = useState(false)
  const termRef = useRef<HTMLInputElement>(null)
  const definitionRef = useRef<HTMLTextAreaElement>(null)

  // 새 용어면 이름이 채워져 있으니 설명부터, 고칠 때는 용어부터
  useEffect(() => {
    if (!props.entry && form.term) definitionRef.current?.focus()
    else termRef.current?.focus()
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const set = (key: keyof WikiForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors([])
    // 용어를 바꾸면 같은 이름 확인을 다시 한다
    if (key === 'term') setDuplicate(null)
  }

  const save = async (): Promise<void> => {
    if (saving) return
    const r = formToDraft(form)
    if (!r.draft) {
      setErrors(r.errors)
      return
    }
    setSaving(true)
    const result = await window.sureMate.saveWikiEntry(r.draft, { ...(props.entry ? { id: props.entry.id } : {}), allowDuplicate: duplicate !== null })
    setSaving(false)
    if (result.ok) props.onSaved(result.entry)
    else if (result.duplicate) setDuplicate(result.duplicate)
    else setErrors(result.errors ?? ['저장하지 못했어요'])
  }

  const definitionLength = form.definition.trim().length

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-surface-palette font-ui text-fg"
      onKeyDown={(e) => {
        if (isImeComposing(e.nativeEvent)) return
        if (e.code === 'Escape' || e.key === 'Escape') {
          e.preventDefault()
          props.onCancel()
        } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && e.ctrlKey && !e.repeat) {
          e.preventDefault()
          void save()
        }
      }}
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-5">
        <WikiIcon size={18} className="shrink-0 text-brand" />
        <span className="min-w-0 truncate text-input font-semibold">{props.entry ? `용어 고치기 · ${props.entry.term}` : '용어 추가'}</span>
        <span className="ml-auto shrink-0 text-caption text-fg-3">Esc 취소</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        <Field label="용어" hint={`${GLOSSARY_LIMITS.term}자까지`}>
          <input ref={termRef} value={form.term} onChange={set('term')} spellCheck={false} className={`${fieldClass} h-9`} placeholder="예: MC/DC" />
        </Field>
        <Field label="별칭" hint="쉼표로 구분">
          <input value={form.aliases} onChange={set('aliases')} spellCheck={false} className={`${fieldClass} h-9`} placeholder="예: MCDC, 변경 조건/결정 커버리지" />
        </Field>
        <Field label="설명" hint={`${definitionLength.toLocaleString('ko-KR')} / ${GLOSSARY_LIMITS.definition.toLocaleString('ko-KR')}자`}>
          <textarea
            ref={definitionRef}
            value={form.definition}
            onChange={set('definition')}
            spellCheck={false}
            className={`${fieldClass} h-28 resize-none py-2 leading-relaxed`}
            placeholder="팀이 쓰는 뜻을 한두 문장으로"
          />
        </Field>
        <Field label="사용 예" hint="선택">
          <textarea value={form.example} onChange={set('example')} spellCheck={false} className={`${fieldClass} h-16 resize-none py-2`} />
        </Field>
        <Field label="링크" hint="한 줄에 하나, 5개까지">
          <textarea value={form.links} onChange={set('links')} spellCheck={false} className={`${fieldClass} h-16 resize-none py-2`} placeholder="제목 | https://…" />
        </Field>
        <Field label="태그" hint="쉼표로 구분, 5개까지">
          <input value={form.tags} onChange={set('tags')} spellCheck={false} className={`${fieldClass} h-9`} placeholder="예: 커버리지, 기능안전" />
        </Field>
      </div>

      <div className="flex min-h-11 shrink-0 items-center gap-3 border-t border-line px-4 py-2 text-caption text-fg-3">
        {errors.length > 0 ? (
          <span className="min-w-0 text-danger">{errors.join(' · ')}</span>
        ) : duplicate ? (
          <span className="min-w-0 text-warn">
            같은 용어가 있어요: {duplicate.term} — {duplicate.definition.split('\n', 1)[0]}. 그래도 새로 추가하려면 Ctrl+↵를 한 번 더
          </span>
        ) : (
          <span className="min-w-0 truncate">Ctrl+↵ 저장 · Esc 취소 · 이 PC에만 저장돼요</span>
        )}
        <button
          type="button"
          tabIndex={-1}
          disabled={saving}
          onClick={() => void save()}
          className="ml-auto h-7 shrink-0 rounded-control bg-brand px-3 text-small font-semibold text-ink transition-opacity duration-[120ms] hover:opacity-90 disabled:opacity-50"
        >
          Ctrl+↵ {duplicate ? '그래도 추가' : '저장'}
        </button>
      </div>
    </div>
  )
}
