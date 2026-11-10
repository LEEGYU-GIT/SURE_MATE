import { resolveOverlaps } from './detections'
import { letterSuffix, type MappingTable } from './mapping-table'
import type { Detection, MaskCategory } from './types'
import { tokensIn } from './unmask'

export interface MaskOptions {
  mode: 'restore' | 'remove'
  /** 설정의 분류별 켜기/끄기 */
  categories: Record<MaskCategory, boolean>
  /** 확인 화면에서 이번 실행만 끈 대상(Detection.key) */
  disabledKeys: string[]
  /** 빼기 모드 표기를 바꾼 분류(설정). 없는 분류는 기본 표기. 되돌리기 토큰은 바꾸지 않는다(되돌리기가 토큰을 찾는다) */
  removeLabels?: Partial<Record<MaskCategory, string>>
}

/** 원문 [start, end)를 length 글자로 바꾼 기록(원문 위치) */
export interface MaskEdit {
  start: number
  end: number
  length: number
}

export interface AppliedMask {
  key: string
  category: MaskCategory
  original: string
  replacement: string
  count: number
}

/** 빼기 모드 표기(설계 문서 §8). 이름 분류는 뒤에 A, B…를 붙인다 */
const REMOVE_ENTITY_LABEL: Partial<Record<MaskCategory, string>> = {
  client: '고객사',
  project: '프로젝트',
  person: '담당자',
  system: '시스템'
}
const REMOVE_PATTERN_LABEL: Partial<Record<MaskCategory, string>> = {
  ip: '[IP 주소]',
  path: '[파일 경로]',
  email: '[이메일]',
  phone: '[전화번호]',
  url: '[사내 URL]'
}

/** 빼기 모드 기본 표기(설정 화면의 자리 글). 이름 분류는 뒤에 A, B…가 붙는다 */
export const defaultRemoveLabel = (c: MaskCategory): string => REMOVE_ENTITY_LABEL[c] ?? REMOVE_PATTERN_LABEL[c] ?? c

/**
 * 찾은 대상을 모드대로 바꾼다. 되돌리기 모드는 대응표의 토큰(같은 이름은 같은 토큰), 빼기 모드는 읽기 쉬운 표기(대응표 안 씀).
 * ranges는 결과 글에서 바꾼 표시의 [시작, 끝) 자리다(확인 화면에서 칠한다).
 */
export function maskText(
  text: string,
  ds: Detection[],
  o: MaskOptions,
  table: MappingTable
): { text: string; applied: AppliedMask[]; ranges: [number, number][]; edits: MaskEdit[] } {
  const disabled = new Set(o.disabledKeys)
  // 끄기(분류·항목)는 겹침 정리보다 먼저: 끈 경로·이메일 안에 든 이름·IP는 그대로 가려야 한다
  const active = resolveOverlaps(ds.filter((d) => o.categories[d.category] && !disabled.has(d.key)))
  // 원문에 이미 있는 토큰 모양(대소문자·구분자가 달라도)은 쓰지 않는다. 되돌릴 때 그 글까지 이름으로 바뀌지 않게
  const taken = tokensIn(text)
  const isTaken = (token: string): boolean => taken.has(token) || text.includes(token)
  const removeLabels = new Map<string, string>()
  const removeCounts = new Map<MaskCategory, number>()

  const removeLabel = (d: Detection): string => {
    const fixed = REMOVE_PATTERN_LABEL[d.category] ? (o.removeLabels?.[d.category] ?? REMOVE_PATTERN_LABEL[d.category]) : undefined
    if (fixed) return fixed
    const existing = removeLabels.get(d.key)
    if (existing) return existing
    const n = removeCounts.get(d.category) ?? 0
    removeCounts.set(d.category, n + 1)
    const label = `${o.removeLabels?.[d.category] ?? REMOVE_ENTITY_LABEL[d.category]}${letterSuffix(n)}`
    removeLabels.set(d.key, label)
    return label
  }

  let out = ''
  let pos = 0
  const ranges: [number, number][] = []
  const edits: MaskEdit[] = []
  const applied = new Map<string, AppliedMask>()
  for (const d of active) {
    out += text.slice(pos, d.start)
    const replacement = o.mode === 'restore' ? table.tokenFor(d.category, d.key, d.original, isTaken) : removeLabel(d)
    ranges.push([out.length, out.length + replacement.length])
    edits.push({ start: d.start, end: d.end, length: replacement.length })
    out += replacement
    pos = d.end
    const seen = applied.get(d.key)
    if (seen) seen.count++
    else applied.set(d.key, { key: d.key, category: d.category, original: d.original, replacement, count: 1 })
  }
  out += text.slice(pos)
  return { text: out, applied: [...applied.values()], ranges, edits }
}

/**
 * 원문 위치의 구간을 가린 뒤(그리고 앞에 offset 글자를 붙인 뒤) 위치로 옮긴다.
 * 가린 자리 안쪽 위치는 시작이면 표시의 시작, 끝이면 표시의 끝으로 맞춘다.
 */
export function mapRanges(ranges: [number, number][], edits: MaskEdit[], offset: number): [number, number][] {
  const map = (x: number, isStart: boolean): number => {
    let delta = 0
    for (const e of edits) {
      if (x >= e.end) {
        delta += e.length - (e.end - e.start)
        continue
      }
      if (x > e.start) return offset + e.start + delta + (isStart ? 0 : e.length)
      break
    }
    return offset + x + delta
  }
  return ranges.map(([s, e]): [number, number] => [map(s, true), map(e, false)])
}

/** 가린 것이 있을 때 프롬프트 맨 위에 붙이는 한 줄(설계 문서 §8). 빼기 모드는 설정에서 바꾼 표기를 예로 든다 */
export function maskPreamble(mode: 'restore' | 'remove', removeLabels: Partial<Record<MaskCategory, string>> = {}): string {
  if (mode === 'restore') return 'CLIENT_A, IP_1 같은 표시는 가린 이름입니다. 바꾸거나 풀어 쓰지 말고 그대로 써 주세요.'
  const client = `${removeLabels.client ?? REMOVE_ENTITY_LABEL.client}A`
  const ip = removeLabels.ip ?? REMOVE_PATTERN_LABEL.ip
  return `'${client}', '${ip}' 같은 표시는 가린 정보입니다. 실제 이름을 추측하지 말고 표시 그대로 써 주세요.`
}
