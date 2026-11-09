import type { GlossaryEntry } from '../../../shared/glossary/types'
import type { KeyInfo } from './confirm-state'
import { entryToForm, type WikiForm } from './wiki-form'

export type WikiAction = { type: 'copy' } | { type: 'back' } | { type: 'edit' } | { type: 'link'; index: number }

const LINK_KEYS: Record<string, number> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
  Numpad1: 0,
  Numpad2: 1,
  Numpad3: 2,
  Numpad4: 3,
  Numpad5: 4
}

/** 위키 상세 화면의 키. 한글 조합 중이면 아무것도 하지 않고, 자동 반복된 Enter로는 복사하지 않는다 */
export function wikiKeyToAction(k: Omit<KeyInfo, 'shiftKey' | 'altKey'> & Partial<Pick<KeyInfo, 'shiftKey' | 'altKey'>>, entry: Pick<GlossaryEntry, 'links'>): WikiAction | null {
  if (k.isComposing) return null
  if (k.code === 'Escape' || k.key === 'Escape') return { type: 'back' }
  if (k.code === 'Enter' || k.code === 'NumpadEnter') return k.repeat ? null : { type: 'copy' }
  if (k.code === 'KeyE' && !k.ctrlKey) return { type: 'edit' }
  const index = LINK_KEYS[k.code]
  if (index !== undefined && index < entry.links.length) return { type: 'link', index }
  return null
}

/** 팔레트 안의 위키 화면: 용어 상세와, 그 위에 연 추가·수정 화면(form은 아직 저장하지 않은 글) */
export interface WikiView {
  detail: GlossaryEntry | null
  /** entry가 있으면 그 용어를 고치고, 없으면 새로 추가한다 */
  edit: { entry?: GlossaryEntry; form: WikiForm } | null
}

export const NO_WIKI_VIEW: WikiView = { detail: null, edit: null }

export type WikiViewAction =
  /** 팔레트를 다시 보였다 */
  | { type: 'shown' }
  | { type: 'open'; entry: GlossaryEntry }
  /**
   * 위키 카드의 [팔레트에서 열기]로 보인 팔레트가 그 용어 상세를 연다. 저장하지 않은 추가·수정 글은 버리지 않고
   * 위에 둔 채 상세만 그 아래에 연다(그 글을 Esc로 닫으면 요청한 용어가 보인다)
   */
  | { type: 'show-entry'; entry: GlossaryEntry }
  /** 상세에서 Esc: 목록으로 */
  | { type: 'back' }
  /** 검색 결과가 없을 때 "직접 추가하기"(검색어를 용어로 미리 채움) */
  | { type: 'add'; term: string }
  /** 상세에서 E: 그 용어 고치기 */
  | { type: 'edit' }
  | { type: 'form'; form: WikiForm }
  /** 추가·수정 화면에서 Esc: 적은 글을 버린다 */
  | { type: 'cancel-edit' }
  | { type: 'saved'; entry: GlossaryEntry }

/**
 * 위키 화면 전환. 팔레트는 바깥을 누르면 숨으므로(링크를 복사하러 브라우저에 다녀올 때 등) 다시 보일 때
 * 저장하지 않은 추가·수정 글은 아래 상세와 함께 그대로 둔다. 그 글은 Esc로 취소하거나 저장해야 사라진다.
 * 고치는 중이 아니면 다시 보일 때 목록으로 돌아간다(설계 문서 §6: 닫으면 검색어·결과 초기화).
 */
export function wikiViewReducer(v: WikiView, a: WikiViewAction): WikiView {
  switch (a.type) {
    case 'shown':
      return v.edit ? v : NO_WIKI_VIEW
    case 'open':
      return { detail: a.entry, edit: null }
    case 'show-entry':
      return { detail: a.entry, edit: v.edit }
    case 'back':
      return NO_WIKI_VIEW
    case 'add':
      return { ...v, edit: { form: entryToForm(undefined, a.term) } }
    case 'edit':
      return v.detail ? { ...v, edit: { entry: v.detail, form: entryToForm(v.detail) } } : v
    case 'form':
      return v.edit ? { ...v, edit: { ...v.edit, form: a.form } } : v
    case 'cancel-edit':
      return { ...v, edit: null }
    case 'saved':
      return { detail: a.entry, edit: null }
  }
}

const SOURCE_LABELS: Record<GlossaryEntry['source'], string> = { builtin: '기본 용어', user: '내 용어', imported: '가져온 용어' }

export const sourceLabel = (source: GlossaryEntry['source']): string => SOURCE_LABELS[source]
