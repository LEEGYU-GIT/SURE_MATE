import { resolveOverlaps } from '../../shared/masking/detections'
import { findTerms } from '../../shared/masking/dictionary'
import { MappingTable } from '../../shared/masking/mapping-table'
import { mapRanges, maskPreamble, maskText } from '../../shared/masking/mask'
import { findAllPatterns } from '../../shared/masking/patterns'
import { ALL_CATEGORIES, type Detection, type MaskCategory, type MaskItem } from '../../shared/masking/types'
import { unmaskText } from '../../shared/masking/unmask'
import type { MaskingMode } from '../../shared/types'
import type { Settings } from '../settings/settings-store'
import type { DictionaryState } from './terms-cache'

export interface MaskResult {
  /** 머리말을 붙인 최종 글(끔이면 원문 그대로) */
  text: string
  /** text 안에서 가린 표시 자리 */
  ranges: [number, number][]
  preamble: string | null
  items: MaskItem[]
  /** 확인 화면에 주황으로 보일 경고(가명 사전 오류 등) */
  warnings: string[]
  /** 흐리게 보일 안내(가명 사전이 비었음 등) */
  notes: string[]
  /** 설정에서 끈 분류가 있어 실명이 남을 수 있음(그런 글은 Win+V 기록에서 뺀다) */
  partial: boolean
  /** 가리기 전 위치의 구간을 text 안 위치로 옮긴다(넣은 글 형광펜용) */
  mapRanges(ranges: [number, number][]): [number, number][]
}

/** 사전 상태를 확인 화면 경고·안내로. 사전이 깨졌는데 켜진 줄 알고 실명을 보내는 일을 막는다(설계 문서 §1) */
function dictionaryNotices(dict: DictionaryState): { warnings: string[]; notes: string[] } {
  if (dict.errors > 0 && dict.terms.length === 0) {
    return { warnings: ["가명 사전을 읽지 못해 고객사·프로젝트 이름을 가리지 않아요. 팔레트의 '가명 사전 열기'로 고쳐 주세요"], notes: [] }
  }
  if (dict.errors > 0) {
    return { warnings: [`가명 사전에 잘못된 항목이 ${dict.errors}건 있어 그 이름은 가리지 않아요. 팔레트의 '가명 사전 열기'로 고쳐 주세요`], notes: [] }
  }
  if (dict.terms.length === 0) {
    return { warnings: [], notes: ["가명 사전이 비어 있어 고객사·프로젝트 이름은 가리지 않아요. 팔레트의 '가명 사전 열기'에서 넣을 수 있어요"] }
  }
  return { warnings: [], notes: [] }
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
export function createMaskingService(d: { loadDictionary(): Promise<DictionaryState>; settings(): Settings['masking']; now(): number }): MaskingService {
  const table = new MappingTable({ now: d.now, ttlMs: d.settings().ttlHours * 3_600_000 })

  /** 설정에서 켠 분류의 찾은 것 전부(겹침 정리 전). 분류 끄기를 먼저 해야 끈 경로 안의 이름·IP를 놓치지 않는다 */
  const detect = async (text: string): Promise<{ found: Detection[]; dict: DictionaryState }> => {
    const s = d.settings()
    const dict = await d.loadDictionary()
    const found = [...findTerms(text, dict.terms), ...findAllPatterns(text, { internalDomains: s.internalDomains })]
    return { found: found.filter((x) => s.categories[x.category]), dict }
  }

  /**
   * 확인 화면 목록에 보일 것: 아무것도 끄지 않았을 때 가려지는 것과, 이번에 끈 뒤 새로 드러난 것
   * (끈 경로 안의 이름 등). 끈 항목도 다시 켤 수 있게 남긴다.
   */
  const shown = (found: Detection[], disabledKeys: string[]): Detection[] => {
    const disabled = new Set(disabledKeys)
    const byPlace = new Map<string, Detection>()
    for (const x of [...resolveOverlaps(found), ...resolveOverlaps(found.filter((f) => !disabled.has(f.key)))]) {
      byPlace.set(`${x.start}:${x.end}:${x.key}`, x)
    }
    return [...byPlace.values()].sort((a, b) => a.start - b.start)
  }

  return {
    async mask(input, o) {
      if (o.mode === 'off') {
        const items = summarize(resolveOverlaps((await detect(input.normalize('NFC'))).found)).map((x): MaskItem => ({ ...x, replacement: null, enabled: false }))
        return { text: input, ranges: [], preamble: null, items, warnings: [], notes: [], partial: false, mapRanges: (r) => r }
      }
      const text = input.normalize('NFC')
      const { found: ds, dict } = await detect(text)
      const s = d.settings()
      const r = maskText(text, ds, { mode: o.mode, categories: s.categories, disabledKeys: o.disabledKeys, removeLabels: s.removeLabels }, o.dryRun ? table.fork() : table)
      const replaced = new Map(r.applied.map((a) => [a.key, a.replacement]))
      const items = summarize(shown(ds, o.disabledKeys)).map((x): MaskItem => ({ ...x, replacement: replaced.get(x.key) ?? null, enabled: replaced.has(x.key) }))
      const preamble = r.applied.length > 0 ? maskPreamble(o.mode, s.removeLabels) : null
      const offset = preamble ? preamble.length + 2 : 0
      return {
        text: preamble ? `${preamble}\n\n${r.text}` : r.text,
        ranges: r.ranges.map(([a, b]): [number, number] => [a + offset, b + offset]),
        preamble,
        items,
        ...dictionaryNotices(dict),
        partial: ALL_CATEGORIES.some((c) => !s.categories[c]),
        mapRanges: (ranges) => mapRanges(ranges, r.edits, offset)
      }
    },
    unmask: (text) => unmaskText(text.normalize('NFC'), table),
    tableSize: () => table.size(),
    clear: () => table.clear()
  }
}
