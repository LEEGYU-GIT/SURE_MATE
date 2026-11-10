import { useEffect, useId, useState } from 'react'
import type { MaskTerm } from '../../../shared/masking/dictionary'
import { ENTITY_CATEGORIES, type EntityCategory } from '../../../shared/masking/types'
import { MASK_CATEGORY_LABELS } from '../../../shared/labels'
import { Button, Segmented, TextField } from './controls'

type Draft = { id: string | null; category: EntityCategory; canonical: string; aliases: string }
const EMPTY: Draft = { id: null, category: 'client', canonical: '', aliases: '' }
const CATEGORY_OPTIONS = ENTITY_CATEGORIES.map((c) => ({ value: c, label: MASK_CATEGORY_LABELS[c] }))

/** 별칭 입력(쉼표로 나눔)을 목록으로 */
const aliasList = (text: string): string[] => [...new Set(text.split(',').map((a) => a.trim()).filter(Boolean))]

/**
 * 가명 사전 편집(설계 문서 §8): 고객사·프로젝트·담당자·시스템 이름과 별칭. 바꿀 때마다 사전 전체를 저장하고(main이 다시 검사),
 * 가져오기는 같은 분류·이름을 건너뛰고 더한다. 내보내기 전에는 사내에서만 공유하라고 묻는다(main).
 */
export function DictionaryEditor(): React.JSX.Element {
  const api = window.sureMate.settings
  const [terms, setTerms] = useState<MaskTerm[] | null>(null)
  const [loadErrors, setLoadErrors] = useState<string[]>([])
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const formId = useId()

  const load = async (): Promise<void> => {
    const r = await api.dictionary()
    setTerms(r.terms)
    setLoadErrors(r.errors)
  }
  useEffect(() => {
    void load()
  }, [])

  const saveAll = async (next: MaskTerm[], done: string): Promise<boolean> => {
    const r = await api.dictionarySave(next)
    if (!r.ok) {
      setMessage({ kind: 'error', text: r.errors.join(' · ') })
      return false
    }
    setTerms(next)
    setLoadErrors([])
    setMessage({ kind: 'ok', text: done })
    return true
  }

  const submit = async (): Promise<void> => {
    const canonical = draft.canonical.trim()
    if (!canonical || !terms) return
    const dup = terms.find((t) => t.id !== draft.id && t.category === draft.category && t.canonical.toLowerCase() === canonical.toLowerCase())
    if (dup) {
      setMessage({ kind: 'error', text: `같은 ${MASK_CATEGORY_LABELS[draft.category]} 이름이 있어요` })
      return
    }
    const term: MaskTerm = { id: draft.id ?? `term-${Date.now().toString(36)}`, category: draft.category, canonical, aliases: aliasList(draft.aliases) }
    const next = draft.id ? terms.map((t) => (t.id === draft.id ? { ...t, ...term } : t)) : [...terms, term]
    if (await saveAll(next, draft.id ? '고쳤어요' : '더했어요')) setDraft(EMPTY)
  }

  const fileAction = async (kind: 'import' | 'export'): Promise<void> => {
    const r = kind === 'import' ? await api.dictionaryImport() : await api.dictionaryExport()
    if ('canceled' in r) return
    if (!r.ok) {
      setMessage({ kind: 'error', text: r.errors.join(' · ') })
      return
    }
    if (kind === 'import') {
      const added = 'added' in r ? (r.added ?? 0) : 0
      const skipped = 'skipped' in r ? (r.skipped ?? 0) : 0
      setMessage({ kind: 'ok', text: `${added}개를 더했어요${skipped ? ` · 이미 있는 ${skipped}개는 건너뛰었어요` : ''}` })
      await load()
    } else setMessage({ kind: 'ok', text: '파일로 내보냈어요' })
  }

  if (!terms) return <p className="px-4 py-3 text-small text-fg-2">가명 사전을 읽는 중이에요…</p>
  return (
    <div className="flex flex-col">
      {loadErrors.length ? (
        <p role="alert" className="border-b border-line px-4 py-3 text-small leading-5 text-warn">
          사전 파일에서 읽지 못한 항목이 있어요({loadErrors.length}개). 여기서 저장하면 원래 파일은 사본으로 남겨 둬요.
        </p>
      ) : null}
      {terms.length === 0 ? (
        <p className="border-b border-line px-4 py-3 text-small leading-5 text-fg-2">
          아직 이름이 없어요. 가리고 싶은 고객사·프로젝트·담당자·시스템 이름을 더하세요(예: 가상자동차).
        </p>
      ) : (
        <ul className="flex flex-col">
          {terms.map((t) => (
            <li key={t.id} className="flex items-center gap-4 border-b border-line px-4 py-2.5">
              <span className="w-16 shrink-0 text-small text-fg-2">{MASK_CATEGORY_LABELS[t.category]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-fg">{t.canonical}</span>
                {t.aliases.length ? <span className="block truncate text-small text-fg-2">{t.aliases.join(', ')}</span> : null}
              </span>
              <Button onClick={() => setDraft({ id: t.id, category: t.category, canonical: t.canonical, aliases: t.aliases.join(', ') })}>고치기</Button>
              <Button kind="danger" label={`${t.canonical} 지우기`} onClick={() => void saveAll(terms.filter((x) => x.id !== t.id), '지웠어요')}>
                지우기
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 px-4 py-3" role="group" aria-labelledby={`${formId}-title`}>
        <div id={`${formId}-title`} className="text-body leading-5 text-fg">
          {draft.id ? '이름 고치기' : '이름 더하기'}
        </div>
        <Segmented labelId={`${formId}-title`} value={draft.category} options={CATEGORY_OPTIONS} onChange={(category) => setDraft({ ...draft, category })} />
        <div className="flex flex-wrap items-center gap-2">
          <TextField value={draft.canonical} onChange={(canonical) => setDraft({ ...draft, canonical })} placeholder="정식 이름" width="w-48" maxLength={100} />
          <TextField value={draft.aliases} onChange={(aliases) => setDraft({ ...draft, aliases })} onCommit={() => void submit()} placeholder="별칭(쉼표로 나눔)" width="w-64" />
          <Button kind="primary" disabled={!draft.canonical.trim()} onClick={() => void submit()}>
            {draft.id ? '고친 내용 저장' : '더하기'}
          </Button>
          {draft.id ? <Button onClick={() => setDraft(EMPTY)}>그만두기</Button> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <Button onClick={() => void fileAction('import')}>사전 가져오기</Button>
        <Button onClick={() => void fileAction('export')}>사전 내보내기</Button>
        <p role="status" className={`ml-2 text-small ${message?.kind === 'error' ? 'text-danger' : 'text-fg-2'}`}>
          {message?.text ?? ''}
        </p>
      </div>
    </div>
  )
}
