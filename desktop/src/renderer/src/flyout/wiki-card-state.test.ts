import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLYOUT_MAX_HEIGHT, type WikiCardEntry, type WikiCardView, type WikiNoteReason } from '../../../shared/flyout/flyout-content'
import {
  CARD_TEXT,
  cardHeight,
  cardReducer,
  COPY_FLASH_MS,
  copyResultOf,
  currentEntry,
  distinguishingAlias,
  flashCopy,
  initialCardState,
  noteHint,
  sameNameIds,
  type CardAction,
  type CardState
} from './wiki-card-state'

const entry = (id: string, term: string): WikiCardEntry => ({ id, term, aliases: [], definition: `${term} 설명`, source: 'builtin' })
const SIL_SW = entry('sil-software', 'SIL')
const SIL_SAFE = entry('sil-safety', 'SIL')
const ASIL = entry('asil', 'ASIL')
const best: WikiCardView = { kind: 'best', source: 'selection', best: SIL_SW, others: [SIL_SAFE, ASIL] }
const found: WikiCardView = {
  kind: 'found',
  source: 'selection',
  entries: [entry('static-analysis', '정적분석'), entry('mcdc', 'MC/DC'), entry('code-coverage', '코드 커버리지')],
  more: 0
}

/** 상태 하나를 reducer로만 바꾸는 작은 저장소(카드 화면이 쓰는 방식과 같다) */
function store(view: WikiCardView, cardId = 1): { get(): CardState; dispatch(a: CardAction): void } {
  let s = initialCardState(view, cardId)
  return {
    get: () => s,
    dispatch: (a: CardAction): void => {
      s = cardReducer(s, a)
    }
  }
}

describe('가장 맞는 항목(best): 후보를 고르면 본문이 바뀐다', () => {
  it('처음에는 가장 맞는 항목이 본문, 후보는 받은 순서', () => {
    const s = initialCardState(best, 1)
    expect(currentEntry(s)).toEqual(SIL_SW)
    expect(s.others).toEqual([SIL_SAFE, ASIL])
    expect(s.flash).toBeNull()
    expect(s.scroll).toBeNull()
  })

  it('후보를 고르면 본문이 그 항목으로 바뀌고, 이전 본문은 고른 후보 자리로 간다(다른 후보는 제자리)', () => {
    const t = store(best)
    t.dispatch({ type: 'choose', id: 'asil' })
    expect(currentEntry(t.get())).toEqual(ASIL)
    expect(t.get().others).toEqual([SIL_SAFE, SIL_SW])
    t.dispatch({ type: 'choose', id: 'sil-software' })
    expect(currentEntry(t.get())).toEqual(SIL_SW)
    expect(t.get().others).toEqual([SIL_SAFE, ASIL])
  })

  it('후보에 없는 id·목록용 동작은 무시한다(같은 상태)', () => {
    const s = initialCardState(best, 1)
    expect(cardReducer(s, { type: 'choose', id: 'mcdc' })).toBe(s)
    expect(cardReducer(s, { type: 'open', id: 'sil-safety', listScroll: 0 })).toBe(s)
    expect(cardReducer(s, { type: 'back' })).toBe(s)
  })
})

describe('이 글에 나온 용어(found): 목록 → 상세 → ‹ 목록', () => {
  it('목록 행을 열면 그 용어 상세, 뒤로 가면 목록', () => {
    const t = store(found)
    expect(currentEntry(t.get())).toBeNull()
    t.dispatch({ type: 'open', id: 'mcdc', listScroll: 0 })
    expect(currentEntry(t.get())?.id).toBe('mcdc')
    t.dispatch({ type: 'back' })
    expect(currentEntry(t.get())).toBeNull()
    expect(t.get().openId).toBeNull()
  })

  it('목록에 없는 id와 후보 고르기는 무시한다', () => {
    const s = initialCardState(found, 1)
    expect(cardReducer(s, { type: 'open', id: 'sil-safety', listScroll: 0 })).toBe(s)
    expect(cardReducer(s, { type: 'choose', id: 'mcdc' })).toBe(s)
  })

  it('맞는 용어가 없을 때·안내 카드에는 본문 항목이 없다', () => {
    expect(currentEntry(initialCardState({ kind: 'none', source: 'selection', query: 'zzqxw' }, 1))).toBeNull()
    expect(currentEntry(initialCardState({ kind: 'note', reason: 'nothing-selected', message: '선택한 글이 없어요', canUseClipboard: true }, 1))).toBeNull()
  })
})

describe('본문 스크롤: 다른 후보·상세는 맨 위에서, ‹ 목록은 보던 자리로', () => {
  it('후보를 고르거나 상세를 열면 맨 위(0), 목록으로 돌아오면 상세를 열 때의 목록 위치', () => {
    const b = store(best)
    b.dispatch({ type: 'choose', id: 'asil' })
    expect(b.get().scroll).toEqual({ top: 0 })
    const f = store(found)
    f.dispatch({ type: 'open', id: 'code-coverage', listScroll: 240 })
    expect(f.get().scroll).toEqual({ top: 0 })
    f.dispatch({ type: 'back' })
    expect(f.get().scroll).toEqual({ top: 240 })
  })

  it('맞출 때마다 새 객체라 같은 위치를 다시 맞춰도 화면이 적용한다(같은 후보를 두 번 골라도)', () => {
    const b = store(best)
    b.dispatch({ type: 'choose', id: 'asil' })
    const first = b.get().scroll
    b.dispatch({ type: 'choose', id: 'sil-software' })
    expect(b.get().scroll).toEqual({ top: 0 })
    expect(b.get().scroll).not.toBe(first)
  })
})

describe(`복사 표시: 누르면 ${COPY_FLASH_MS}ms 동안 글자만 바뀐다(움직임 없음)`, () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('복사했어요는 1500ms 뒤 사라진다', () => {
    expect(COPY_FLASH_MS).toBe(1500)
    const t = store(best)
    flashCopy(t.dispatch, 'copied')
    expect(t.get().flash).toMatchObject({ result: 'copied' })
    vi.advanceTimersByTime(1499)
    expect(t.get().flash).toMatchObject({ result: 'copied' })
    vi.advanceTimersByTime(1)
    expect(t.get().flash).toBeNull()
  })

  it('표시 중에 다시 누르면 그때부터 1500ms(앞 타이머가 새 표시를 지우지 않는다)', () => {
    const t = store(best)
    flashCopy(t.dispatch, 'copied')
    vi.advanceTimersByTime(1000)
    flashCopy(t.dispatch, 'copied')
    vi.advanceTimersByTime(500)
    expect(t.get().flash).toMatchObject({ result: 'copied' })
    vi.advanceTimersByTime(1000)
    expect(t.get().flash).toBeNull()
  })

  it('용어가 없어졌거나(missing) 요청이 실패했으면(failed) 그 표시도 1500ms', () => {
    for (const result of ['missing', 'failed'] as const) {
      const t = store(best)
      flashCopy(t.dispatch, result)
      expect(t.get().flash).toMatchObject({ result })
      vi.advanceTimersByTime(COPY_FLASH_MS)
      expect(t.get().flash).toBeNull()
    }
  })

  it('돌려준 함수로 남은 타이머를 치운다(카드가 닫힐 때)', () => {
    const t = store(best)
    const cancel = flashCopy(t.dispatch, 'copied')
    cancel()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('다른 후보·상세·목록으로 옮기면 복사 표시를 지운다(앞 용어의 결과라서)', () => {
    const b = store(best)
    flashCopy(b.dispatch, 'copied')
    b.dispatch({ type: 'choose', id: 'asil' })
    expect(b.get().flash).toBeNull()
    const f = store(found)
    f.dispatch({ type: 'open', id: 'mcdc', listScroll: 0 })
    flashCopy(f.dispatch, 'copied')
    f.dispatch({ type: 'back' })
    expect(f.get().flash).toBeNull()
  })
})

describe('복사 결과: main의 답(true·false)과 요청 실패를 가린다', () => {
  it('true는 복사했어요, false는 용어가 없어짐, 요청이 거부·실패하면 복사하지 못함', () => {
    expect(copyResultOf(true)).toBe('copied')
    expect(copyResultOf(false)).toBe('missing')
    expect(copyResultOf('failed')).toBe('failed')
    expect(CARD_TEXT.copied).toBe('복사했어요')
    expect(CARD_TEXT.missing).toBe('지워진 용어예요')
    expect(CARD_TEXT.copyFailed).toBe('복사하지 못했어요')
  })
})

describe('새 내용(view)이 오면: 조회마다 main이 매기는 카드 번호(cardId)로 가린다', () => {
  it('같은 카드 번호(고정만 바뀐 새 내용)는 고른 후보·연 상세·스크롤 위치를 그대로 둔다', () => {
    const b = store(best, 7)
    b.dispatch({ type: 'choose', id: 'asil' })
    const copy = JSON.parse(JSON.stringify(best)) as WikiCardView
    b.dispatch({ type: 'view', view: copy, cardId: 7 })
    expect(currentEntry(b.get())).toEqual(ASIL)
    expect(b.get().view).toBe(copy)
    const f = store(found, 3)
    f.dispatch({ type: 'open', id: 'code-coverage', listScroll: 120 })
    f.dispatch({ type: 'view', view: JSON.parse(JSON.stringify(found)) as WikiCardView, cardId: 3 })
    expect(currentEntry(f.get())?.id).toBe('code-coverage')
    expect(f.get().listScroll).toBe(120)
  })

  it('내용이 같아도 카드 번호가 다르면(숨긴 뒤 같은 글로 다시 찾음) 처음 상태로', () => {
    vi.useFakeTimers()
    try {
      const b = store(best, 7)
      b.dispatch({ type: 'choose', id: 'asil' })
      flashCopy(b.dispatch, 'copied')
      b.dispatch({ type: 'view', view: JSON.parse(JSON.stringify(best)) as WikiCardView, cardId: 8 })
      expect(b.get()).toEqual(initialCardState(best, 8))
      expect(currentEntry(b.get())).toEqual(SIL_SW)
    } finally {
      vi.useRealTimers()
    }
  })

  it('다른 내용이면 처음 상태로, 같은 객체·같은 번호면 상태를 그대로 돌려준다', () => {
    const b = store(best, 1)
    b.dispatch({ type: 'choose', id: 'asil' })
    b.dispatch({ type: 'view', view: found, cardId: 2 })
    expect(b.get()).toEqual(initialCardState(found, 2))
    const s = initialCardState(best, 1)
    expect(cardReducer(s, { type: 'view', view: best, cardId: 1 })).toBe(s)
  })
})

describe('안내 카드의 다음 할 일: 까닭과 클립보드 글이 있는지에 따라 늘 한 줄', () => {
  const hint = (reason: WikiNoteReason, clip: boolean): string => noteHint(reason, clip)

  it('선택 없음 → 글을 선택하고 다시, 클립보드 글로 찾지 못함 → 선택하거나 복사한 뒤 다시', () => {
    expect(hint('nothing-selected', false)).toBe('찾을 글을 선택하고 단축키를 다시 눌러 주세요')
    expect(hint('nothing-selected', true)).toBe('찾을 글을 선택하고 단축키를 다시 눌러 주세요')
    expect(hint('clipboard-empty', false)).toBe('글을 선택하거나 복사한 뒤 단축키를 다시 눌러 주세요')
  })

  it('터미널 → 복사한 뒤 아래 단추(클립보드에 글이 있을 때) 또는 다시. 터미널에서 Ctrl+C는 실행 중단이라 키를 적지 않는다(§10)', () => {
    expect(hint('terminal', true)).toBe('글을 복사한 뒤 아래 단추를 눌러 주세요')
    expect(hint('terminal', false)).toBe('글을 복사한 뒤 단축키를 다시 눌러 주세요')
    for (const clip of [true, false]) expect(hint('terminal', clip)).not.toContain('Ctrl+C')
  })

  it('관리자 권한 창·보안 프로그램이 막음 → Ctrl+C로 복사한 뒤 아래 단추 또는 다시', () => {
    for (const reason of ['elevated', 'native-unavailable'] as const) {
      expect(hint(reason, true)).toBe('글을 복사(Ctrl+C)한 뒤 아래 단추를 눌러 주세요')
      expect(hint(reason, false)).toBe('글을 복사(Ctrl+C)한 뒤 단축키를 다시 눌러 주세요')
    }
  })

  it('키를 누르고 있었음 → 키를 모두 떼고 다시, 다른 창으로 바뀜 → 다시, 앞 창 없음 → 글이 있는 창을 누르고 다시', () => {
    expect(hint('modifiers-held', true)).toBe('키를 모두 뗀 뒤 단축키를 다시 눌러 주세요')
    expect(hint('keys-held', false)).toBe('키를 모두 뗀 뒤 단축키를 다시 눌러 주세요')
    expect(hint('focus-changed', true)).toBe('단축키를 다시 눌러 주세요')
    expect(hint('no-foreground', false)).toBe('글이 있는 창을 누른 뒤 단축키를 다시 눌러 주세요')
  })
})

describe('이름이 같은 항목 구분(같은 이름의 두 뜻 SIL, 설계 §9)', () => {
  const sw: WikiCardEntry = { ...SIL_SW, aliases: ['SILS', 'Software-in-the-Loop', '소프트웨어 인 더 루프'] }
  const safe: WikiCardEntry = { ...SIL_SAFE, aliases: ['Safety Integrity Level', '안전 무결성 수준'] }

  it('함께 보이는 항목 가운데 이름이 같은 것만 고른다(대소문자 무시)', () => {
    expect(sameNameIds([sw, safe, ASIL])).toEqual(new Set(['sil-software', 'sil-safety']))
    expect(sameNameIds([sw, { ...safe, term: 'sil' }])).toEqual(new Set(['sil-software', 'sil-safety']))
    expect(sameNameIds([sw, ASIL])).toEqual(new Set())
  })

  it('구분 글은 풀이 별칭(영문 소문자가 든 것), 없으면 한글 별칭, 그것도 없으면 없음', () => {
    expect(distinguishingAlias(sw)).toBe('Software-in-the-Loop')
    expect(distinguishingAlias(safe)).toBe('Safety Integrity Level')
    expect(distinguishingAlias({ ...safe, aliases: ['SIL 등급', 'SILS'] })).toBe('SIL 등급')
    expect(distinguishingAlias({ ...safe, aliases: ['SILS'] })).toBeNull()
  })
})

describe('카드가 알리는 높이', () => {
  it('머리·아래 단추 줄은 그린 높이, 스크롤 본문은 다 보일 높이로 더하고 최대 높이에서 자른다', () => {
    expect(FLYOUT_MAX_HEIGHT).toBe(560)
    expect(cardHeight([{ height: 32 }, { height: 140, scrollHeight: 140 }, { height: 44 }])).toBe(216)
    expect(cardHeight([{ height: 32 }, { height: 480, scrollHeight: 1200 }, { height: 44 }])).toBe(FLYOUT_MAX_HEIGHT)
  })

  it('창이 작아 본문이 눌려 있어도(창 높이에 맞춰 줄어든 상태) 줄기 전 높이를 알린다(창 크기에 끌려 작아지지 않게)', () => {
    expect(cardHeight([{ height: 32 }, { height: 0, scrollHeight: 120.4 }, { height: 44 }])).toBe(197)
  })
})
