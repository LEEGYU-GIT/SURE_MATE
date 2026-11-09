import { FLYOUT_MAX_HEIGHT, type WikiCardEntry, type WikiCardView } from '../../../shared/flyout/flyout-content'

/** [설명 복사]를 누른 뒤 결과("복사했어요")를 보여 주는 시간(움직임 없이 글자만 바뀐다) */
export const COPY_FLASH_MS = 1500

/** 카드 문구(해요체, 입문자용 짧은 말) */
export const CARD_TEXT = {
  region: '용어 카드',
  pin: '고정',
  pinHint: '고정하면 저절로 닫히지 않아요',
  unpinHint: '고정 풀기',
  close: '닫기',
  copy: '설명 복사',
  copied: '복사했어요',
  missing: '지워진 용어예요',
  openInPalette: '팔레트에서 열기',
  openInPaletteHint: '팔레트에서 링크를 열거나 고칠 수 있어요',
  example: '사용 예',
  others: '다른 뜻·비슷한 용어',
  back: '목록',
  backLabel: '목록으로',
  found: (n: number) => `이 글에 나온 용어 ${n}개`,
  more: (n: number) => `나머지 ${n}개는 글을 나눠 선택하면 볼 수 있어요`,
  noneQuery: (q: string) => `‘${q}’에 맞는 용어가 없어요`,
  noneText: '이 글에 나온 용어가 없어요',
  noneHint: '팔레트에서 다시 찾거나 직접 추가할 수 있어요',
  searchInPalette: '팔레트에서 찾기',
  noteHint: '글을 선택하거나 복사한 뒤 단축키를 다시 눌러 주세요',
  useClipboard: '클립보드 글로 찾기'
} as const

/** 위키 카드 화면 상태(카드 안에서만 바뀌는 값) */
export interface CardState {
  /** 이 상태를 만든 내용 */
  view: WikiCardView
  /** best: 지금 본문 항목(후보를 고르면 바뀐다). 다른 종류는 null */
  best: WikiCardEntry | null
  /** best: 후보. 고른 후보 자리에 이전 본문이 들어간다 */
  others: WikiCardEntry[]
  /** found: 목록에서 연 용어 id(null이면 목록) */
  openId: string | null
  /** 복사 결과 표시. token은 같은 표시인지 가리는 번호(앞 타이머가 새 표시를 지우지 않게) */
  flash: { ok: boolean; token: number } | null
}

export type CardAction =
  /** main이 보낸 새 내용(고정만 바뀌었으면 같은 view) */
  | { type: 'view'; view: WikiCardView }
  /** best: 후보를 본문으로 */
  | { type: 'choose'; id: string }
  /** found: 목록 행을 상세로 */
  | { type: 'open'; id: string }
  /** found: 상세에서 ‹ 목록 */
  | { type: 'back' }
  | { type: 'flash'; ok: boolean; token: number }
  | { type: 'flash-end'; token: number }

export function initialCardState(view: WikiCardView): CardState {
  return {
    view,
    best: view.kind === 'best' ? view.best : null,
    others: view.kind === 'best' ? view.others : [],
    openId: null,
    flash: null
  }
}

/** 카드가 지금 보여 주는 용어(설명 복사·팔레트에서 열기의 대상). 목록·안내 화면이면 null */
export function currentEntry(s: CardState): WikiCardEntry | null {
  if (s.view.kind === 'best') return s.best
  if (s.view.kind === 'found') return s.view.entries.find((e) => e.id === s.openId) ?? null
  return null
}

/** 같은 내용인지(main이 보낸 내용은 IPC를 거쳐 매번 새 객체다) */
const sameView = (a: WikiCardView, b: WikiCardView): boolean => a === b || JSON.stringify(a) === JSON.stringify(b)

/**
 * 위키 카드 화면 전환. 고정만 바뀐 새 내용은 같은 view라 고른 후보·연 상세·복사 표시를 그대로 둔다.
 * 다른 후보·상세·목록으로 옮기면 복사 표시를 지운다(앞 용어의 결과라서).
 */
export function cardReducer(s: CardState, a: CardAction): CardState {
  switch (a.type) {
    case 'view':
      if (s.view === a.view) return s
      return sameView(s.view, a.view) ? { ...s, view: a.view } : initialCardState(a.view)
    case 'choose': {
      const at = s.others.findIndex((e) => e.id === a.id)
      if (s.view.kind !== 'best' || !s.best || at < 0) return s
      const others = s.others.slice()
      others[at] = s.best
      return { ...s, best: s.others[at], others, flash: null }
    }
    case 'open':
      if (s.view.kind !== 'found' || !s.view.entries.some((e) => e.id === a.id)) return s
      return { ...s, openId: a.id, flash: null }
    case 'back':
      if (s.view.kind !== 'found' || s.openId === null) return s
      return { ...s, openId: null, flash: null }
    case 'flash':
      return { ...s, flash: { ok: a.ok, token: a.token } }
    case 'flash-end':
      return s.flash?.token === a.token ? { ...s, flash: null } : s
  }
}

let flashToken = 0

/**
 * 복사 결과를 COPY_FLASH_MS 동안 보여 준다(ok: 복사했어요, 아니면 용어가 없어져 복사하지 못함).
 * 돌려준 함수는 남은 타이머를 치운다(카드가 닫힐 때). 표시 중에 다시 누르면 그때부터 다시 센다.
 */
export function flashCopy(dispatch: (a: CardAction) => void, ok: boolean): () => void {
  const token = ++flashToken
  dispatch({ type: 'flash', ok, token })
  const timer = setTimeout(() => dispatch({ type: 'flash-end', token }), COPY_FLASH_MS)
  return () => clearTimeout(timer)
}

const nameKey = (term: string): string => term.normalize('NFC').trim().toLowerCase()

/** 함께 보이는 항목 가운데 이름이 같은 항목의 id(대소문자 무시). 같은 이름의 두 뜻(SIL)을 행에서 바로 구분하려고 */
export function sameNameIds(entries: WikiCardEntry[]): Set<string> {
  const count = new Map<string, number>()
  for (const e of entries) count.set(nameKey(e.term), (count.get(nameKey(e.term)) ?? 0) + 1)
  return new Set(entries.filter((e) => (count.get(nameKey(e.term)) ?? 0) > 1).map((e) => e.id))
}

/**
 * 이름이 같은 다른 항목과 구분해 줄 별칭: 영문 소문자가 든 풀이(Software-in-the-Loop·Safety Integrity Level),
 * 없으면 한글이 든 별칭, 그것도 없으면 null(약어만 있는 별칭은 구분에 도움이 안 된다)
 */
export function distinguishingAlias(e: WikiCardEntry): string | null {
  return e.aliases.find((a) => /[a-z]/.test(a)) ?? e.aliases.find((a) => /[가-힣]/.test(a)) ?? null
}

/**
 * 카드가 main에 알릴 높이: 머리·아래 단추 줄은 그린 높이, 스크롤 본문(scrollHeight가 있는 칸)은 다 보일 높이로 더해
 * 최대 높이(FLYOUT_MAX_HEIGHT)에서 자른다. 창이 작아 본문이 눌려 있어도 줄기 전 높이를 알리므로
 * 알린 크기가 지금 창 크기에 끌려 작아지지 않는다. 창 크기는 정수 DIP라 올림(잘리지 않게).
 */
export function cardHeight(blocks: { height: number; scrollHeight?: number }[]): number {
  const total = blocks.reduce((sum, b) => sum + (b.scrollHeight ?? b.height), 0)
  return Math.min(Math.ceil(total), FLYOUT_MAX_HEIGHT)
}
