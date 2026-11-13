import { maskingExample, splitHighlights } from '../../../shared/masking/example'
import type { MaskingMode } from '../../../shared/types'

type Tone = 'name' | 'masked' | 'exposed'

/** 강조 조각의 모양: 바뀐 이름은 청록, 원래 이름은 굵게, 끔에서 그대로 가는 이름은 주황(글로도 알린다) */
const TONE_CLASS: Record<Tone, string> = {
  name: 'font-semibold text-fg',
  masked: 'font-semibold text-brand',
  exposed: 'font-semibold text-warn'
}

interface Line {
  label: string
  text: string
  words: string[]
  tone: Tone
  note?: string
}

/** 예시에서 가리는 원래 이름(끔일 때 그대로 간다고 칠하는 낱말) */
const EXAMPLE_NAMES = maskingExample('restore').swaps.map((s) => s.from)

function linesOf(mode: MaskingMode): Line[] {
  const v = maskingExample(mode)
  if (mode === 'off') {
    return [
      { label: '보낼 글', text: v.original, words: EXAMPLE_NAMES, tone: 'exposed' },
      { label: 'AI에 가는 글', text: v.sent, words: EXAMPLE_NAMES, tone: 'exposed', note: '고객사 이름과 IP가 그대로 가요' }
    ]
  }
  const masked = v.swaps.map((s) => s.to)
  const lines: Line[] = [
    { label: '보낼 글', text: v.original, words: EXAMPLE_NAMES, tone: 'name' },
    { label: 'AI에 가는 글', text: v.sent, words: masked, tone: 'masked' },
    { label: 'AI가 쓴 글', text: v.answer, words: masked, tone: 'masked', note: mode === 'remove' ? '바꾼 이름 그대로 써요' : undefined }
  ]
  if (v.restored) lines.push({ label: '되돌린 글', text: v.restored, words: EXAMPLE_NAMES, tone: 'name', note: "AI가 쓴 글을 복사하고 팔레트에서 '가명 되돌리기'" })
  return lines
}

/**
 * 가명 처리가 실제로 하는 일을 한 문장으로 보여 준다(설정 창 가명 처리 탭, 확인 화면의 처음 한 번 안내). 보낼 글 → AI에 가는 글 →
 * AI가 쓴 글(→ 되돌린 글). 글은 shared/masking/example.ts가 실제 가명 처리 함수로 만든다. 움직임 없이 모드가 바뀌면 바로 다시 그린다.
 * compact: 좁은 자리(확인 화면 안내)용으로 줄 사이·안쪽 여백을 줄인다
 */
export function MaskingExample({
  mode,
  compact = false
}: {
  mode: MaskingMode
  compact?: boolean
}): React.JSX.Element {
  return (
    <dl
      aria-label="가명 처리 예시"
      className={`grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 rounded-window border border-line bg-surface-inset ${compact ? 'gap-y-1 px-3 py-2' : 'gap-y-2 px-4 py-3'}`}
    >
      {linesOf(mode).map((line) => (
        <div key={line.label} className="contents">
          <dt className="pt-px text-caption leading-5 text-fg-3">{line.label}</dt>
          <dd className="min-w-0 text-small leading-5 break-keep text-fg-2">
            {splitHighlights(line.text, line.words).map((part, i) =>
              part.hit ? (
                <span key={i} className={TONE_CLASS[line.tone]}>
                  {part.text}
                </span>
              ) : (
                <span key={i}>{part.text}</span>
              )
            )}
            {line.note ? <span className="block text-caption leading-5 text-fg-3">{line.note}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}
