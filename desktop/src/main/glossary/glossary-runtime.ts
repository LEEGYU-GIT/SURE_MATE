import { isHttpUrl } from '../../shared/glossary/pack'
import type { GlossaryEntry } from '../../shared/glossary/types'

export interface GlossaryRuntimeDeps {
  /** 지금 용어 목록(기본 팩 + 사용자 용어) */
  entries(): Promise<GlossaryEntry[]>
  writeClipboard(text: string): Promise<void>
  hidePalette(restoreFocus: boolean): void
  openExternal(url: string): Promise<void>
  /** id·길이·번호만 넘긴다(용어·설명 금지) */
  log(event: string, data: Record<string, unknown>): void
}

export interface GlossaryRuntime {
  get(id: string): Promise<GlossaryEntry | null>
  /** 설명을 클립보드에 넣고 팔레트를 닫아 원래 창으로 */
  copy(id: string): Promise<boolean>
  /** 그 항목의 index번째 링크(http/https만)를 연다 */
  openLink(id: string, index: number): Promise<boolean>
}

/** 팔레트 위키의 main 쪽 동작(설계 문서 §9 보기) */
export function createGlossaryRuntime(d: GlossaryRuntimeDeps): GlossaryRuntime {
  const find = async (id: string): Promise<GlossaryEntry | null> => (await d.entries()).find((e) => e.id === id) ?? null
  return {
    get: find,
    async copy(id) {
      const entry = await find(id)
      if (!entry) return false
      await d.writeClipboard(entry.definition)
      d.hidePalette(true)
      d.log('wiki.copy', { id, length: entry.definition.length })
      return true
    },
    async openLink(id, index) {
      const link = (await find(id))?.links[index]
      if (!link || !isHttpUrl(link.url)) return false
      d.hidePalette(false)
      await d.openExternal(new URL(link.url).href)
      d.log('wiki.openLink', { id, index })
      return true
    }
  }
}
