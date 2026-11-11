import type { WindowInfo } from '../types'
import { foldForMatch } from '../text/normalize'
import type { WindowRule } from './types'

export type LiveWindow = Pick<
  WindowInfo,
  'hwnd' | 'exe' | 'className' | 'title' | 'minimized' | 'maximized' | 'elevated'
>

const fold = (s: string): string => foldForMatch(s.normalize('NFC'))

function regexMatches(re: string, title: string): boolean {
  try {
    return new RegExp(re, 'iu').test(title)
  } catch {
    return false
  }
}

function isCandidate(rule: WindowRule, w: LiveWindow): boolean {
  const m = rule.match
  if (w.exe.toLowerCase() !== m.exe.toLowerCase()) return false
  if (m.className !== undefined && m.className !== '' && w.className !== m.className) return false
  const title = w.title.normalize('NFC')
  if (m.titleIncludes && !fold(title).includes(fold(m.titleIncludes))) return false
  if (m.titleRegex && !regexMatches(m.titleRegex, title)) return false
  return true
}

const hasTitleCondition = (r: WindowRule): boolean => !!r.match.titleIncludes || !!r.match.titleRegex

/** 제목 조각의 길이(접은 글자 수). 조각이 없으면 0 */
const fragmentLength = (r: WindowRule): number => (r.match.titleIncludes ? fold(r.match.titleIncludes).length : 0)

/**
 * 규칙 id → 짝지은 창. 창 하나는 규칙 하나에만 배정한다.
 * 1) 모든 규칙에 저장할 때 제목과 같은 창을 먼저 짝짓는다. 2) 남은 규칙은 제목 조건이 있는 것, 그중 긴 제목 조각부터
 * z-순서가 앞인 후보를 가져간다: 'A.xlsx'는 'BA.xlsx - Excel'에도 들어 있어 짧은 조각이 먼저 고르면 다른 문서 창을
 * 옮긴다(A-M2). 같으면 저장한 z-순서(order).
 */
export function assignWindows(rules: WindowRule[], windows: LiveWindow[]): Map<string, LiveWindow> {
  const ordered = [...rules].sort(
    (a, b) => Number(hasTitleCondition(b)) - Number(hasTitleCondition(a)) || fragmentLength(b) - fragmentLength(a) || a.order - b.order
  )
  const taken = new Set<number>()
  const out = new Map<string, LiveWindow>()
  const candidates = (rule: WindowRule): number[] => {
    const cands: number[] = []
    windows.forEach((w, i) => {
      if (!taken.has(i) && isCandidate(rule, w)) cands.push(i)
    })
    return cands
  }
  const assign = (rule: WindowRule, i: number): void => {
    taken.add(i)
    out.set(rule.id, windows[i])
  }
  for (const rule of ordered) {
    const saved = fold(rule.savedTitle)
    const exact = candidates(rule).find((i) => fold(windows[i].title) === saved)
    if (exact !== undefined) assign(rule, exact)
  }
  for (const rule of ordered) {
    if (out.has(rule.id)) continue
    const [first] = candidates(rule)
    if (first !== undefined) assign(rule, first)
  }
  return out
}
