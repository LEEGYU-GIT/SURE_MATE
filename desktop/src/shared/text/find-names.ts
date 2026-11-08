import { foldForMatch, isAsciiAlnum, isHangulSyllable } from './normalize'

/** 찾을 이름 묶음 하나(정식 이름과 별칭). key로 어느 항목인지 돌려준다 */
export interface NameEntry {
  key: string
  names: string[]
  /** 뒤에 글자·숫자·한글이 붙으면 찾지 않는다(짧고 흔한 이름용) */
  exactOnly?: boolean
}

export interface NameHit {
  start: number
  end: number
  key: string
  /** 원문 표기 그대로 */
  original: string
}

interface Candidate {
  folded: string
  entry: NameEntry
}

/**
 * 이름을 글에서 찾는다(설계 문서 §8 찾기 규칙, §7 {{terms}}도 같은 규칙). 글은 NFC로 맞춰 둔 상태여야 한다.
 * 왼쪽부터 가장 긴 것, 겹치지 않게. 한글로 시작하면 한글 구간의 맨 앞에서만, 영문·숫자로 시작하거나 끝나면 그쪽 이웃이 영문·숫자가 아닐 때만.
 * 한글로 끝나는 이름 뒤에는 조사가 붙어도 된다. exactOnly면 뒤에 글자·숫자·한글이 오면 안 된다. 대소문자·전각은 무시한다.
 */
export function findNames(text: string, entries: NameEntry[]): NameHit[] {
  const byFirst = new Map<string, Candidate[]>()
  for (const entry of entries) {
    for (const name of new Set(entry.names)) {
      const folded = foldForMatch(name.normalize('NFC'))
      if (!folded) continue
      const list = byFirst.get(folded[0]) ?? []
      list.push({ folded, entry })
      byFirst.set(folded[0], list)
    }
  }
  for (const list of byFirst.values()) list.sort((a, b) => b.folded.length - a.folded.length)

  const folded = foldForMatch(text)
  const out: NameHit[] = []
  let i = 0
  while (i < folded.length) {
    const hit = (byFirst.get(folded[i]) ?? []).find((c) => matchesAt(folded, i, c))
    if (!hit) {
      i++
      continue
    }
    const end = i + hit.folded.length
    out.push({ start: i, end, key: hit.entry.key, original: text.slice(i, end) })
    i = end
  }
  return out
}

function matchesAt(folded: string, i: number, c: Candidate): boolean {
  if (!folded.startsWith(c.folded, i)) return false
  const first = c.folded[0]
  const last = c.folded[c.folded.length - 1]
  const prev = folded[i - 1] ?? ''
  const next = folded[i + c.folded.length] ?? ''
  if (isHangulSyllable(first) && isHangulSyllable(prev)) return false
  if (isAsciiAlnum(first) && isAsciiAlnum(prev)) return false
  if (isAsciiAlnum(last) && isAsciiAlnum(next)) return false
  if (c.entry.exactOnly && (isAsciiAlnum(next) || isHangulSyllable(next))) return false
  return true
}
