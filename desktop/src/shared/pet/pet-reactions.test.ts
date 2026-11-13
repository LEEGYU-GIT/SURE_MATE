import { describe, expect, it } from 'vitest'
import type { AppEvent } from '../app-events'
import { PET_NUDGE_LINES, petBubbleText } from './pet-copy'
import { BUBBLE_MS, nudgeReaction, REACTION_MS, reactionFor } from './pet-reactions'

const on = { reactions: true, bubbles: true }
const noBubbles = { reactions: true, bubbles: false }

const celebrate: AppEvent = {
  type: 'prompt-copied',
  masking: 'restore',
  masked: [{ category: 'client', count: 1 }],
  target: 'Claude'
}
const warn: AppEvent = { type: 'prompt-copied', masking: 'off', masked: [], target: 'Claude' }
const unmasked: AppEvent = { type: 'unmasked', restored: 2 }
const note: AppEvent = { type: 'capture-failed', reason: 'terminal' }

describe('reactionFor: 앱 일 → 반응(설계 §14-2 "앱과 연결" 표)', () => {
  it('말풍선 시간 4초, 말풍선 없는 반응 1.5초', () => {
    expect(BUBBLE_MS).toBe(4000)
    expect(REACTION_MS).toBe(1500)
  })

  it('표의 네 줄', () => {
    expect(reactionFor(celebrate, on)).toEqual({
      kind: 'celebrate',
      face: 'happy',
      props: ['envelope'],
      cue: 'hop',
      bubble: petBubbleText(celebrate),
      holdMs: 4000
    })
    expect(reactionFor(warn, on)).toEqual({
      kind: 'warn',
      face: 'worried',
      props: ['alert'],
      cue: null,
      bubble: '가명 처리가 꺼져 있어요. 이름이 그대로 들어갔어요.',
      holdMs: 4000
    })
    expect(reactionFor(unmasked, on)).toEqual({
      kind: 'hop',
      face: 'happy',
      props: [],
      cue: 'hop',
      bubble: '원래 이름으로 되돌렸어요.',
      holdMs: 4000
    })
    expect(reactionFor(note, on)).toEqual({
      kind: 'note',
      face: 'normal',
      props: [],
      cue: null,
      bubble: '터미널에서는 가져오지 않아요.',
      holdMs: 4000
    })
  })

  it('결과에서 빼기 모드 복사도 축하다', () => {
    expect(reactionFor({ ...celebrate, masking: 'remove' }, on)?.kind).toBe('celebrate')
  })

  it('말풍선 끔: 말풍선 없이 1.5초, 가져오기 실패는 보여 줄 것이 없어 null', () => {
    expect(reactionFor(celebrate, noBubbles)).toEqual({
      kind: 'celebrate',
      face: 'happy',
      props: ['envelope'],
      cue: 'hop',
      bubble: null,
      holdMs: 1500
    })
    expect(reactionFor(warn, noBubbles)).toEqual({
      kind: 'warn',
      face: 'worried',
      props: ['alert'],
      cue: null,
      bubble: null,
      holdMs: 1500
    })
    expect(reactionFor(unmasked, noBubbles)).toEqual({
      kind: 'hop',
      face: 'happy',
      props: [],
      cue: 'hop',
      bubble: null,
      holdMs: 1500
    })
    expect(reactionFor(note, noBubbles)).toBeNull()
  })

  it('반응 끔: 모두 null(말풍선 설정과 무관)', () => {
    for (const e of [celebrate, warn, unmasked, note]) {
      expect(reactionFor(e, { reactions: false, bubbles: true }), e.type).toBeNull()
      expect(reactionFor(e, { reactions: false, bubbles: false }), e.type).toBeNull()
    }
  })

  it('되돌린 이름이 없으면(0건) 반응하지 않는다', () => {
    expect(reactionFor({ type: 'unmasked', restored: 0 }, on)).toBeNull()
  })

  it('반응마다 새 소품 배열이다(받는 쪽이 고쳐도 다음 반응에 남지 않는다)', () => {
    const a = reactionFor(celebrate, on)!
    a.props.push('alert')
    expect(reactionFor(celebrate, on)!.props).toEqual(['envelope'])
  })
})

describe('nudgeReaction: 쉬어 가기 말(2026-11-13)', () => {
  it('있는 말풍선(4초, 누르면 닫힘)과 폴짝 한 번, 웃는 얼굴. 소품은 없다(선글라스는 상태 기계가 얹는다)', () => {
    expect(nudgeReaction(PET_NUDGE_LINES[0])).toEqual({
      kind: 'nudge',
      face: 'happy',
      props: [],
      cue: 'hop',
      bubble: '물도 마시고 해요!',
      holdMs: BUBBLE_MS
    })
    expect(nudgeReaction('x').props).not.toBe(nudgeReaction('x').props)
  })
})
