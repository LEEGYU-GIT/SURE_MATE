import type { Detection } from './types'

/** 왼쪽부터, 같은 자리에서 시작하면 긴 것을 고르고, 앞에서 고른 것과 겹치는 것은 버린다(설계 문서 §8) */
export function resolveOverlaps(ds: Detection[]): Detection[] {
  const sorted = [...ds].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
  const out: Detection[] = []
  let lastEnd = -1
  for (const d of sorted) {
    if (d.start >= lastEnd) {
      out.push(d)
      lastEnd = d.end
    }
  }
  return out
}
