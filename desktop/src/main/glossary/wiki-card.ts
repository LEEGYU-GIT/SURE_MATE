import type { AppEvent } from '../../shared/app-events'
import type { WikiCardView } from '../../shared/flyout/flyout-content'
import type { GlossaryEntry } from '../../shared/glossary/types'
import { buildGlossaryIndex, wikiCardView } from '../../shared/glossary/wiki-lookup'
import { CAPTURE_NOTES } from '../../shared/labels'
import type { SearchIndex } from '../../shared/search/ranker'
import type { CaptureResult } from '../../shared/types'

/** [클립보드 글로 찾기]를 눌렀는데 클립보드에 글이 없을 때 */
export const CLIPBOARD_EMPTY_NOTE = '클립보드에 글이 없어요'

export interface WikiCardDeps {
  /** 지금 활성 창에서 선택한 글을 가져온다(selection.ts captureSelection) */
  capture(): Promise<CaptureResult>
  /** 클립보드 글(가져오기의 뒷정리가 끝난 뒤에 읽는다, selection.ts readClipboardText) */
  readClipboard(): Promise<string>
  /** 지금 용어 목록(바뀌지 않았으면 같은 배열) */
  entries(): Promise<GlossaryEntry[]>
  /** 카드를 띄운다(바 옆 펼침 창, 바가 없으면 팔레트) */
  show(view: WikiCardView): void
  /** 길이·종류·수만 넘긴다(선택한 글·클립보드 글·용어 이름 금지) */
  log(event: string, data: Record<string, unknown>): void
  /** 말랑 메이트에 앱 일을 알린다(선택한 글을 가져오지 못함) */
  emit(e: AppEvent): void
}

export interface WikiCard {
  /** 조회 단축키: 선택한 글을 가져와 찾는다. 선택이 없거나 가져오지 못하면 이유와 [클립보드 글로 찾기] */
  lookupSelection(): Promise<void>
  /** 카드의 [클립보드 글로 찾기] */
  lookupClipboard(): Promise<void>
}

/** wiki.card 로그의 가져오기 필드(옛 dev.capture와 같은 이름과 뜻) */
type CaptureFields = { source: 'selection' | 'clipboard'; method: CaptureResult['method']; elapsedMs: number; restored: boolean; skipped: CaptureResult['skipped'] | null; length: number }

/** 카드가 다루는 용어 수: 가장 맞는 항목 + 후보, 또는 글에 나온 용어 전체(목록에 없는 나머지 포함) */
function countOf(view: WikiCardView): number {
  if (view.kind === 'best') return 1 + view.others.length
  if (view.kind === 'found') return view.entries.length + view.more
  return 0
}

/**
 * 선택 텍스트 위키 카드(설계 §9, §10 6단계). 선택한 글이 없거나 가져오지 못하면 클립보드를 저절로 찾지 않고
 * 이유와 [클립보드 글로 찾기]를 보여 준다(오래된 클립보드 글로 엉뚱한 카드를 띄우지 않게). 가져오기가 busy면
 * 먼저 시작한 쪽이 카드를 띄우므로 아무것도 띄우지 않는다. 결과는 로그 wiki.card 한 줄(busy 포함)로 남긴다.
 */
export function createWikiCard(d: WikiCardDeps): WikiCard {
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

  /** 클립보드를 읽지 못하면 빈 것으로 본다(단추를 보이지 않는다) */
  const readClipboard = async (): Promise<string> => {
    try {
      return await d.readClipboard()
    } catch {
      return ''
    }
  }

  const viewFor = async (text: string, source: 'selection' | 'clipboard'): Promise<WikiCardView> => {
    const entries = await d.entries()
    return wikiCardView(text, source, entries, indexFor(entries))
  }

  const present = (fields: CaptureFields, view: WikiCardView): void => {
    d.log('wiki.card', { ...fields, kind: view.kind, count: countOf(view) })
    d.show(view)
  }

  return {
    async lookupSelection() {
      const r = await d.capture()
      const fields: CaptureFields = {
        source: 'selection',
        method: r.method,
        elapsedMs: r.elapsedMs,
        restored: r.restored,
        skipped: r.skipped ?? null,
        length: r.text?.length ?? 0
      }
      // 단축키를 연달아 눌렀을 때: 먼저 시작한 가져오기가 카드를 띄운다
      if (r.skipped === 'busy') {
        d.log('wiki.card', { ...fields, kind: null, count: 0 })
        return
      }
      // 공백·줄바꿈만 가져온 것은 선택이 없는 것과 같다
      if (r.skipped || !r.text?.trim()) {
        const reason = r.skipped ?? 'nothing-selected'
        const canUseClipboard = (await readClipboard()).trim() !== ''
        present(fields, { kind: 'note', reason, message: CAPTURE_NOTES[reason], canUseClipboard })
        // busy는 위에서 끝났다(먼저 시작한 가져오기가 카드를 띄운다)
        d.emit({ type: 'capture-failed', reason })
        return
      }
      present(fields, await viewFor(r.text, 'selection'))
    },
    async lookupClipboard() {
      const text = await readClipboard()
      // 가져오기를 하지 않았으므로 가져오기 필드는 비어 있는 값(method none, 0ms, 되돌림 없음)
      const fields: CaptureFields = { source: 'clipboard', method: 'none', elapsedMs: 0, restored: false, skipped: null, length: text.length }
      if (!text.trim()) {
        present(fields, { kind: 'note', reason: 'clipboard-empty', message: CLIPBOARD_EMPTY_NOTE, canUseClipboard: false })
        return
      }
      present(fields, await viewFor(text, 'clipboard'))
    }
  }
}
