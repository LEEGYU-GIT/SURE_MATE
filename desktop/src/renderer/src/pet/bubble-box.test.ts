import { describe, expect, it } from 'vitest'
import {
  PET_CONTROL_GUIDE,
  PET_NUDGE_LINES,
  petAwayCountdownLine,
  petAwayLine
} from '../../../shared/pet/pet-copy'
import { PET_WINDOW, SLOT as PET_SLOT } from '../../../shared/pet/pet-view'
import {
  BUBBLE_BOX,
  bubbleLines,
  bubbleMeasureKey,
  bubbleRect,
  faceTarget,
  keepTogether,
  splitLead,
  spokenBubble,
  tailOffset
} from './bubble-box'
import { MALLANG_FACE } from './mallang-shapes'

const SLOT = { x: 0, y: 0, width: 200, height: 96 }
const MEASURED = { width: 120, height: 40 }

describe('bubbleMeasureKey: 언제 다시 재어 main에 사각형을 알리는지', () => {
  const warn = {
    seq: 1,
    text: '가명 처리가 꺼져 있어요. 이름이 그대로 들어갔어요.',
    side: 'above' as const,
    slot: SLOT
  }

  it('(fix 1) 문구가 같아도 새 말풍선(seq)이면 다시 알린다: main은 새 반응마다 사각형을 버린다', () => {
    expect(bubbleMeasureKey({ ...warn, seq: 2 })).not.toBe(bubbleMeasureKey(warn))
  })

  it('같은 말풍선을 다시 그리면(같은 seq·문구·자리) 알리지 않는다', () => {
    expect(bubbleMeasureKey({ ...warn, slot: { ...SLOT } })).toBe(bubbleMeasureKey(warn))
  })

  it('문구·방향·자리가 바뀌면 다시 잰다', () => {
    const key = bubbleMeasureKey(warn)
    expect(bubbleMeasureKey({ ...warn, text: '원래 이름으로 되돌렸어요.' })).not.toBe(key)
    expect(bubbleMeasureKey({ ...warn, side: 'left' })).not.toBe(key)
    for (const slot of [
      { ...SLOT, x: 1 },
      { ...SLOT, y: 1 },
      { ...SLOT, width: 116 },
      { ...SLOT, height: 166 }
    ]) {
      expect(bubbleMeasureKey({ ...warn, slot })).not.toBe(key)
    }
  })
})

describe('이석 초 세기(2026-11-13): 같은 말풍선(seq)의 글만 1초마다 바뀐다', () => {
  const tick = (
    seq: number,
    n: number
  ): { seq: number; text: string; side: 'above'; slot: typeof SLOT } => ({
    seq,
    text: petAwayCountdownLine(n),
    side: 'above',
    slot: SLOT
  })

  it('bubbleMeasureKey: 숫자가 바뀌면 다시 재어 main에 사각형을 알린다(클릭 판정)', () => {
    expect(bubbleMeasureKey(tick(3, 29))).not.toBe(bubbleMeasureKey(tick(3, 30)))
    expect(bubbleMeasureKey(tick(3, 29))).toBe(bubbleMeasureKey(tick(3, 29)))
  })

  it('spokenBubble: 화면 읽기 프로그램에는 새 말풍선마다 한 번만 알리고, 같은 말풍선의 숫자 바뀜은 다시 읽지 않는다', () => {
    const warn = { seq: 2, text: petAwayLine(2) }
    const first = spokenBubble(null, warn)
    expect(first).toEqual(warn)
    // 같은 말풍선을 다시 그림: 받은 값 그대로(다시 그리지 않는다)
    expect(spokenBubble(first, { ...warn })).toBe(first)
    // 초 세기 첫 숫자는 새 말풍선(seq)이라 알린다
    const count = spokenBubble(first, tick(3, 30))
    expect(count).toEqual({ seq: 3, text: petAwayCountdownLine(30) })
    // 그다음 숫자(같은 seq)는 처음 문구를 그대로 둔다
    let s = count
    for (let n = 29; n >= 1; n -= 1) s = spokenBubble(s, tick(3, n))
    expect(s).toBe(count)
    // 닫히면 비우고, 다음 말풍선은 다시 알린다(같은 문구여도)
    expect(spokenBubble(s, null)).toBeNull()
    expect(spokenBubble(null, tick(4, 30))).toEqual({ seq: 4, text: petAwayCountdownLine(30) })
  })
})

describe('bubbleRect: 잰 말풍선을 자리 안에 놓는다(창 좌표)', () => {
  it('above는 자리 아래 가운데, left는 자리 오른쪽·세로 가운데, right는 자리 왼쪽·세로 가운데', () => {
    expect(bubbleRect({ slot: SLOT, side: 'above', measured: MEASURED })).toEqual({
      x: 40,
      y: 56,
      width: 120,
      height: 40
    })
    expect(bubbleRect({ slot: SLOT, side: 'left', measured: MEASURED })).toEqual({
      x: 80,
      y: 28,
      width: 120,
      height: 40
    })
    expect(bubbleRect({ slot: SLOT, side: 'right', measured: MEASURED })).toEqual({
      x: 0,
      y: 28,
      width: 120,
      height: 40
    })
  })

  it('자리보다 크게 재면 자리 크기로 줄인다', () => {
    expect(
      bubbleRect({ slot: SLOT, side: 'above', measured: { width: 260, height: 130 } })
    ).toEqual({ x: 0, y: 0, width: 200, height: 96 })
  })

  it('정수 DIP로 반올림해 글자가 흐리지 않게 한다', () => {
    const r = bubbleRect({
      slot: { x: 60, y: 68.25, width: 200, height: 96 },
      side: 'above',
      measured: { width: 151.5, height: 57.6 }
    })
    expect(r).toEqual({
      x: Math.round(60 + (200 - 151.5) / 2),
      y: Math.round(68.25 + 96 - 57.6),
      width: 151.5,
      height: 57.6
    })
  })

  it('(Task 4 이월) 자리가 창 밖으로 걸쳐도 말풍선은 창(320×240) 안에 남는다', () => {
    const r = bubbleRect({
      slot: { x: 250, y: 200, width: 200, height: 96 },
      side: 'above',
      measured: MEASURED
    })
    expect(r).toEqual({
      x: PET_WINDOW.width - 120,
      y: PET_WINDOW.height - 40,
      width: 120,
      height: 40
    })
    const l = bubbleRect({
      slot: { x: -90, y: -30, width: 200, height: 96 },
      side: 'left',
      measured: MEASURED
    })
    expect(l.x).toBe(0)
    expect(l.y).toBe(0)
  })
})

describe('tailOffset: 꼬리는 펫 얼굴 쪽을 가리킨다(가장자리 따라 잰 거리)', () => {
  const rect = { x: 40, y: 56, width: 120, height: 40 }
  it('above: 아래 가장자리에서 얼굴 x, 모서리 둥글기·꼬리 반폭 안쪽으로 자른다', () => {
    expect(tailOffset({ rect, side: 'above', target: { x: 100, y: 200 } })).toBe(60)
    expect(tailOffset({ rect, side: 'above', target: { x: 0, y: 200 } })).toBe(BUBBLE_BOX.tailInset)
    expect(tailOffset({ rect, side: 'above', target: { x: 400, y: 200 } })).toBe(
      120 - BUBBLE_BOX.tailInset
    )
  })

  it('left·right: 세로 가장자리에서 얼굴 y', () => {
    const side = { x: 80, y: 20, width: 120, height: 60 }
    expect(tailOffset({ rect: side, side: 'left', target: { x: 260, y: 50 } })).toBe(30)
    expect(tailOffset({ rect: side, side: 'right', target: { x: 10, y: 200 } })).toBe(
      60 - BUBBLE_BOX.tailInset
    )
  })

  it('말풍선이 꼬리 두 개보다 작으면 가운데', () => {
    expect(
      tailOffset({
        rect: { x: 0, y: 0, width: 120, height: 20 },
        side: 'left',
        target: { x: 0, y: 0 }
      })
    ).toBe(10)
  })
})

describe('faceTarget: 꼬리가 가리킬 얼굴 가운데(창 좌표)', () => {
  it('서 있는 얼굴 (32, 38) 격자를 상자 크기로', () => {
    expect(
      faceTarget({
        box: { x: 132, y: 184.25 },
        size: 56,
        place: { dx: 0, dy: 0, scale: 1 },
        mirror: false
      })
    ).toEqual({ x: 160, y: 217.5 })
  })

  it('자세별 얼굴 자리와 좌우 뒤집기를 따른다(오르기: 납작한 면이 바에 붙은 몸의 얼굴 가운데)', () => {
    const climb = MALLANG_FACE.climb
    expect(faceTarget({ box: { x: 0, y: 0 }, size: 64, place: climb, mirror: false })).toEqual({
      x: 29.5,
      y: 20
    })
    expect(faceTarget({ box: { x: 0, y: 0 }, size: 64, place: climb, mirror: true })).toEqual({
      x: 34.5,
      y: 20
    })
  })
})

describe('글자 다루기', () => {
  const NB = String.fromCharCode(0xa0)
  const WJ = String.fromCharCode(0x2060)

  it('keepTogether: 분류 이름과 건수, "외"와 건수, 띄어 쓴 분류 이름이 두 줄로 나뉘지 않게 붙인다', () => {
    expect(keepTogether('복사했어요. 경로 3건·고객사명 2건 외 3건은 가명으로 바꿨어요.')).toBe(
      `복사했어요. 경로${NB}3건${WJ}·고객사명${NB}2건 외${NB}3건은 가명으로 바꿨어요.`
    )
    expect(keepTogether('경로 1,200건은')).toBe(`경로${NB}1,200건은`)
    expect(keepTogether('사내 URL 2건·IP 1건은')).toBe(`사내${NB}URL${NB}2건${WJ}·IP${NB}1건은`)
  })

  it('keepTogether: 줄 첫머리가 "·"로 시작하지 않게 앞 글자에 붙인다(줄은 "·" 뒤에서만 바뀐다)', () => {
    expect(keepTogether('고객사명 2건·담당자명 1건은')).toBe(
      `고객사명${NB}2건${WJ}·담당자명${NB}1건은`
    )
  })

  it('keepTogether: 짧은 AI 이름(마지막 낱말 10자 이하)은 "창에"와 한 줄에, 긴 이름은 그 앞에서 줄을 바꿀 수 있게 둔다', () => {
    expect(keepTogether('Claude 창에 붙여넣어 주세요.')).toBe(`Claude${NB}창에 붙여넣어 주세요.`)
    expect(keepTogether('사내 AI 도우미 창에 붙여넣어 주세요.')).toBe(
      `사내 AI 도우미${NB}창에 붙여넣어 주세요.`
    )
    const long = '아주아주긴사내에이아이도우…'
    expect(keepTogether(`${long} 창에 붙여넣어 주세요.`)).toBe(`${long} 창에 붙여넣어 주세요.`)
    expect(keepTogether('원하는 곳에 붙여넣어 주세요.')).toBe('원하는 곳에 붙여넣어 주세요.')
  })

  it('keepTogether: 조종 안내는 키와 하는 일을 한 덩어리로 붙인다(줄은 "·" 뒤에서만 바뀐다)', () => {
    expect(keepTogether(PET_CONTROL_GUIDE)).toBe(
      `키보드로 조종해 보세요. ←→${NB}걷기 ${WJ}· Space${NB}뛰기 ${WJ}· ↑↓${NB}바${NB}오르내리기 ${WJ}· Esc${NB}끝`
    )
  })

  it('keepTogether: 건수·AI 이름이 없는 글은 그대로', () => {
    for (const t of [
      '가명 처리가 꺼져 있어요. 이름이 그대로 들어갔어요.',
      '원래 이름으로 되돌렸어요.',
      '터미널에서는 가져오지 않아요.'
    ]) {
      expect(keepTogether(t)).toBe(t)
    }
  })

  it('splitLead: 두 문장 이상이면 첫 문장(상태)을 떼어 굵게 쓴다. 한 문장이면 떼지 않는다', () => {
    expect(
      splitLead('복사했어요. 고객사명 1건은 가명으로 바꿨어요. Claude 창에 붙여넣어 주세요.')
    ).toEqual({
      lead: '복사했어요.',
      rest: '고객사명 1건은 가명으로 바꿨어요. Claude 창에 붙여넣어 주세요.'
    })
    expect(splitLead('가명 처리가 꺼져 있어요. 이름이 그대로 들어갔어요.')).toEqual({
      lead: '가명 처리가 꺼져 있어요.',
      rest: '이름이 그대로 들어갔어요.'
    })
    expect(splitLead('원래 이름으로 되돌렸어요.')).toEqual({
      lead: null,
      rest: '원래 이름으로 되돌렸어요.'
    })
    expect(splitLead('터미널에서는 가져오지 않아요.')).toEqual({
      lead: null,
      rest: '터미널에서는 가져오지 않아요.'
    })
  })

  it('bubbleLines: 자리 높이에 들어가는 줄 수(기본 자리 96 → 4줄)', () => {
    expect(BUBBLE_BOX.line * 4 + 2 * (BUBBLE_BOX.padY + BUBBLE_BOX.border)).toBeLessThanOrEqual(96)
    expect(bubbleLines(96)).toBe(4)
    expect(bubbleLines(166)).toBe(8)
    expect(bubbleLines(10)).toBe(1)
  })

  it('글 너비 = 200 − 테두리·안쪽 여백(문구 4줄 기준 176)', () => {
    expect(200 - 2 * (BUBBLE_BOX.border + BUBBLE_BOX.padX)).toBe(176)
  })
})

describe('쉬어 가기 말(2026-11-13)은 말풍선 한 줄에 든다', () => {
  /** 글 너비(DIP): 말풍선 너비 200 − 테두리·안쪽 여백 */
  const TEXT_WIDTH = PET_SLOT.bubbleWidth - 2 * (BUBBLE_BOX.border + BUBBLE_BOX.padX)
  /** 말풍선 글자 13px(--fs-small)에서 넉넉히 잰 너비: 한글 한 자 1em, 띄어쓰기 0.3em, 숫자·기호 0.62em(실제 글꼴은 더 좁다) */
  const estimate = (text: string): number =>
    [...text].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 1 : ch === ' ' ? 0.3 : 0.62), 0) * 13

  it('문구마다 글 너비 176 안이고, 붙이기·첫 문장 떼기가 바꾸지 않는다(한 문장, 건수·분류 없음)', () => {
    expect(TEXT_WIDTH).toBe(176)
    for (const line of PET_NUDGE_LINES) {
      expect(estimate(line), line).toBeLessThanOrEqual(TEXT_WIDTH)
      expect(keepTogether(line)).toBe(line)
      expect(splitLead(line)).toEqual({ lead: null, rest: line })
    }
  })
})
