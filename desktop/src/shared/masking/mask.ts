import { resolveOverlaps } from './detections'
import { letterSuffix, type MappingTable } from './mapping-table'
import type { Detection, MaskCategory } from './types'

export interface MaskOptions {
  mode: 'restore' | 'remove'
  /** 설정의 분류별 켜기/끄기 */
  categories: Record<MaskCategory, boolean>
  /** 확인 화면에서 이번 실행만 끈 대상(Detection.key) */
  disabledKeys: string[]
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

/**
 * 찾은 대상을 모드대로 바꾼다. 되돌리기 모드는 대응표의 토큰(같은 이름은 같은 토큰), 빼기 모드는 읽기 쉬운 표기(대응표 안 씀).
 * ranges는 결과 글에서 바꾼 표시의 [시작, 끝) 자리다(확인 화면에서 칠한다).
 */
export function maskText(
  text: string,
  ds: Detection[],
  o: MaskOptions,
  table: MappingTable
): { text: string; applied: AppliedMask[]; ranges: [number, number][] } {
  const disabled = new Set(o.disabledKeys)
  const active = resolveOverlaps(ds).filter((d) => o.categories[d.category] && !disabled.has(d.key))
  const isTaken = (token: string): boolean => text.includes(token)
  const removeLabels = new Map<string, string>()
  const removeCounts = new Map<MaskCategory, number>()

  const removeLabel = (d: Detection): string => {
    const fixed = REMOVE_PATTERN_LABEL[d.category]
    if (fixed) return fixed
    const existing = removeLabels.get(d.key)
    if (existing) return existing
    const n = removeCounts.get(d.category) ?? 0
    removeCounts.set(d.category, n + 1)
    const label = `${REMOVE_ENTITY_LABEL[d.category]}${letterSuffix(n)}`
    removeLabels.set(d.key, label)
    return label
  }

  let out = ''
  let pos = 0
  const ranges: [number, number][] = []
  const applied = new Map<string, AppliedMask>()
  for (const d of active) {
    out += text.slice(pos, d.start)
    const replacement = o.mode === 'restore' ? table.tokenFor(d.category, d.key, d.original, isTaken) : removeLabel(d)
    ranges.push([out.length, out.length + replacement.length])
    out += replacement
    pos = d.end
    const seen = applied.get(d.key)
    if (seen) seen.count++
    else applied.set(d.key, { key: d.key, category: d.category, original: d.original, replacement, count: 1 })
  }
  out += text.slice(pos)
  return { text: out, applied: [...applied.values()], ranges }
}

/** 가린 것이 있을 때 프롬프트 맨 위에 붙이는 한 줄(설계 문서 §8) */
export function maskPreamble(mode: 'restore' | 'remove'): string {
  return mode === 'restore'
    ? 'CLIENT_A, IP_1 같은 표시는 가린 이름입니다. 바꾸거나 풀어 쓰지 말고 그대로 써 주세요.'
    : "'고객사A', '[IP 주소]' 같은 표시는 가린 정보입니다. 실제 이름을 추측하지 말고 표시 그대로 써 주세요."
}
