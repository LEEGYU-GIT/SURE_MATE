import type { WikiCardView } from '../../shared/flyout/flyout-content'
import type { GlossaryEntry } from '../../shared/glossary/types'
import { buildGlossaryIndex, lookupWiki, toCardEntry } from '../../shared/glossary/wiki-lookup'
import { CAPTURE_NOTES } from '../../shared/labels'
import type { SearchIndex } from '../../shared/search/ranker'
import type { CaptureResult } from '../../shared/types'

/** 위키 카드 '찾을 수 없음'에서 팔레트 검색어로 넘길 길이(펼침 창 동작 검사와 같은 60자) */
const QUERY_MAX = 60

export interface WikiCardDeps {
  capture(): Promise<CaptureResult>
  readClipboard(): Promise<string>
  entries(): Promise<GlossaryEntry[]>
  show(view: WikiCardView): void
  /** 수치·종류·건수만(선택 글·용어 이름 금지) */
  log(event: string, data: Record<string, unknown>): void
}

/**
 * Ctrl+Alt+W 위키 카드(설계 문서 §9): 선택한 글을 가져와 찾고 바 옆 카드로 보인다.
 * 선택이 없거나 가져오지 못했으면 클립보드를 자동으로 찾지 않고 까닭과 [클립보드 글로 찾기]를 제안한다(§10 6단계).
 * 다른 가져오기가 진행 중(busy)이면 먼저 시작한 쪽이 카드를 띄우므로 이쪽은 띄우지 않는다.
 */
export function createWikiCard(d: WikiCardDeps): { lookupSelection(): Promise<void>; lookupClipboard(): Promise<void> } {
  // 같은 용어 배열이면 색인을 다시 만들지 않는다(용어 파일이 바뀌면 새 배열이 온다)
  const indexes = new WeakMap<GlossaryEntry[], SearchIndex>()
  const indexFor = (entries: GlossaryEntry[]): SearchIndex => {
    let index = indexes.get(entries)
    if (!index) {
      index = buildGlossaryIndex(entries)
      indexes.set(entries, index)
    }
    return index
  }

  const lookup = async (text: string, source: 'selection' | 'clipboard'): Promise<{ view: WikiCardView; count: number }> => {
    const entries = await d.entries()
    const r = lookupWiki(text, entries, indexFor(entries))
    if (r.kind === 'best') return { view: { kind: 'best', source, best: toCardEntry(r.best), others: r.others.map(toCardEntry) }, count: 1 + r.others.length }
    if (r.kind === 'found') return { view: { kind: 'found', source, entries: r.entries.map(toCardEntry), more: r.more }, count: r.entries.length }
    // 짧은 글은 그 말로 팔레트에서 다시 찾을 수 있게 넘기고, 긴 글은 넘기지 않는다(카드는 '이 글에 나온 용어가 없어요')
    const query = Array.from(text.trim()).length <= QUERY_MAX ? text.trim() : ''
    return { view: { kind: 'none', source, query }, count: 0 }
  }

  return {
    async lookupSelection() {
      const r = await d.capture()
      const base = { source: 'selection', method: r.method, elapsedMs: r.elapsedMs, restored: r.restored, skipped: r.skipped ?? null }
      if (r.skipped === 'busy') {
        d.log('wiki.card', { ...base, length: 0, kind: 'busy', count: 0 })
        return
      }
      const text = r.text ?? ''
      if (!text.trim()) {
        const clip = await d.readClipboard()
        const reason = r.skipped ?? 'nothing-selected'
        d.show({ kind: 'note', message: CAPTURE_NOTES[reason], canUseClipboard: clip.trim().length > 0 })
        d.log('wiki.card', { ...base, skipped: reason, length: text.length, kind: 'note', count: 0 })
        return
      }
      const { view, count } = await lookup(text, 'selection')
      d.show(view)
      d.log('wiki.card', { ...base, length: text.length, kind: view.kind, count })
    },
    async lookupClipboard() {
      const clip = await d.readClipboard()
      if (!clip.trim()) {
        d.show({ kind: 'note', message: '클립보드에 글이 없어요', canUseClipboard: false })
        d.log('wiki.card', { source: 'clipboard', length: 0, kind: 'note', count: 0 })
        return
      }
      const { view, count } = await lookup(clip, 'clipboard')
      d.show(view)
      d.log('wiki.card', { source: 'clipboard', length: clip.length, kind: view.kind, count })
    }
  }
}
