import { useEffect, useMemo, useState } from 'react'
import type { Template } from '../../../shared/template/types'
import { Button, Section, TextField } from './controls'
import { templateSource, type TemplateSource } from './template-editor'
import { ReferencesPanel } from './ReferencesPanel'
import { StylePanel } from './StylePanel'
import { TemplateEditor } from './TemplateEditor'

const SOURCE_LABEL: Record<TemplateSource, string> = {
  builtin: '기본',
  'builtin-edited': '기본을 고침',
  mine: '내 것',
  other: '다른 파일'
}

type Listing = { templates: Template[]; mine: Set<string>; builtinIds: Set<string>; errors: string[] }

/** 프롬프트·상용구(설계 문서 §14): 목록(출처 표시·검색)과 편집기, 템플릿 팩 가져오기·내보내기, 기준 예시 문서 */
export function PromptsTab(): React.JSX.Element {
  const api = window.sureMate.settings
  const [list, setList] = useState<Listing | null>(null)
  const [editing, setEditing] = useState<{ template: Template | null } | null>(null)
  const [query, setQuery] = useState('')
  const [fileMessage, setFileMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const packAction = async (kind: 'import' | 'export'): Promise<void> => {
    const r = kind === 'import' ? await api.templateImport() : await api.templateExport()
    if ('canceled' in r) return
    if (!r.ok) setFileMessage({ kind: 'error', text: r.errors.join(' · ') })
    else if (kind === 'export') setFileMessage({ kind: 'ok', text: '내 템플릿을 파일로 내보냈어요' })
    else {
      const added = 'added' in r ? (r.added ?? 0) : 0
      const replaced = 'replaced' in r ? (r.replaced ?? 0) : 0
      setFileMessage({ kind: 'ok', text: `${added}개를 더했어요${replaced ? ` · 같은 id ${replaced}개는 가져온 것으로 바뀌었어요` : ''}` })
      await load()
    }
  }

  const load = async (): Promise<void> => {
    const r = await api.templates()
    setList({ templates: r.templates, mine: new Set(r.mine), builtinIds: new Set(r.builtinIds), errors: r.errors })
  }
  useEffect(() => {
    void load()
  }, [])

  const shown = useMemo(() => {
    if (!list) return []
    const q = query.trim().toLowerCase()
    return list.templates.filter((t) => !q || t.name.toLowerCase().includes(q) || t.aliases.some((a) => a.toLowerCase().includes(q)))
  }, [list, query])

  if (!list) return <p className="text-small text-fg-2">템플릿을 읽는 중이에요…</p>
  if (editing) {
    const source = editing.template ? templateSource(editing.template, list.mine, list.builtinIds) : null
    return (
      <TemplateEditor
        template={editing.template}
        source={source}
        onDone={(changed) => {
          setEditing(null)
          if (changed) void load()
        }}
      />
    )
  }

  const group = (kind: Template['kind'], title: string): React.JSX.Element => {
    const items = shown.filter((t) => t.kind === kind)
    return (
      <Section title={`${title} (${items.length})`}>
        {items.length === 0 ? <p className="px-4 py-3 text-small text-fg-2">맞는 {title}가 없어요.</p> : null}
        {items.map((t) => {
          const source = templateSource(t, list.mine, list.builtinIds)
          return (
            <div key={t.id} className="flex items-center gap-4 border-b border-line px-4 py-2.5 last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-fg">{t.name}</span>
                {t.description ? <span className="block truncate text-small text-fg-2">{t.description}</span> : null}
              </span>
              <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-caption text-fg-2">{SOURCE_LABEL[source]}</span>
              <Button label={`${t.name} ${source === 'other' ? '복사해서 고치기' : '고치기'}`} onClick={() => setEditing({ template: t })}>
                {source === 'other' ? '복사해서 고치기' : '고치기'}
              </Button>
            </div>
          )
        })}
      </Section>
    )
  }

  return (
    <>
      {list.errors.length ? (
        <p role="alert" className="rounded-window bg-warn/10 px-4 py-3 text-small text-fg">
          내 템플릿 파일에서 읽지 못한 항목이 있어요. 여기서 저장하면 원래 파일은 사본으로 남겨 둬요.
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <TextField value={query} onChange={setQuery} placeholder="이름·별칭으로 찾기" width="w-64" />
        <span className="ml-auto" />
        <Button kind="primary" onClick={() => setEditing({ template: null })}>
          새 템플릿
        </Button>
      </div>
      {group('prompt', '프롬프트')}
      {group('snippet', '상용구')}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void packAction('import')}>템플릿 팩 가져오기</Button>
        <Button onClick={() => void packAction('export')}>내 템플릿 내보내기</Button>
        <p role="status" className={`ml-2 text-small ${fileMessage?.kind === 'error' ? 'text-danger' : 'text-fg-2'}`}>
          {fileMessage?.text ?? ''}
        </p>
      </div>
      <ReferencesPanel />
      <StylePanel />
    </>
  )
}
