import { PASTE_INTO, PET_CATEGORY_NOUNS, PET_CONTROL_KEY_ITEMS } from '../../../shared/pet/pet-copy'
import { PET_WINDOW, type SlotSide } from '../../../shared/pet/pet-view'
import type { Rect } from '../../../shared/types'
import { FACE_CENTER, type FacePlace } from './mallang-shapes'

/**
 * 말풍선 상자 치수(DIP). 테두리 2 + 안쪽 여백 위아래 8·좌우 10, 줄 높이 18:
 * 너비 200이면 글 너비 176(13px 한글 약 15자), 4줄이면 높이 92로 자리 96 안에 든다.
 * 꼬리는 10×10 정사각형을 45° 돌린 것이고, 모서리 둥글기 8과 꼬리 반폭 7을 비켜 가장자리에서 15 안쪽에만 둔다.
 */
export const BUBBLE_BOX = {
  border: 2,
  padX: 10,
  padY: 8,
  line: 18,
  tail: 10,
  tailInset: 15
} as const

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), Math.max(lo, hi))

/**
 * 잰 말풍선을 자리 안에 놓는다(창 좌표). above는 자리 아래 가운데(펫 바로 위), left는 자리 오른쪽·세로 가운데,
 * right는 자리 왼쪽·세로 가운데. 자리보다 크면 자리 크기로 줄이고, 위치는 정수로 반올림해(글자가 흐리지 않게)
 * 창(320×240) 밖으로 나가지 않게 자른다.
 */
export function bubbleRect(o: {
  slot: Rect
  side: SlotSide
  measured: { width: number; height: number }
}): Rect {
  const { slot, side } = o
  const width = Math.min(o.measured.width, slot.width)
  const height = Math.min(o.measured.height, slot.height)
  const x =
    side === 'above'
      ? slot.x + (slot.width - width) / 2
      : side === 'left'
        ? slot.x + slot.width - width
        : slot.x
  const y = side === 'above' ? slot.y + slot.height - height : slot.y + (slot.height - height) / 2
  return {
    x: clamp(Math.round(x), 0, PET_WINDOW.width - width),
    y: clamp(Math.round(y), 0, PET_WINDOW.height - height),
    width,
    height
  }
}

/**
 * 말풍선을 다시 재어 main에 사각형을 알리는 열쇠. 약속: 새 말풍선(seq)마다 사각형을 한 번 알린다.
 * main은 새 반응마다(문구가 같아도) 클릭 판정 사각형을 버리므로, 같은 문구의 새 말풍선도 다시 알려야 눌린다.
 * 같은 말풍선을 다시 그릴 때(seq·문구·방향·자리가 같음)는 다시 재지 않는다.
 */
export function bubbleMeasureKey(b: {
  seq: number
  text: string
  side: SlotSide
  slot: Rect
}): string {
  return [b.seq, b.side, b.slot.x, b.slot.y, b.slot.width, b.slot.height, b.text].join('|')
}

/** 화면 읽기 프로그램에 알린 말풍선: 새 말풍선(seq)과 그때 문구 */
export type SpokenBubble = { seq: number; text: string }

/**
 * 알림 영역(role="status")에 둘 문구. 새 말풍선(seq)이면 그 문구를 알리고, 같은 말풍선의 글만 바뀌면(이석 초 세기: 1초마다)
 * 처음 문구를 그대로 둔다. 알림 영역 글이 바뀔 때마다 화면 읽기 프로그램이 문장 전체를 다시 읽기 때문이다.
 * 말풍선이 없으면 null(비운다). 그대로 둘 때는 받은 값을 그대로 돌려준다(다시 그리지 않게)
 */
export function spokenBubble(
  prev: SpokenBubble | null,
  bubble: { seq: number; text: string } | null
): SpokenBubble | null {
  if (!bubble) return null
  if (prev && prev.seq === bubble.seq) return prev
  return { seq: bubble.seq, text: bubble.text }
}

/** 꼬리 자리: 펫 쪽 가장자리(above는 아래, left는 오른쪽, right는 왼쪽)를 따라 잰 거리. 얼굴을 가리키되 모서리를 비킨다 */
export function tailOffset(o: {
  rect: Rect
  side: SlotSide
  target: { x: number; y: number }
}): number {
  const { rect, side, target } = o
  const length = side === 'above' ? rect.width : rect.height
  const at = side === 'above' ? target.x - rect.x : target.y - rect.y
  const inset = BUBBLE_BOX.tailInset
  if (length < 2 * inset) return length / 2
  return clamp(at, inset, length - inset)
}

/** 꼬리가 가리킬 얼굴 가운데(창 좌표): 서 있는 얼굴 가운데 (32, 38) 격자를 자세별 자리로 옮기고, 왼쪽을 보면 뒤집는다 */
export function faceTarget(o: {
  box: { x: number; y: number }
  size: number
  place: FacePlace
  mirror: boolean
}): { x: number; y: number } {
  const k = o.size / 64
  const gx = FACE_CENTER.x + o.place.dx
  return {
    x: o.box.x + (o.mirror ? 64 - gx : gx) * k,
    y: o.box.y + (FACE_CENTER.y + o.place.dy) * k
  }
}

/** 줄을 바꾸지 않는 띄어쓰기(U+00A0) */
const NBSP = String.fromCharCode(0xa0)
/** 보이지 않게 앞뒤를 붙이는 글자(U+2060 WORD JOINER): "·" 앞에서 줄이 바뀌지 않게 한다 */
const WORD_JOINER = String.fromCharCode(0x2060)
/** 띄어 쓴 분류 이름(사내 URL)은 한 덩어리로 */
const SPACED_NOUNS = Object.values(PET_CATEGORY_NOUNS).filter((n) => n.includes(' '))
/** AI 이름의 마지막 낱말이 이 글자 수 이하면 "창에"와 붙인다(더 길면 붙인 덩어리가 한 줄을 넘는다) */
const GLUE_NAME_MAX = 10
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const AI_BEFORE_PASTE = new RegExp(`(^|\\s)(\\S{1,${GLUE_NAME_MAX}}) ${escapeRegExp(PASTE_INTO)}`)

/** 조종 안내의 키와 하는 일("Space 뛰기", "↑↓ 바 오르내리기")은 한 덩어리 */
const CONTROL_KEY_ITEMS = PET_CONTROL_KEY_ITEMS.map(([k, v]) => `${k} ${v}`)

/**
 * 좁은 말풍선에서 뜻이 끊기지 않게 붙인다: 분류 이름과 건수("고객사명 2건"), "외"와 건수("외 3건"),
 * 띄어 쓴 분류 이름("사내 URL"), 짧은 AI 이름과 "창에", 조종 키와 하는 일("Space 뛰기"),
 * "·"와 그 앞 글자(줄 첫머리가 "·"로 시작하지 않게). 줄은 나머지 띄어쓰기와 "·" 뒤에서만 바뀐다(word-break: keep-all).
 */
export function keepTogether(text: string): string {
  let out = text
  for (const noun of SPACED_NOUNS) out = out.split(noun).join(noun.split(' ').join(NBSP))
  for (const item of CONTROL_KEY_ITEMS) out = out.split(item).join(item.split(' ').join(NBSP))
  out = out.replace(/(\S) (\d[\d,]*건)/g, `$1${NBSP}$2`)
  out = out.split('·').join(`${WORD_JOINER}·`)
  return out.replace(AI_BEFORE_PASTE, `$1$2${NBSP}${PASTE_INTO}`)
}

/**
 * 두 문장 이상이면 첫 문장(상태: "복사했어요.", "가명 처리가 꺼져 있어요.")을 떼어 굵게 쓴다.
 * 한 문장짜리(되돌리기·가져오기 실패)는 떼지 않는다(lead null).
 */
export function splitLead(text: string): { lead: string | null; rest: string } {
  const end = text.indexOf('. ')
  if (end < 0) return { lead: null, rest: text }
  return { lead: text.slice(0, end + 1), rest: text.slice(end + 2) }
}

/** 자리 높이에 들어가는 줄 수(줄이 넘치면 마지막 줄을 줄임표로 자른다). 기본 자리 96 → 4줄 */
export function bubbleLines(slotHeight: number): number {
  const inner = slotHeight - 2 * (BUBBLE_BOX.padY + BUBBLE_BOX.border)
  return Math.max(1, Math.floor(inner / BUBBLE_BOX.line))
}
