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

/** 규칙 id → 짝지은 창. 창 하나는 규칙 하나에만 배정한다 */
export function assignWindows(rules: WindowRule[], windows: LiveWindow[]): Map<string, LiveWindow> {
  const ordered = [...rules].sort(
    (a, b) => Number(hasTitleCondition(b)) - Number(hasTitleCondition(a)) || a.order - b.order
  )
  const taken = new Set<number>()
  const out = new Map<string, LiveWindow>()
  for (const rule of ordered) {
    const cands: number[] = []
    windows.forEach((w, i) => {
      if (!taken.has(i) && isCandidate(rule, w)) cands.push(i)
    })
    if (cands.length === 0) continue
    const saved = fold(rule.savedTitle)
    const pick = cands.find((i) => fold(windows[i].title) === saved) ?? cands[0]
    taken.add(pick)
    out.set(rule.id, windows[pick])
  }
  return out
}
