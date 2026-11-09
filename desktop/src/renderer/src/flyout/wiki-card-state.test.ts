import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLYOUT_MAX_HEIGHT, type WikiCardEntry, type WikiCardView } from '../../../shared/flyout/flyout-content'
import {
  cardHeight,
  cardReducer,
  COPY_FLASH_MS,
  currentEntry,
  distinguishingAlias,
  flashCopy,
  initialCardState,
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
function store(view: WikiCardView): { get(): CardState; dispatch(a: CardAction): void } {
  let s = initialCardState(view)
  return {
    get: () => s,
    dispatch: (a: CardAction): void => {
      s = cardReducer(s, a)
    }
  }
}

describe('가장 맞는 항목(best): 후보를 고르면 본문이 바뀐다', () => {
  it('처음에는 가장 맞는 항목이 본문, 후보는 받은 순서', () => {
    const s = initialCardState(best)
    expect(currentEntry(s)).toEqual(SIL_SW)
    expect(s.others).toEqual([SIL_SAFE, ASIL])
    expect(s.flash).toBeNull()
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
    const s = initialCardState(best)
    expect(cardReducer(s, { type: 'choose', id: 'mcdc' })).toBe(s)
    expect(cardReducer(s, { type: 'open', id: 'sil-safety' })).toBe(s)
    expect(cardReducer(s, { type: 'back' })).toBe(s)
  })
})

describe('이 글에 나온 용어(found): 목록 → 상세 → ‹ 목록', () => {
  it('목록 행을 열면 그 용어 상세, 뒤로 가면 목록', () => {
    const t = store(found)
    expect(currentEntry(t.get())).toBeNull()
    t.dispatch({ type: 'open', id: 'mcdc' })
    expect(currentEntry(t.get())?.id).toBe('mcdc')
    t.dispatch({ type: 'back' })
    expect(currentEntry(t.get())).toBeNull()
    expect(t.get().openId).toBeNull()
  })

  it('목록에 없는 id와 후보 고르기는 무시한다', () => {
    const s = initialCardState(found)
    expect(cardReducer(s, { type: 'open', id: 'sil-safety' })).toBe(s)
    expect(cardReducer(s, { type: 'choose', id: 'mcdc' })).toBe(s)
  })

  it('맞는 용어가 없을 때·안내 카드에는 본문 항목이 없다', () => {
    expect(currentEntry(initialCardState({ kind: 'none', source: 'selection', query: 'zzqxw' }))).toBeNull()
    expect(currentEntry(initialCardState({ kind: 'note', message: '선택한 글이 없어요', canUseClipboard: true }))).toBeNull()
  })
})

describe(`복사 표시: 누르면 ${COPY_FLASH_MS}ms 동안 글자만 바뀐다(움직임 없음)`, () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('복사했어요는 1500ms 뒤 사라진다', () => {
    expect(COPY_FLASH_MS).toBe(1500)
    const t = store(best)
    flashCopy(t.dispatch, true)
    expect(t.get().flash).toMatchObject({ ok: true })
    vi.advanceTimersByTime(1499)
    expect(t.get().flash).toMatchObject({ ok: true })
    vi.advanceTimersByTime(1)
    expect(t.get().flash).toBeNull()
  })

  it('표시 중에 다시 누르면 그때부터 1500ms(앞 타이머가 새 표시를 지우지 않는다)', () => {
    const t = store(best)
    flashCopy(t.dispatch, true)
    vi.advanceTimersByTime(1000)
    flashCopy(t.dispatch, true)
    vi.advanceTimersByTime(500)
    expect(t.get().flash).toMatchObject({ ok: true })
    vi.advanceTimersByTime(1000)
    expect(t.get().flash).toBeNull()
  })

  it('용어가 없어져 복사하지 못하면 실패 표시(ok false)도 1500ms', () => {
    const t = store(best)
    flashCopy(t.dispatch, false)
    expect(t.get().flash).toMatchObject({ ok: false })
    vi.advanceTimersByTime(COPY_FLASH_MS)
    expect(t.get().flash).toBeNull()
  })

  it('돌려준 함수로 남은 타이머를 치운다(카드가 닫힐 때)', () => {
    const t = store(best)
    const cancel = flashCopy(t.dispatch, true)
    cancel()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('다른 후보·상세·목록으로 옮기면 복사 표시를 지운다(앞 용어의 결과라서)', () => {
    const b = store(best)
    flashCopy(b.dispatch, true)
    b.dispatch({ type: 'choose', id: 'asil' })
    expect(b.get().flash).toBeNull()
    const f = store(found)
    f.dispatch({ type: 'open', id: 'mcdc' })
    flashCopy(f.dispatch, true)
    f.dispatch({ type: 'back' })
    expect(f.get().flash).toBeNull()
  })
})

describe('새 내용(view)이 오면', () => {
  it('고정만 바뀐 새 내용(같은 view)은 고른 후보·연 상세를 그대로 둔다', () => {
    const b = store(best)
    b.dispatch({ type: 'choose', id: 'asil' })
    const copy = JSON.parse(JSON.stringify(best)) as WikiCardView
    b.dispatch({ type: 'view', view: copy })
    expect(currentEntry(b.get())).toEqual(ASIL)
    expect(b.get().view).toBe(copy)
    const f = store(found)
    f.dispatch({ type: 'open', id: 'code-coverage' })
    f.dispatch({ type: 'view', view: JSON.parse(JSON.stringify(found)) as WikiCardView })
    expect(currentEntry(f.get())?.id).toBe('code-coverage')
  })

  it('다른 내용이면 처음 상태로', () => {
    const b = store(best)
    b.dispatch({ type: 'choose', id: 'asil' })
    b.dispatch({ type: 'view', view: found })
    expect(b.get()).toEqual(initialCardState(found))
  })

  it('같은 객체면 상태를 그대로 돌려준다', () => {
    const s = initialCardState(best)
    expect(cardReducer(s, { type: 'view', view: best })).toBe(s)
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
