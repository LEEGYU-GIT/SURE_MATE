import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { withObjectParticle } from '../../../shared/josa'
import type { MaskTerm } from '../../../shared/masking/dictionary'
import type { SettingsSnapshot } from '../../../shared/settings/settings-snapshot'
import { ArrowRightIcon, CheckIcon } from '../design/icons'
import { Button, NoticeLine } from '../settings/controls'
import { BigButton, GuideFrame, Keycap, StepMarker, StepTitle } from './parts'
import {
  TRY_MEMO,
  tryDoneText,
  tryExpectation,
  tryNextSteps,
  tryTarget,
  type TrySwap
} from './try-guide'

/** 그 말 뒤의 을/를만(키 이름 뒤에 붙인다) */
const objectParticle = (word: string): string => withObjectParticle(word).slice(word.length)

/**
 * #/try 30초 따라 해 보기(설계 문서 §6·§7, 2026-11-12 사용자 확인으로 첫 실행 안내에서 빼 따로 연다: 트레이 "따라 해 보기", 팔레트 명령
 * "따라 해 보기 (30초)"). 메모를 미리 선택해 두면 팔레트가 이 창(설정 창: 팔레트가 돌아갈 창으로 기억한다)에서 선택한 글을 가져간다.
 * 복사할 필요가 없다. 키 순서는 실제 팔레트 단축키·가명 처리 설정·기본 AI로 쓰고, 바뀌는 예는 지금 가명 사전·설정으로 계산한다
 * (처음 설치하면 사전이 비어 회사 이름은 그대로고 IP가 바뀐다). 회의록 정리 프롬프트를 실행하면(main의 onboarding:progress) 해냄 화면.
 * start: 미리 보기 장면이 해냄 화면을 바로 그릴 때만 쓴다
 */
export function TryScreen({ start }: { start?: { tried?: boolean } } = {}): React.JSX.Element {
  const api = window.sureMate.settings
  const [snap, setSnap] = useState<SettingsSnapshot | null>(null)
  const [terms, setTerms] = useState<MaskTerm[]>([])
  const [tried, setTried] = useState(start?.tried ?? false)
  /** 메모가 선택돼 있는지. 처음 확인하기 전(null)에는 상태를 보이지 않는다(선택하기 직전 "풀렸어요"가 잠깐 보이지 않게) */
  const [selected, setSelected] = useState<boolean | null>(null)
  const memo = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let live = true
    void api.get().then((s) => {
      if (s && live) setSnap(s)
    })
    void api
      .dictionary()
      .then((d) => {
        if (live) setTerms(d.terms)
      })
      .catch(() => {})
    const offChanged = api.onChanged((s) => {
      if (live) setSnap(s)
    })
    // 회의록 정리를 실행했다(어디서 실행했든 main이 이 창에 알린다)
    const offProgress = api.onOnboardingProgress((p) => {
      if (live && p.kind === 'prompt') setTried(true)
    })
    return () => {
      live = false
      offChanged()
      offProgress()
    }
  }, [api])

  // 메모가 선택돼 있는지(창을 누르면 선택이 풀릴 수 있다): 메모 안에 비어 있지 않은 선택이 있으면 선택됨
  useEffect(() => {
    const check = (): void => {
      const el = memo.current
      const s = document.getSelection()
      setSelected(
        Boolean(
          el &&
          s &&
          !s.isCollapsed &&
          s.anchorNode &&
          s.focusNode &&
          el.contains(s.anchorNode) &&
          el.contains(s.focusNode)
        )
      )
    }
    document.addEventListener('selectionchange', check)
    return () => document.removeEventListener('selectionchange', check)
  }, [])

  const selectMemo = (): void => {
    const el = memo.current
    const s = document.getSelection()
    if (!el || !s) return
    s.removeAllRanges()
    const range = document.createRange()
    range.selectNodeContents(el)
    s.addRange(range)
  }

  const footer = tried ? (
    <>
      <span className="ml-auto" />
      <BigButton kind="secondary" onClick={() => setTried(false)}>
        다시 해 보기
      </BigButton>
      <BigButton onClick={() => window.close()}>닫기</BigButton>
    </>
  ) : (
    <>
      <span className="ml-auto" />
      <BigButton kind="secondary" onClick={() => window.close()}>
        닫기
      </BigButton>
    </>
  )

  return (
    <GuideFrame
      name="Sure-Mate 따라 해 보기"
      screenKey={snap ? (tried ? 'done' : 'try') : 'loading'}
      // 제목으로 포커스를 옮긴 다음 메모를 선택한다(선택이 남는다)
      onShown={() => {
        if (snap && !tried) selectMemo()
      }}
      footer={footer}
    >
      {snap ? (
        <TryBody
          snap={snap}
          terms={terms}
          tried={tried}
          selected={selected}
          memo={memo}
          onReselect={selectMemo}
        />
      ) : (
        <p className="text-small text-fg-2">준비하는 중이에요…</p>
      )}
    </GuideFrame>
  )
}

function TryBody({
  snap,
  terms,
  tried,
  selected,
  memo,
  onReselect
}: {
  snap: SettingsSnapshot
  terms: MaskTerm[]
  tried: boolean
  selected: boolean | null
  memo: React.RefObject<HTMLPreElement | null>
  onReselect(): void
}): React.JSX.Element {
  const s = snap.settings
  const mode = s.masking.mode
  const target = tryTarget({ defaultTarget: s.ai.defaultTarget, targets: snap.aiTargets })
  const hotkey = snap.hotkeys.palette.registered ? snap.hotkeys.palette.acc : null
  const swap = tryExpectation({ terms, masking: s.masking })
  const reacts = s.pet.visible && s.pet.reactions
  return (
    <>
      {tried ? (
        <StepTitle title="해냈어요! 프롬프트를 복사했어요">{tryDoneText({ mode, swap })}</StepTitle>
      ) : (
        <StepTitle title="메모로 AI 프롬프트를 만들어 보세요">
          아래 메모가 파랗게 선택돼 있어요. 복사하지 않아도 돼요. Sure-Mate가 선택한 글을 직접
          가져가요.
        </StepTitle>
      )}
      <div className="grid grid-cols-1 gap-6 @min-[600px]:grid-cols-[minmax(0,1fr)_296px]">
        {tried ? (
          <section aria-labelledby="try-next" className="guide-reveal flex flex-col gap-3">
            <h2 id="try-next" className="text-caption leading-4 font-semibold text-fg-2">
              다음에 할 일
            </h2>
            <ol className="flex flex-col gap-3">
              {tryNextSteps({ mode, target, swap }).map((line, i) => (
                <li key={line} className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3">
                  <StepMarker n={i + 1} state="plain" />
                  <p className="text-body leading-6 break-keep text-fg">{line}</p>
                </li>
              ))}
            </ol>
            {reacts ? (
              <p className="text-small leading-5 text-fg-2">
                말랑 메이트도 편지를 들고 폴짝 뛰었을 거예요.
              </p>
            ) : null}
          </section>
        ) : (
          <ol className="flex flex-col gap-4">
            <KeyStep
              n={1}
              note={
                hotkey ? undefined : (
                  <NoticeLine
                    notice={{
                      tone: 'warn',
                      text: '팔레트 단축키가 등록돼 있지 않아요. 설정 → 단축키에서 먼저 정해 주세요.'
                    }}
                  />
                )
              }
            >
              {hotkey ? (
                <>
                  <Keycap>{hotkey}</Keycap>
                  {objectParticle(hotkey)} 눌러 팔레트를 열어요
                </>
              ) : (
                '팔레트 단축키를 눌러 팔레트를 열어요'
              )}
            </KeyStep>
            <KeyStep n={2} note="맨 위의 ‘회의록 정리’ 프롬프트가 골라져요">
              ‘회의록’을 입력하고 <Keycap>Enter</Keycap>를 눌러요
            </KeyStep>
            <KeyStep n={3} note={<ConfirmNote mode={mode} swap={swap} />}>
              확인 화면에서 <Keycap>Enter</Keycap>를 눌러요
            </KeyStep>
            <KeyStep n={4}>
              {target.opens ? `${target.name} 창이 열리면 ` : '붙여넣을 곳에서 '}
              <Keycap>Ctrl+V</Keycap>
              {target.opens ? '로 붙여넣어요' : '를 눌러요'}
            </KeyStep>
          </ol>
        )}
        <MemoPanel memo={memo} selected={selected} showStatus={!tried} onReselect={onReselect} />
      </div>
    </>
  )
}

/** 확인 화면에서 일어날 일: 바뀌는 첫 이름(실제 계산), 끔이면 원문 그대로 */
function ConfirmNote({ mode, swap }: { mode: string; swap: TrySwap | null }): React.JSX.Element {
  if (mode === 'off') return <>가명 처리가 꺼져 있어 원문 그대로 복사돼요</>
  if (!swap) return <>바꿀 이름이 없어 원문 그대로 복사돼요</>
  return (
    <>
      <span className="flex flex-wrap items-center gap-1.5">
        <span>예:</span>
        <span className="rounded-control bg-surface-inset px-1.5 font-semibold text-fg">
          {swap.from}
        </span>
        <ArrowRightIcon size={14} className="text-fg-3" />
        <span className="sr-only">대신</span>
        <span className="rounded-control bg-surface-inset px-1.5 font-semibold text-brand">
          {swap.to}
        </span>
      </span>
      <span className="block">임시 이름으로 바꾼 프롬프트가 클립보드에 복사돼요</span>
    </>
  )
}

/** 키 순서 한 줄: 번호, 할 일(키는 키 모양), 그 아래 결과·예 */
function KeyStep({
  n,
  note,
  children
}: {
  n: number
  note?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3">
      <StepMarker n={n} state="plain" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-body leading-6 break-keep text-fg">{children}</p>
        {note ? <div className="text-small leading-5 break-keep text-fg-2">{note}</div> : null}
      </div>
    </li>
  )
}

/**
 * 따라 해 보기 메모: 미리 선택해 둔다(보통 글 선택과 같은 파란 선택 표시). 창을 누르면 선택이 풀릴 수 있어 지금 선택돼 있는지 알리고
 * [메모 다시 선택]으로 다시 고른다. 메모 글은 화면 읽기 프로그램이 읽을 수 있게 그대로 둔다
 */
function MemoPanel({
  memo,
  selected,
  showStatus,
  onReselect
}: {
  memo: React.RefObject<HTMLPreElement | null>
  selected: boolean | null
  showStatus: boolean
  onReselect(): void
}): React.JSX.Element {
  const id = useId()
  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-5 items-center gap-2 px-1">
        <h2 id={`${id}-title`} className="text-caption leading-4 font-semibold text-fg-2">
          예시 메모
        </h2>
        {showStatus ? (
          <span
            role="status"
            className={`ml-auto flex items-center gap-1 text-caption leading-4 ${selected === false ? 'text-warn' : 'text-fg-2'}`}
          >
            {selected ? <CheckIcon size={14} className="text-brand" /> : null}
            {selected === null ? '' : selected ? '선택돼 있어요' : '선택이 풀렸어요'}
          </span>
        ) : null}
      </div>
      <pre
        ref={memo}
        className={`m-0 rounded-window border bg-surface-inset px-3 py-2.5 font-ui text-small leading-5 break-keep whitespace-pre-wrap text-fg select-text ${
          showStatus && selected ? 'border-brand/60' : 'border-line'
        }`}
      >
        {TRY_MEMO}
      </pre>
      {showStatus ? (
        <div>
          <Button onClick={onReselect}>메모 다시 선택</Button>
        </div>
      ) : null}
    </section>
  )
}
