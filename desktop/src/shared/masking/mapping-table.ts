import { ENTITY_CATEGORIES, type MaskCategory } from './types'

/** 되돌리기 모드 토큰 접두어(설계 문서 §8 표기) */
export const TOKEN_PREFIX: Record<MaskCategory, string> = {
  client: 'CLIENT',
  project: 'PROJECT',
  person: 'PERSON',
  system: 'SYSTEM',
  ip: 'IP',
  path: 'PATH',
  email: 'EMAIL',
  phone: 'PHONE',
  url: 'URL'
}

const isEntity = (c: MaskCategory): boolean => (ENTITY_CATEGORIES as readonly string[]).includes(c)

/** 0 → A, 25 → Z, 26 → AA, 27 → AB … */
export function letterSuffix(n: number): string {
  let s = ''
  let x = n + 1
  while (x > 0) {
    const r = (x - 1) % 26
    s = String.fromCharCode(65 + r) + s
    x = Math.floor((x - 1) / 26)
  }
  return s
}

interface Entry {
  token: string
  category: MaskCategory
  original: string
}

/**
 * 원문 ↔ 토큰 대응표(설계 문서 §8). main 메모리에만 두고 디스크에 쓰지 않는다.
 * 마지막으로 쓴 뒤 ttl이 지나면 통째로 비운다. 미리 보기는 fork()한 복사본을 써서 토큰을 확정하지 않는다.
 */
export class MappingTable {
  private byKey = new Map<string, Entry>()
  private byToken = new Map<string, Entry>()
  private counters = new Map<MaskCategory, number>()
  private lastUsed: number

  constructor(private readonly o: { now: () => number; ttlMs: number }) {
    this.lastUsed = o.now()
  }

  private touch(): void {
    const now = this.o.now()
    if (now - this.lastUsed > this.o.ttlMs) this.clear()
    this.lastUsed = now
  }

  /** 키에 붙은 토큰. 없으면 다음 토큰을 만들되 이미 쓴 것과 isTaken인 것(원문에 이미 있는 모양)은 건너뛴다 */
  tokenFor(category: MaskCategory, key: string, original: string, isTaken: (token: string) => boolean): string {
    this.touch()
    const existing = this.byKey.get(key)
    if (existing) return existing.token
    let n = this.counters.get(category) ?? 0
    let token: string
    do {
      token = `${TOKEN_PREFIX[category]}_${isEntity(category) ? letterSuffix(n) : String(n + 1)}`
      n++
    } while (this.byToken.has(token) || isTaken(token))
    this.counters.set(category, n)
    const entry: Entry = { token, category, original }
    this.byKey.set(key, entry)
    this.byToken.set(token, entry)
    return token
  }

  /** 정확한 토큰(대문자, PREFIX_TAIL)으로 원문을 찾는다 */
  lookup(token: string): { original: string; category: MaskCategory } | undefined {
    this.touch()
    const e = this.byToken.get(token)
    return e ? { original: e.original, category: e.category } : undefined
  }

  /** 지금 내용을 복사한 새 표(미리 보기용). 복사본에 더한 토큰은 원래 표에 남지 않는다 */
  fork(): MappingTable {
    const copy = new MappingTable(this.o)
    copy.byKey = new Map(this.byKey)
    copy.byToken = new Map(this.byToken)
    copy.counters = new Map(this.counters)
    copy.lastUsed = this.lastUsed
    return copy
  }

  size(): number {
    return this.byKey.size
  }

  /**
   * 대응표를 비운다. 글자 카운터는 남겨 앱이 켜져 있는 동안 같은 토큰을 다시 쓰지 않는다.
   * 그래야 비운 뒤 옛 답의 CLIENT_A를 되돌릴 때 새 고객사 이름이 조용히 들어가지 않고 '모르는 표시'로 알린다.
   */
  clear(): void {
    this.byKey.clear()
    this.byToken.clear()
  }
}
