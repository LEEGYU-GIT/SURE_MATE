import { useLayoutEffect, useRef, useState } from 'react'
import type { PetView, SlotSide } from '../../../shared/pet/pet-view'
import type { Rect } from '../../../shared/types'
import {
  BUBBLE_BOX,
  bubbleLines,
  bubbleRect,
  keepTogether,
  splitLead,
  tailOffset
} from './bubble-box'

type Bubble = NonNullable<PetView['bubble']>
type Point = { x: number; y: number }

export interface PetBubbleProps {
  bubble: PetView['bubble']
  /** 꼬리가 가리킬 펫 얼굴 가운데(창 좌표) */
  target: Point
  reduceMotion: boolean
}

/**
 * 말랑 메이트 말풍선 층(설계 §14-2 "말풍선 4초, 누르면 닫힘"). 늘 그려 두는 알림 영역(role="status") 안에
 * 말풍선 하나(마지막 것)를 띄운다. 영역을 먼저 두어야 화면 읽기 프로그램이 새 문구를 읽는다.
 */
export function PetBubble({ bubble, target, reduceMotion }: PetBubbleProps): React.JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none absolute inset-0"
    >
      {bubble ? <SpeechBubble bubble={bubble} target={target} reduceMotion={reduceMotion} /> : null}
    </div>
  )
}

/**
 * 글 상자 안에서 가장 긴 줄의 너비(DIP). 줄마다 나뉜 글 조각의 오른쪽 끝을 잰다.
 * 들어오는 움직임·누름의 scale 중에 다시 재도 맞도록 화면 크기를 제 크기(offsetWidth)로 되돌린다.
 */
function longestLine(p: HTMLElement): number {
  const box = p.getBoundingClientRect()
  const scale = p.offsetWidth > 0 && box.width > 0 ? box.width / p.offsetWidth : 1
  const range = document.createRange()
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
  let right = box.left
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    range.selectNodeContents(n)
    for (const r of range.getClientRects()) right = Math.max(right, r.right)
  }
  return (right - box.left) / scale
}

const sameRect = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

/**
 * 꼬리(45° 돌린 정사각형)의 바깥 두 변만 외곽선. 중심은 펫 쪽 테두리 띠의 바깥 4분의 1 선에 둔다:
 * 돌린 외곽선은 모서리에서 안쪽으로 1.41 들어오므로, 테두리 한가운데에 두면 0.4 DIP가 테두리 위로 삐져나온다
 */
const TAIL_EDGES: Record<SlotSide, string> = {
  above: 'border-r-2 border-b-2',
  left: 'border-t-2 border-r-2',
  right: 'border-b-2 border-l-2'
}

function tailStyle(side: SlotSide, rect: Rect, offset: number): React.CSSProperties {
  const half = BUBBLE_BOX.tail / 2
  const edge = BUBBLE_BOX.border / 4
  // 꼬리 중심: above는 아래 테두리, left는 오른쪽 테두리, right는 왼쪽 테두리의 바깥 4분의 1 선(테두리 상자 기준)
  const cx = side === 'above' ? offset : side === 'left' ? rect.width - edge : edge
  const cy = side === 'above' ? rect.height - edge : offset
  return {
    left: cx - BUBBLE_BOX.border - half,
    top: cy - BUBBLE_BOX.border - half,
    width: BUBBLE_BOX.tail,
    height: BUBBLE_BOX.tail
  }
}

/** 들어오는 움직임의 기준점 = 꼬리 끝(펫 쪽). 펫에게서 커져 나오는 것처럼 보인다 */
function originOf(side: SlotSide, rect: Rect, offset: number): string {
  const tip = BUBBLE_BOX.tail * Math.SQRT1_2
  if (side === 'above') return `${offset}px ${rect.height + tip}px`
  return side === 'left' ? `${rect.width + tip}px ${offset}px` : `${-tip}px ${offset}px`
}

/**
 * 흰 바탕(--white)·--ink 글자 13·외곽선 2·모서리 8, 펫 얼굴을 가리키는 꼬리. 첫 문장(상태)은 굵게.
 * 처음에는 숨긴 채 자리 왼쪽 위에 그려 크기를 재고(useLayoutEffect, 그리기 전) 너비를 가장 긴 줄에 맞춘 뒤,
 * 자리 안에 놓고 그 사각형을 main에 알린다.
 * 나타날 때만 꼬리 끝에서 200ms ease-out으로 들어오고, 새 반응이 문구를 바꾸면 그 자리에서 글만 바뀐다. 닫을 때는 움직임 없이 사라진다.
 */
function SpeechBubble({
  bubble,
  target,
  reduceMotion
}: {
  bubble: Bubble
  target: Point
  reduceMotion: boolean
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const { slot, side, text } = bubble
  const { x: sx, y: sy, width: sw, height: sh } = slot

  // 문구·자리가 바뀔 때만 다시 잰다(seq만 바뀌어 글이 같으면 크기도 같다)
  useLayoutEffect(() => {
    const el = ref.current
    const p = textRef.current
    if (!el || !p) return
    // 자리 너비 안에서 줄을 나눈 뒤(balance) 가장 긴 줄에 맞춰 줄인다. 같은 너비면 줄 나눔이 그대로다
    el.style.width = 'max-content'
    const chrome = 2 * (BUBBLE_BOX.padX + BUBBLE_BOX.border)
    const width = Math.min(sw, Math.ceil(longestLine(p)) + chrome)
    el.style.width = `${width}px`
    // offsetHeight는 들어오는 움직임(scale)과 상관없는 제 크기다
    const next = bubbleRect({
      slot: { x: sx, y: sy, width: sw, height: sh },
      side,
      measured: { width, height: el.offsetHeight }
    })
    setRect((cur) => (cur && sameRect(cur, next) ? cur : next))
    window.sureMate.petBubbleRect(next)
  }, [text, side, sx, sy, sw, sh])

  // 말풍선이 사라지면 클릭 판정에서 뺀다
  useLayoutEffect(() => () => window.sureMate.petBubbleRect(null), [])

  const { lead, rest } = splitLead(keepTogether(text))
  const offset = rect ? tailOffset({ rect, side, target }) : 0
  return (
    <div
      ref={ref}
      className={[
        'pet-bubble pointer-events-auto absolute cursor-pointer rounded-window border-2 border-ink bg-bubble px-2.5 py-2 text-small text-ink',
        rect ? 'pet-bubble-in' : 'invisible',
        reduceMotion ? '' : 'motion-safe:active:scale-[0.97]'
      ].join(' ')}
      style={{
        left: rect?.x ?? slot.x,
        top: rect?.y ?? slot.y,
        width: rect?.width ?? 'max-content',
        maxWidth: slot.width,
        transformOrigin: rect ? originOf(side, rect, offset) : undefined
      }}
      data-side={side}
      data-reduce-motion={reduceMotion ? '' : undefined}
      onClick={() => window.sureMate.petBubbleClick()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <p
        ref={textRef}
        className="pet-bubble-text"
        style={{ WebkitLineClamp: bubbleLines(slot.height), lineHeight: `${BUBBLE_BOX.line}px` }}
      >
        {lead ? (
          <>
            <span className="font-semibold">{lead}</span>{' '}
          </>
        ) : null}
        {rest}
      </p>
      {rect ? (
        <span
          aria-hidden="true"
          className={`pet-bubble-tail absolute border-ink bg-bubble ${TAIL_EDGES[side]}`}
          style={tailStyle(side, rect, offset)}
        />
      ) : null}
    </div>
  )
}
