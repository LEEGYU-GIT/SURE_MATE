import { useEffect, useId, useState } from 'react'
import type { StyleKindView, StyleSampleView } from '../../../shared/ipc-channels'
import { Button, Section } from './controls'

const MIN_CHARS = 20

/** 넣은 날짜(월/일) */
const dayOf = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * 내 말투(설계 §7-1): 종류마다 내가 쓴 글을 견본으로 모으면, 이 PC가 끝맺음·줄 길이·자주 쓰는 끝말을 세어 말투 카드를 만든다.
 * 프롬프트의 {{style:종류}} 자리에는 견본 글이 아니라 이 카드만 들어간다. 'AI 티 지우기'도 이 카드로 끝맺음을 맞춘다.
 */
export function StylePanel(): React.JSX.Element {
  const api = window.sureMate.settings
  const [kinds, setKinds] = useState<StyleKindView[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [samples, setSamples] = useState<StyleSampleView[]>([])
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const id = useId()

  const load = async (): Promise<void> => setKinds(await api.styles())
  useEffect(() => {
    let alive = true
    void api.styles().then((list) => {
      if (alive) setKinds(list)
    })
    return () => {
      alive = false
    }
  }, [api])

  const show = async (kind: string): Promise<void> => {
    setSamples(await api.styleSamples(kind))
    setDraft('')
    setMessage(null)
    setOpen(kind)
  }

  const add = async (): Promise<void> => {
    if (!open) return
    const r = await api.styleAdd(open, draft)
    if (!r.ok) {
      setMessage({ kind: 'error', text: r.reason })
      return
    }
    setMessage({
      kind: 'ok',
      text: r.dropped ? `견본 ${r.count}개 · 가장 오래된 견본은 뺐어요` : `견본 ${r.count}개`
    })
    setDraft('')
    setSamples(await api.styleSamples(open))
    await load()
  }

  const remove = async (index: number): Promise<void> => {
    if (!open) return
    const r = await api.styleRemove(open, index)
    setMessage(r.ok ? { kind: 'ok', text: '지웠어요' } : { kind: 'error', text: '지우지 못했어요' })
    setSamples(await api.styleSamples(open))
    await load()
  }

  if (open) {
    const card = kinds?.find((k) => k.kind === open)?.card ?? []
    const length = [...draft.trim()].length
    return (
      <Section title={`내 말투: ${open}`}>
        <div className="flex flex-col gap-3 px-4 py-3">
          <div>
            <p className="text-small font-semibold text-fg">말투 카드</p>
            {card.length ? (
              <ul className="mt-1 flex flex-col gap-0.5 text-small text-fg">
                {card.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-small text-fg-2">
                견본을 넣으면 끝맺음·한 줄 길이·자주 쓰는 끝말을 세어 여기에 보여 줘요.
              </p>
            )}
            <p className="mt-2 text-small text-fg-2">
              프롬프트에는 견본 글이 아니라 이 카드만 들어가요. 견본은 이 PC 밖으로 나가지 않아요.
            </p>
          </div>

          <div>
            <p className="text-small font-semibold text-fg">견본 {samples.length}개</p>
            {samples.length === 0 ? (
              <p className="mt-1 text-small text-fg-2">
                아직 없어요. 내가 쓴 {open} 글을 아래에 붙여 넣거나, 팔레트에서 글을 고르고 ‘내
                말투로 등록: {open}’을 실행하세요.
              </p>
            ) : null}
            <ul className="mt-1 flex flex-col">
              {samples.map((s, i) => (
                <li
                  key={`${s.addedAt}-${i}`}
                  className="flex items-center gap-3 border-b border-line py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-small text-fg">
                    {s.preview || '(빈 줄)'}
                  </span>
                  <span className="shrink-0 text-small text-fg-2">
                    {dayOf(s.addedAt)} · {s.length.toLocaleString('ko-KR')}자
                  </span>
                  <Button
                    kind="danger"
                    label={`${i + 1}번째 견본 지우기`}
                    onClick={() => void remove(i)}
                  >
                    지우기
                  </Button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-sample`} className="text-small text-fg-2">
              내가 쓴 {open} 하나를 붙여 넣으세요. AI가 쓴 글은 넣지 마세요(20자 넘게, 8,000자까지)
            </label>
            <textarea
              id={`${id}-sample`}
              value={draft}
              rows={6}
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-32 resize-y rounded-control border border-line bg-surface-inset px-3 py-2 text-body leading-6 text-fg select-text"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button kind="primary" disabled={length < MIN_CHARS} onClick={() => void add()}>
                견본으로 넣기
              </Button>
              <Button onClick={() => setOpen(null)}>닫기</Button>
              <p
                role="status"
                className={`ml-2 text-small ${message?.kind === 'error' ? 'text-danger' : 'text-fg-2'}`}
              >
                {message?.text ?? ''}
              </p>
            </div>
          </div>
        </div>
      </Section>
    )
  }

  return (
    <Section title="내 말투">
      <p className="border-b border-line px-4 py-3 text-small text-fg-2">
        내가 쓴 글을 종류별 견본으로 모으면 끝맺음·줄 길이·자주 쓰는 끝말을 세어 AI에게 ‘이 말투로
        써 줘’라고 함께 보내요. AI 답을 복사한 뒤 팔레트에서 ‘AI 티 지우기’를 실행하면 끝맺음과
        군더더기도 이 말투로 고쳐요.
      </p>
      {!kinds ? <p className="px-4 py-3 text-small text-fg-2">읽는 중이에요…</p> : null}
      {kinds?.length === 0 ? (
        <p className="border-b border-line px-4 py-3 text-small text-fg-2">
          템플릿 본문에 {'{{style:종류}}'}를 넣으면 여기에 나타나요.
        </p>
      ) : null}
      {kinds?.map((k) => (
        <div key={k.kind} className="flex items-center gap-4 border-b border-line px-4 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body text-fg">{k.kind}</span>
            <span className="block truncate text-small text-fg-2">
              {k.samples
                ? `견본 ${k.samples}개${k.card[0] ? ` · ${k.card[0]}` : ''}`
                : '견본 없음 · 이 자리는 프롬프트에서 빠져요'}
              {k.usedBy.length ? ` · ${k.usedBy.join(', ')}에서 씀` : ''}
            </span>
          </span>
          <Button
            label={`${k.kind} 말투 ${k.samples ? '보기' : '견본 넣기'}`}
            onClick={() => void show(k.kind)}
          >
            {k.samples ? '보기' : '견본 넣기'}
          </Button>
        </div>
      ))}
    </Section>
  )
}
