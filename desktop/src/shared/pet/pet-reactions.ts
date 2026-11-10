import type { AppEvent } from '../app-events'
import { petBubbleText } from './pet-copy'
import type { PetFace, PetProp } from './pet-view'

/** 말풍선이 떠 있는 시간(설계 §14-2 "말풍선 4초, 누르면 닫힘") */
export const BUBBLE_MS = 4000
/** 말풍선 없는 반응(말풍선 끔)의 표정·소품 유지 시간 */
export const REACTION_MS = 1500

/** 앱 일에 대한 펫 반응: 표정·소품·한 번 도는 움직임을 holdMs 동안 덮어쓰고 말풍선을 띄운다(자세는 그대로) */
export interface PetReaction {
  kind: 'celebrate' | 'warn' | 'hop' | 'note'
  face: PetFace
  props: PetProp[]
  cue: 'hop' | null
  bubble: string | null
  holdMs: number
}

type Look = Pick<PetReaction, 'kind' | 'face' | 'props' | 'cue'>

/** 설계 §14-2 "앱과 연결" 표: 복사 축하(편지·폴짝), 경고(걱정·주황 느낌표), 되돌리기 폴짝, 가져오기 실패는 가만히 + 말풍선 */
function lookFor(e: AppEvent): Look {
  switch (e.type) {
    case 'prompt-copied':
      return e.masking === 'off'
        ? { kind: 'warn', face: 'worried', props: ['alert'], cue: null }
        : { kind: 'celebrate', face: 'happy', props: ['envelope'], cue: 'hop' }
    case 'unmasked':
      return { kind: 'hop', face: 'happy', props: [], cue: 'hop' }
    case 'capture-failed':
      return { kind: 'note', face: 'normal', props: [], cue: null }
  }
}

/**
 * 앱 일 → 반응. 반응 끔이면 null. 말풍선 끔이면 말풍선 없이 1.5초이고, 가져오기 실패는 보여 줄 것이 없어 null.
 * 되돌린 이름이 없으면(0건) 반응하지 않는다.
 */
export function reactionFor(
  e: AppEvent,
  o: { reactions: boolean; bubbles: boolean }
): PetReaction | null {
  if (!o.reactions) return null
  if (e.type === 'unmasked' && !(e.restored > 0)) return null
  const look = lookFor(e)
  const bubble = o.bubbles ? petBubbleText(e) : null
  if (bubble === null && look.kind === 'note') return null
  return {
    ...look,
    props: [...look.props],
    bubble,
    holdMs: bubble !== null ? BUBBLE_MS : REACTION_MS
  }
}
