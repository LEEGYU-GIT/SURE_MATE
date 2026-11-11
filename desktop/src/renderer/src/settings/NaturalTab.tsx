import { useCallback, useEffect, useRef, useState, type Ref } from 'react'
import type { NaturalChangeResult, NaturalOpenResult, NaturalView, PhraseRow } from '../../../shared/natural/natural-ipc'
import { NATURAL_NOTES } from '../../../shared/natural/natural-view'
import { ArrowRightIcon, CornerDownRightIcon, TriangleAlertIcon } from '../design/icons'
import { Button, ConfirmButton, type Notice, NoticeLine, Row, Section } from './controls'
import { focusAfterRemove, intentFileNotice, NATURAL_COPY as COPY, newerView, phraseTarget, targetText } from './natural-tab-state'

/** 키 모양(팔레트의 '기억하고 실행' 안내와 같은 모양) */
const KEY = 'inline-flex h-5 items-center rounded-control border border-line px-1.5 align-middle font-ui text-caption text-fg-2'

/** 다시 그린 뒤 포커스를 둘 곳(누른 단추가 사라져도 포커스를 잃지 않게, 키보드만으로 사용 §16) */
type FocusPlan = { kind: 'row'; before: string[]; removed: string } | { kind: 'empty' } | { kind: 'usage' }

/**
 * 말하듯 입력(설계 §13 8단계·§14 "말하듯 입력(단어 목록, 학습 내용)"): 기억한 문장(보기·하나 지우기·모두 지우기), 사용 기록(지우기),
 * 단어 목록(어느 목록을 쓰는지·파일 열기, 의도 단어 보기). 문장은 이 화면에만 보이고 로그에는 남지 않는다.
 * 지운 내용은 팔레트의 다음 검색부터 빠진다(main이 저장소를 바로 바꾸고, 팔레트는 보일 때마다 검색 문맥을 새로 받는다).
 */
export function NaturalTab(): React.JSX.Element {
  const api = window.sureMate
  const [view, setView] = useState<NaturalView | null>(null)
  const [failed, setFailed] = useState(false)
  const [phraseNotice, setPhraseNotice] = useState<Notice | null>(null)
  const [usageNotice, setUsageNotice] = useState<Notice | null>(null)
  const [openNotice, setOpenNotice] = useState<Notice | null>(null)
  const [opening, setOpening] = useState(false)
  const [focusTick, setFocusTick] = useState(0)
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const emptyRef = useRef<HTMLDivElement>(null)
  const usageNoticeRef = useRef<HTMLParagraphElement>(null)
  const focusPlan = useRef<FocusPlan | null>(null)
  const forgetting = useRef(false)

  /** rev가 작은 보기(지우기 전에 만든 바뀜 알림)는 버린다 */
  const accept = useCallback((v: NaturalView) => setView((prev) => newerView(prev, v)), [])

  const refresh = useCallback(async (): Promise<void> => {
    const v = await window.sureMate.naturalView().catch(() => null)
    if (v) accept(v)
    setFailed(v === null)
  }, [accept])

  useEffect(() => {
    // 구독을 먼저 걸고 읽는다(그 사이 바뀐 보기를 놓치지 않게)
    const off = window.sureMate.onNaturalChanged(accept)
    void refresh()
    // 단어 목록 파일을 고치고 돌아오면 바뀐 목록과 읽기 문제를 보인다
    const onFocus = (): void => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      off()
      window.removeEventListener('focus', onFocus)
    }
  }, [accept, refresh])

  // 다시 그린 뒤 포커스: 지운 줄 자리에 온 줄의 지우기 단추, 남은 줄이 없으면 빈 화면 안내, 사용 기록을 지웠으면 결과 줄
  useEffect(() => {
    const plan = focusPlan.current
    if (!plan || !view) return
    focusPlan.current = null
    if (plan.kind === 'usage') {
      usageNoticeRef.current?.focus()
      return
    }
    const keys = view.phrases.map((p) => p.key)
    const target = plan.kind === 'row' ? focusAfterRemove(plan.before, plan.removed, keys) : null
    const el = target ? rowRefs.current.get(target) : (emptyRef.current ?? rowRefs.current.get(keys[0] ?? ''))
    el?.focus()
  }, [view, focusTick])

  const focusAfter = (plan: FocusPlan): void => {
    focusPlan.current = plan
    setFocusTick((t) => t + 1)
  }

  const forget = async (row: PhraseRow): Promise<void> => {
    if (forgetting.current || !view) return
    forgetting.current = true
    const before = view.phrases.map((p) => p.key)
    setPhraseNotice(null)
    const r = await api.forgetPhrase(row.key).catch((): NaturalChangeResult => ({ ok: false }))
    forgetting.current = false
    if (!r.ok) {
      setPhraseNotice({ tone: 'error', text: COPY.removeFailed })
      return
    }
    accept(r.view)
    if (r.count > 0) setPhraseNotice({ tone: 'ok', text: COPY.forgot(row.key) })
    focusAfter({ kind: 'row', before, removed: row.key })
  }

  const forgetAll = async (): Promise<void> => {
    const r = await api.forgetAllPhrases().catch((): NaturalChangeResult => ({ ok: false }))
    if (!r.ok) {
      setPhraseNotice({ tone: 'error', text: COPY.removeFailed })
      return
    }
    accept(r.view)
    setPhraseNotice({ tone: 'ok', text: COPY.forgotAll(r.count) })
    focusAfter({ kind: 'empty' })
  }

  const clearUsage = async (): Promise<void> => {
    const r = await api.clearUsage().catch((): NaturalChangeResult => ({ ok: false }))
    if (!r.ok) {
      setUsageNotice({ tone: 'error', text: COPY.removeFailed })
      return
    }
    accept(r.view)
    setUsageNotice({ tone: 'ok', text: COPY.clearedUsage(r.count) })
    // 지우면 단추를 쓸 수 없게 되므로 결과 줄로 포커스를 옮긴다
    focusAfter({ kind: 'usage' })
  }

  const openIntents = async (): Promise<void> => {
    setOpening(true)
    setOpenNotice(null)
    const r = await api.openIntentsFile().catch((): NaturalOpenResult => ({ ok: false }))
    setOpening(false)
    if (!r.ok) setOpenNotice({ tone: 'error', text: COPY.openFailed })
    else if (!r.opened) setOpenNotice({ tone: 'warn', text: NATURAL_NOTES.openFallback })
    // 처음 열면 기본 목록을 복사한 파일이 생겨 '내 파일'이 된다
    await refresh()
  }

  if (!view) {
    if (!failed) return <p className="text-small text-fg-2">{COPY.loading}</p>
    return (
      <div className="flex flex-col items-start gap-3">
        <NoticeLine notice={{ tone: 'error', text: COPY.loadFailed }} />
        <Button onClick={() => void refresh()}>{COPY.retry}</Button>
      </div>
    )
  }

  const count = view.phrases.length
  const intents = view.intents
  const fileNotice = intentFileNotice(intents)

  return (
    <>
      <p className="text-small leading-5 text-balance break-keep text-fg-2">{COPY.intro}</p>

      <Section
        title={COPY.phrasesTitle(count, view.phraseMax)}
        aside={
          count > 0 ? (
            <ConfirmButton armed={COPY.forgetAllArmed} context={COPY.forgetAllContext} onArm={() => setPhraseNotice(null)} onConfirm={forgetAll}>
              {COPY.forgetAll}
            </ConfirmButton>
          ) : null
        }
      >
        {count === 0 ? (
          <EmptyPhrases ref={emptyRef} notice={phraseNotice} />
        ) : (
          <>
            <div className="flex flex-col gap-1 border-b border-line px-4 py-3">
              <p className="text-small leading-5 text-balance break-keep text-fg-2">
                <Lines lines={COPY.phrasesHelp} />
              </p>
              {phraseNotice ? <NoticeLine notice={phraseNotice} /> : null}
            </div>
            <ul aria-label={COPY.phrasesList}>
              {view.phrases.map((row) => (
                <PhraseItem
                  key={row.key}
                  row={row}
                  ref={(el) => {
                    if (el) rowRefs.current.set(row.key, el)
                    else rowRefs.current.delete(row.key)
                  }}
                  onForget={() => void forget(row)}
                />
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title={COPY.usageTitle}>
        <Row label={COPY.usageLabel(view.usageCount)} description={<Lines lines={COPY.usageHelp} />}>
          {(ids) => (
            <ConfirmButton
              armed={COPY.clearUsageArmed}
              describedBy={ids.descId}
              disabled={view.usageCount === 0}
              onArm={() => setUsageNotice(null)}
              onConfirm={clearUsage}
            >
              {COPY.clearUsage}
            </ConfirmButton>
          )}
        </Row>
        {usageNotice ? <NoticeLine ref={usageNoticeRef} tabIndex={-1} notice={usageNotice} className="px-4 py-3" /> : null}
      </Section>

      <Section title={COPY.intentsTitle}>
        <Row
          label={intents.source === 'user' ? COPY.sourceUser : COPY.sourceBuiltin}
          // 실제 경로(사용자 이름이 있다) 대신 %APPDATA% 꼴. 탐색기 주소 칸에 붙여 넣을 수 있게 고를 수 있다
          description={
            <span data-intents-path className="font-ui select-text selection:bg-brand/30 selection:text-fg">
              {COPY.path}
            </span>
          }
        >
          {() => (
            <Button disabled={opening} onClick={() => void openIntents()}>
              {opening ? COPY.opening : COPY.open}
            </Button>
          )}
        </Row>
        {/* 단추를 누른 결과는 단추 줄 바로 아래, 파일 문제(계속 있는 상태)는 그 아래 */}
        {openNotice ? <NoticeLine notice={openNotice} className="border-b border-line px-4 py-3" /> : null}
        {/* 아래 안내 줄의 위쪽 여백(12)과 합쳐 위아래가 같게 아래 여백은 두지 않는다 */}
        {fileNotice ? (
          <div role="status" className="mx-4 mt-3 flex items-start gap-2 rounded-window border border-warn/35 bg-warn/10 px-3 py-2.5 text-small leading-5 break-keep">
            <TriangleAlertIcon size={16} className="mt-0.5 shrink-0 text-warn" />
            <span className="min-w-0">
              <span className="block text-warn">{fileNotice.text}</span>
              <span className="block text-fg-2">{fileNotice.details}</span>
            </span>
          </div>
        ) : null}
        {/* 뜻 단위로 줄을 바꾼다(파일이 아직 없다는 말과 고친 내용이 언제 쓰이는지) */}
        <p className="border-b border-line px-4 py-3 text-small leading-5 text-balance break-keep text-fg-2">
          {intents.source === 'builtin' && !fileNotice ? <span className="block">{COPY.noFileYet}</span> : null}
          <Lines lines={COPY.applyWhen} />
        </p>
        <Row label={COPY.stripLabel} description={COPY.stripCounts(intents.endings, intents.particles, intents.fillers)}>
          {() => null}
        </Row>
      </Section>

      <Section title={COPY.rulesTitle(intents.rules.length)}>
        <p className="border-b border-line px-4 py-3 text-small leading-5 text-balance break-keep text-fg-2">{COPY.rulesHelp}</p>
        <ul aria-label={COPY.rulesTitle(intents.rules.length)}>
          {intents.rules.map((rule) => {
            const target = targetText(rule.targets)
            return (
              <li key={rule.id} className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0">
                <p className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-body leading-5 text-fg">{rule.label}</span>
                  <ArrowRightIcon size={14} className="shrink-0 text-fg-3" />
                  <span className="sr-only">{COPY.ruleTargetSr}</span>
                  <span className={`min-w-0 truncate text-small leading-5 ${target === COPY.missingTarget ? 'text-fg-3' : 'text-fg-2'}`}>{target}</span>
                </p>
                {rule.words.length > 0 ? (
                  <ul aria-label={COPY.wordsLabel(rule.label)} className="flex flex-wrap gap-1.5">
                    {rule.words.map((w) => (
                      <li key={w} className="rounded-full border border-line px-2 text-caption leading-5 whitespace-nowrap text-fg-2">
                        {w}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-small leading-5 text-fg-3">{COPY.noWords}</p>
                )}
              </li>
            )
          })}
        </ul>
      </Section>
    </>
  )
}

/** 기억한 문장 한 줄: 문장(공백·끝 기호를 뺀 모양 그대로), 그 아래 이 문장이 맨 위로 올리는 항목(지금 없으면 흐린 글), 지우기 */
function PhraseItem({ row, onForget, ref }: { row: PhraseRow; onForget(): void; ref: Ref<HTMLButtonElement> }): React.JSX.Element {
  return (
    <li className="flex items-center gap-4 border-b border-line px-4 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-body leading-5 wrap-anywhere text-fg">{row.key}</p>
        <p className={`mt-0.5 flex min-w-0 items-center gap-1.5 text-small leading-5 ${row.item ? 'text-fg-2' : 'text-fg-3'}`}>
          <CornerDownRightIcon size={14} className="shrink-0 text-fg-3" />
          {row.item ? <span className="sr-only">{COPY.targetSr}</span> : null}
          <span className="min-w-0 truncate">{phraseTarget(row)}</span>
        </p>
      </div>
      <Button ref={ref} kind="danger" label={COPY.forgetLabel(row.key)} onClick={onForget}>
        {COPY.forget}
      </Button>
    </li>
  )
}

/** 기억한 문장이 없을 때: 가르치는 방법(팔레트 Shift+Enter '기억하고 실행'). 모두 지운 뒤 포커스가 여기로 온다 */
function EmptyPhrases({ notice, ref }: { notice: Notice | null; ref: Ref<HTMLDivElement> }): React.JSX.Element {
  return (
    <div ref={ref} tabIndex={-1} className="flex flex-col gap-1 rounded-window px-4 py-4">
      {notice ? <NoticeLine notice={notice} className="mb-1" /> : null}
      <p className="text-body leading-5 font-semibold text-fg">{COPY.emptyTitle}</p>
      <p className="text-small leading-6 text-balance break-keep text-fg-2">
        <span className="block">
          {COPY.emptyHow[0]} <kbd className={KEY}>Shift</kbd> <kbd className={KEY}>Enter</kbd>
          {COPY.emptyHow[1]}
        </span>
        <span className="block">{COPY.emptyThen}</span>
      </p>
    </div>
  )
}

/** 뜻 단위로 줄을 바꾼 안내(한 줄이 넘치면 그 안에서만 줄이 바뀐다) */
function Lines({ lines }: { lines: readonly string[] }): React.JSX.Element {
  return (
    <>
      {lines.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
    </>
  )
}
