import { FLYOUT_MAX_HEIGHT, type WikiCardEntry, type WikiCardView, type WikiNoteReason } from '../../../shared/flyout/flyout-content'

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
  copyFailed: '복사하지 못했어요',
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
  useClipboard: '클립보드 글로 찾기',
  // 안내 카드의 다음 할 일(noteHint). "아래 단추"는 [클립보드 글로 찾기]
  hintSelect: '찾을 글을 선택하고 단축키를 다시 눌러 주세요',
  hintSelectOrCopy: '글을 선택하거나 복사한 뒤 단축키를 다시 눌러 주세요',
  hintCopyThenButton: '글을 복사한 뒤 아래 단추를 눌러 주세요',
  hintCopyThenAgain: '글을 복사한 뒤 단축키를 다시 눌러 주세요',
  hintCtrlCThenButton: '글을 복사(Ctrl+C)한 뒤 아래 단추를 눌러 주세요',
  hintCtrlCThenAgain: '글을 복사(Ctrl+C)한 뒤 단축키를 다시 눌러 주세요',
  hintRelease: '키를 모두 뗀 뒤 단축키를 다시 눌러 주세요',
  hintAgain: '단축키를 다시 눌러 주세요',
  hintWindow: '글이 있는 창을 누른 뒤 단축키를 다시 눌러 주세요',
  hintLater: '잠시 뒤 단축키를 다시 눌러 주세요'
} as const

/**
 * 안내 카드의 다음 할 일(늘 한 줄 보인다). canUseClipboard면 아래에 [클립보드 글로 찾기] 단추가 있다.
 * 터미널은 Ctrl+C가 실행 중단이라(설계 §10) 키를 적지 않고 "복사"라고만 쓴다.
 */
export function noteHint(reason: WikiNoteReason, canUseClipboard: boolean): string {
  switch (reason) {
    case 'nothing-selected':
      return CARD_TEXT.hintSelect
    case 'clipboard-empty':
      return CARD_TEXT.hintSelectOrCopy
    case 'terminal':
      return canUseClipboard ? CARD_TEXT.hintCopyThenButton : CARD_TEXT.hintCopyThenAgain
    case 'elevated':
    case 'native-unavailable':
      return canUseClipboard ? CARD_TEXT.hintCtrlCThenButton : CARD_TEXT.hintCtrlCThenAgain
    case 'modifiers-held':
    case 'keys-held':
      return CARD_TEXT.hintRelease
    case 'focus-changed':
      return CARD_TEXT.hintAgain
    case 'no-foreground':
      return CARD_TEXT.hintWindow
    case 'busy':
      return CARD_TEXT.hintLater
  }
}

/** [설명 복사]의 결과: 복사했음, 그사이 용어가 없어짐(main의 false), 요청이 거부·실패함 */
export type CopyResult = 'copied' | 'missing' | 'failed'

/** main의 답을 복사 결과로: true는 복사, false는 용어가 없어짐, 'failed'는 요청 자체가 실패함 */
export const copyResultOf = (answer: boolean | 'failed'): CopyResult => (answer === true ? 'copied' : answer === false ? 'missing' : 'failed')

/** 위키 카드 화면 상태(카드 안에서만 바뀌는 값) */
export interface CardState {
  /** 이 상태를 만든 내용 */
  view: WikiCardView
  /** 조회마다 main이 매기는 카드 번호. 번호가 바뀌면 처음 상태로 */
  cardId: number
  /** best: 지금 본문 항목(후보를 고르면 바뀐다). 다른 종류는 null */
  best: WikiCardEntry | null
  /** best: 후보. 고른 후보 자리에 이전 본문이 들어간다 */
  others: WikiCardEntry[]
  /** found: 목록에서 연 용어 id(null이면 목록) */
  openId: string | null
  /** found: 상세를 열 때의 목록 스크롤 위치(‹ 목록으로 돌아오면 그 자리로) */
  listScroll: number
  /** 그린 뒤 본문 스크롤을 맞출 위치. 맞출 때마다 새 객체라 화면이 같은 위치라도 다시 적용한다 */
  scroll: { top: number } | null
  /** 복사 결과 표시. token은 같은 표시인지 가리는 번호(앞 타이머가 새 표시를 지우지 않게) */
  flash: { result: CopyResult; token: number } | null
}

export type CardAction =
  /** main이 보낸 새 내용. 같은 카드 번호면 고정만 바뀐 것 */
  | { type: 'view'; view: WikiCardView; cardId: number }
  /** best: 후보를 본문으로 */
  | { type: 'choose'; id: string }
  /** found: 목록 행을 상세로(listScroll: 지금 목록 스크롤 위치) */
  | { type: 'open'; id: string; listScroll: number }
  /** found: 상세에서 ‹ 목록 */
  | { type: 'back' }
  | { type: 'flash'; result: CopyResult; token: number }
  | { type: 'flash-end'; token: number }

export function initialCardState(view: WikiCardView, cardId: number): CardState {
  return {
    view,
    cardId,
    best: view.kind === 'best' ? view.best : null,
    others: view.kind === 'best' ? view.others : [],
    openId: null,
    listScroll: 0,
    scroll: null,
    flash: null
  }
}

/** 카드가 지금 보여 주는 용어(설명 복사·팔레트에서 열기의 대상). 목록·안내 화면이면 null */
export function currentEntry(s: CardState): WikiCardEntry | null {
  if (s.view.kind === 'best') return s.best
  if (s.view.kind === 'found') return s.view.entries.find((e) => e.id === s.openId) ?? null
  return null
}

/**
 * 위키 카드 화면 전환. 같은 카드 번호의 새 내용(고정만 바뀜)은 고른 후보·연 상세·스크롤·복사 표시를 그대로 두고,
 * 번호가 다르면 내용이 같아도 처음 상태로 돌아간다(숨긴 뒤 같은 글로 다시 찾은 새 카드).
 * 다른 후보·상세는 본문을 맨 위에서 보여 주고, ‹ 목록은 보던 목록 자리로 돌아간다. 옮기면 복사 표시를 지운다(앞 용어의 결과라서).
 */
export function cardReducer(s: CardState, a: CardAction): CardState {
  switch (a.type) {
    case 'view':
      if (a.cardId !== s.cardId) return initialCardState(a.view, a.cardId)
      return s.view === a.view ? s : { ...s, view: a.view }
    case 'choose': {
      const at = s.others.findIndex((e) => e.id === a.id)
      if (s.view.kind !== 'best' || !s.best || at < 0) return s
      const others = s.others.slice()
      others[at] = s.best
      return { ...s, best: s.others[at], others, scroll: { top: 0 }, flash: null }
    }
    case 'open':
      if (s.view.kind !== 'found' || !s.view.entries.some((e) => e.id === a.id)) return s
      return { ...s, openId: a.id, listScroll: a.listScroll, scroll: { top: 0 }, flash: null }
    case 'back':
      if (s.view.kind !== 'found' || s.openId === null) return s
      return { ...s, openId: null, scroll: { top: s.listScroll }, flash: null }
    case 'flash':
      return { ...s, flash: { result: a.result, token: a.token } }
    case 'flash-end':
      return s.flash?.token === a.token ? { ...s, flash: null } : s
  }
}

let flashToken = 0

/**
 * 복사 결과를 COPY_FLASH_MS 동안 보여 준다(복사했어요 · 지워진 용어예요 · 복사하지 못했어요).
 * 돌려준 함수는 남은 타이머를 치운다(카드가 닫힐 때). 표시 중에 다시 누르면 그때부터 다시 센다.
 */
export function flashCopy(dispatch: (a: CardAction) => void, result: CopyResult): () => void {
  const token = ++flashToken
  dispatch({ type: 'flash', result, token })
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
