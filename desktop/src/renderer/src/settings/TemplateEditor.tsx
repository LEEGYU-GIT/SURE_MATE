import { useId, useMemo, useRef, useState } from 'react'
import type { TemplateDraft } from '../../../shared/ipc-channels'
import { maskingModeLabel } from '../../../shared/labels'
import type { Template, TemplateMasking } from '../../../shared/template/types'
import { Button, RadioList, Segmented, TextField } from './controls'
import { insertPlaceholder, PLACEHOLDERS, previewTemplate, type TemplateSource } from './template-editor'
import { useSettingsCtx } from './use-settings'

const MASKING_OPTIONS: { value: TemplateMasking; label: string }[] = [
  { value: 'default', label: '설정 따름' },
  { value: 'off', label: maskingModeLabel('off') },
  { value: 'restore', label: maskingModeLabel('restore') },
  { value: 'remove', label: maskingModeLabel('remove') }
]

type Form = { name: string; kind: Template['kind']; aliases: string; group: string; description: string; body: string; masking: TemplateMasking; aiTarget: string }

const toForm = (t: Template | null): Form => ({
  name: t?.name ?? '',
  kind: t?.kind ?? 'prompt',
  aliases: t?.aliases.join(', ') ?? '',
  group: t?.group ?? '',
  description: t?.description ?? '',
  body: t?.body ?? '{{selection}}',
  masking: t?.masking ?? 'default',
  aiTarget: t?.aiTarget ?? ''
})

/**
 * 템플릿 편집기(설계 문서 §14): 이름·종류·별칭·묶음·설명·본문, 자리표시자 단추(커서 자리에 넣음), 가명 처리 기본값·AI 대상(프롬프트만),
 * 가짜 입력으로 채운 미리 보기. 기본 템플릿은 같은 id로 내 파일에 덮고, 다른 파일의 템플릿은 새 id로 복사한다.
 */
export function TemplateEditor({
  template,
  source,
  onDone
}: {
  /** null이면 새 템플릿 */
  template: Template | null
  source: TemplateSource | null
  /** 저장·지우기·그만두기 뒤 목록으로(changed: 목록을 다시 읽음) */
  onDone(changed: boolean): void
}): React.JSX.Element {
  const { snapshot } = useSettingsCtx()
  const api = window.sureMate.settings
  const [form, setForm] = useState<Form>(() => toForm(template))
  const [errors, setErrors] = useState<string[]>([])
  const [leaving, setLeaving] = useState(false)
  const body = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const initial = useMemo(() => toForm(template), [template])
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const preview = useMemo(() => previewTemplate(form.body), [form.body])
  // 다른 파일의 템플릿은 복사본(새 id)으로, 기본·내 것은 같은 id로 저장
  const keepId = template && source !== 'other' ? template.id : undefined

  const insert = (token: string): void => {
    const el = body.current
    const r = insertPlaceholder(form.body, el?.selectionStart ?? form.body.length, el?.selectionEnd ?? form.body.length, token)
    setForm({ ...form, body: r.body })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(r.caret, r.caret)
    })
  }

  const save = async (): Promise<void> => {
    const draft: TemplateDraft = {
      ...(keepId ? { id: keepId } : {}),
      name: form.name.trim(),
      kind: form.kind,
      aliases: form.aliases.split(',').map((a) => a.trim()).filter(Boolean),
      group: form.group.trim() || undefined,
      description: form.description.trim() || undefined,
      body: form.body,
      ...(form.kind === 'prompt' ? { masking: form.masking, aiTarget: form.aiTarget || undefined } : {})
    }
    const r = await api.templateSave(draft)
    if (r.ok) onDone(true)
    else setErrors(r.errors)
  }

  const remove = async (): Promise<void> => {
    if (!template) return
    const r = await api.templateDelete(template.id)
    if (r.ok) onDone(true)
    else setErrors([r.reason])
  }

  const back = (): void => {
    if (dirty && !leaving) setLeaving(true)
    else onDone(false)
  }

  const title = !template ? '새 템플릿' : source === 'other' ? `${template.name} 복사해서 고치기` : `${template.name} 고치기`
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button onClick={back} label="목록으로">
          ‹ 목록
        </Button>
        <h3 className="text-body font-semibold text-fg">{title}</h3>
      </div>
      {leaving ? (
        <div role="alert" className="flex items-center gap-3 rounded-window bg-warn/10 px-4 py-3 text-small text-fg">
          저장하지 않은 내용이 있어요. 버리고 목록으로 갈까요?
          <span className="ml-auto flex gap-2">
            <Button kind="danger" onClick={() => onDone(false)}>
              버리기
            </Button>
            <Button onClick={() => setLeaving(false)}>계속 고치기</Button>
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-x-4 gap-y-3">
        <label htmlFor={`${id}-name`} className="text-small text-fg-2">
          이름
        </label>
        <input
          id={`${id}-name`}
          value={form.name}
          maxLength={40}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="h-8 rounded-control border border-line bg-surface-inset px-2.5 text-body text-fg"
        />
        <span id={`${id}-kind`} className="text-small text-fg-2">
          종류
        </span>
        <Segmented<Template['kind']>
          labelId={`${id}-kind`}
          value={form.kind}
          options={[
            { value: 'prompt', label: '프롬프트(AI에 붙여 넣기)' },
            { value: 'snippet', label: '상용구(바로 붙여 넣기)' }
          ]}
          onChange={(kind) => setForm({ ...form, kind })}
        />
        <span id={`${id}-aliases`} className="text-small text-fg-2">
          별칭
        </span>
        <TextField labelId={`${id}-aliases`} value={form.aliases} onChange={(aliases) => setForm({ ...form, aliases })} placeholder="쉼표로 나눔 (팔레트 검색에 쓰여요)" width="w-full" />
        <span id={`${id}-group`} className="text-small text-fg-2">
          묶음
        </span>
        <TextField labelId={`${id}-group`} value={form.group} onChange={(group) => setForm({ ...form, group })} placeholder="회의·문서·검증 등(없어도 돼요)" width="w-64" maxLength={20} />
        <span id={`${id}-desc`} className="text-small text-fg-2">
          설명
        </span>
        <TextField labelId={`${id}-desc`} value={form.description} onChange={(description) => setForm({ ...form, description })} placeholder="팔레트 목록에 보일 한 줄" width="w-full" maxLength={80} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${id}-body`} className="mr-2 text-small text-fg-2">
            본문
          </label>
          {PLACEHOLDERS.map((p) => (
            <button
              key={p.token}
              type="button"
              onClick={() => insert(p.token)}
              title={p.token}
              className="h-7 rounded-control border border-line px-2 text-caption text-fg-2 hover:bg-row-hover hover:text-fg"
            >
              + {p.label}
            </button>
          ))}
        </div>
        <textarea
          id={`${id}-body`}
          ref={body}
          value={form.body}
          rows={10}
          spellCheck={false}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          className="min-h-48 resize-y rounded-control border border-line bg-surface-inset px-3 py-2 text-body leading-6 text-fg select-text"
        />
      </div>

      {form.kind === 'prompt' ? (
        <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-x-4 gap-y-3">
          <span id={`${id}-mask`} className="pt-1.5 text-small text-fg-2">
            가명 처리
          </span>
          <Segmented<TemplateMasking> labelId={`${id}-mask`} value={form.masking} options={MASKING_OPTIONS} onChange={(masking) => setForm({ ...form, masking })} />
          <span id={`${id}-ai`} className="pt-2 text-small text-fg-2">
            AI 대상
          </span>
          <RadioList
            labelId={`${id}-ai`}
            value={form.aiTarget}
            options={[{ value: '', label: '설정의 기본 대상' }, ...snapshot.aiTargets.map((t) => ({ value: t.id, label: t.name }))]}
            onChange={(aiTarget) => setForm({ ...form, aiTarget })}
          />
        </div>
      ) : null}

      <section aria-labelledby={`${id}-preview`} className="flex flex-col gap-2">
        <h4 id={`${id}-preview`} className="text-caption font-semibold text-fg-2">
          미리 보기(가상 회의 메모를 넣은 모습)
        </h4>
        <pre className="max-h-56 overflow-auto rounded-window bg-surface-inset px-3 py-2 font-ui text-small leading-5 whitespace-pre-wrap text-fg-2 select-text">{preview.text}</pre>
        {preview.warnings.length ? (
          <ul className="text-small text-warn">
            {preview.warnings.map((w) => (
              <li key={w}>· {w}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {errors.length ? (
        <p role="alert" className="text-small text-danger">
          {errors.join(' · ')}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button kind="primary" disabled={!form.name.trim() || !form.body.trim()} onClick={() => void save()}>
          저장
        </Button>
        <Button onClick={back}>그만두기</Button>
        {template && source === 'builtin-edited' ? (
          <Button kind="danger" onClick={() => void remove()}>
            기본값으로 되돌리기
          </Button>
        ) : null}
        {template && source === 'mine' ? (
          <Button kind="danger" onClick={() => void remove()}>
            지우기
          </Button>
        ) : null}
      </div>
    </div>
  )
}
