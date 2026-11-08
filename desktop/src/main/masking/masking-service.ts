import { resolveOverlaps } from '../../shared/masking/detections'
import { findTerms, type MaskTerm } from '../../shared/masking/dictionary'
import { MappingTable } from '../../shared/masking/mapping-table'
import { mapRanges, maskPreamble, maskText } from '../../shared/masking/mask'
import { findPatterns } from '../../shared/masking/patterns'
import type { Detection, MaskCategory, MaskItem } from '../../shared/masking/types'
import { unmaskText } from '../../shared/masking/unmask'
import type { MaskingMode } from '../../shared/types'
import type { Settings } from '../settings/settings-store'

export interface MaskResult {
  /** 머리말을 붙인 최종 글(끔이면 원문 그대로) */
  text: string
  /** text 안에서 가린 표시 자리 */
  ranges: [number, number][]
  preamble: string | null
  items: MaskItem[]
  /** 가리기 전 위치의 구간을 text 안 위치로 옮긴다(넣은 글 형광펜용) */
  mapRanges(ranges: [number, number][]): [number, number][]
}

export interface MaskingService {
  mask(text: string, o: { mode: MaskingMode; disabledKeys: string[]; dryRun: boolean }): Promise<MaskResult>
  unmask(text: string): { text: string; restored: number; unknownTokens: string[] }
  tableSize(): number
  clear(): void
}

/** 찾은 대상을 키마다 하나로 묶는다(처음 나온 순서, 처음 나온 원문) */
function summarize(ds: Detection[]): { key: string; category: MaskCategory; original: string; count: number }[] {
  const byKey = new Map<string, { key: string; category: MaskCategory; original: string; count: number }>()
  for (const d of ds) {
    const seen = byKey.get(d.key)
    if (seen) seen.count++
    else byKey.set(d.key, { key: d.key, category: d.category, original: d.original, count: 1 })
  }
  return [...byKey.values()]
}

/**
 * 가명 처리 서비스(설계 문서 §8). 대응표는 이 서비스가 메모리에만 하나 두고 디스크에 쓰지 않는다.
 * dryRun(미리 보기)은 표를 복제해 써서 토큰을 확정하지 않는다. 대응표 보관 시간은 앱을 시작할 때의 설정을 쓴다.
 */
export function createMaskingService(d: { loadTerms(): Promise<MaskTerm[]>; settings(): Settings['masking']; now(): number }): MaskingService {
  const table = new MappingTable({ now: d.now, ttlMs: d.settings().ttlHours * 3_600_000 })

  const detect = async (text: string): Promise<Detection[]> => {
    const s = d.settings()
    const found = resolveOverlaps([...findTerms(text, await d.loadTerms()), ...findPatterns(text, { internalDomains: s.internalDomains })])
    return found.filter((x) => s.categories[x.category])
  }

  return {
    async mask(input, o) {
      if (o.mode === 'off') {
        const items = summarize(await detect(input.normalize('NFC'))).map((x): MaskItem => ({ ...x, replacement: null, enabled: false }))
        return { text: input, ranges: [], preamble: null, items, mapRanges: (r) => r }
      }
      const text = input.normalize('NFC')
      const ds = await detect(text)
      const s = d.settings()
      const r = maskText(text, ds, { mode: o.mode, categories: s.categories, disabledKeys: o.disabledKeys }, o.dryRun ? table.fork() : table)
      const replaced = new Map(r.applied.map((a) => [a.key, a.replacement]))
      const items = summarize(ds).map((x): MaskItem => ({ ...x, replacement: replaced.get(x.key) ?? null, enabled: replaced.has(x.key) }))
      const preamble = r.applied.length > 0 ? maskPreamble(o.mode) : null
      const offset = preamble ? preamble.length + 2 : 0
      return {
        text: preamble ? `${preamble}\n\n${r.text}` : r.text,
        ranges: r.ranges.map(([a, b]): [number, number] => [a + offset, b + offset]),
        preamble,
        items,
        mapRanges: (ranges) => mapRanges(ranges, r.edits, offset)
      }
    },
    unmask: (text) => unmaskText(text.normalize('NFC'), table),
    tableSize: () => table.size(),
    clear: () => table.clear()
  }
}
