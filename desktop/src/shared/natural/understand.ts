// 말하듯 입력 문장 이해(설계 §13 1~7단계 + 영문 자판). 순수 함수이며 문장을 기록하지 않는다.
import { fromQwerty } from '../text/hangul'
import { foldForMatch } from '../text/normalize'
import type { IntentPack } from './intent-pack'

export interface Understood {
  variants: { text: string; penalty: number; typo: boolean }[]
  intents: string[]
  key: string | null
  natural: boolean
}

export const MAX_PHRASE = 200
export const MIN_STEM = 2
export const QWERTY_PENALTY = 50

const HANGUL = /[가-힣]/
const compactLen = (s: string): number => s.replace(/\s+/g, '').length

interface Analysis {
  v0: string[]
  v1: string[]
  v2: string[]
  hits: Set<string>
  key: string | null
  natural: boolean
}

/** 끝에서부터 count글자(공백은 건너뜀)를 낱말 목록에서 뺀다 */
function trimTail(words: string[], count: number): string[] {
  const out = [...words]
  let left = count
  while (left > 0 && out.length > 0) {
    const last = out[out.length - 1]
    if (last.length <= left) {
      left -= last.length
      out.pop()
    } else {
      out[out.length - 1] = last.slice(0, last.length - left)
      left = 0
    }
  }
  return out
}

function stripParticle(word: string, particles: string[]): string {
  const m = /^(.*[^가-힣])([가-힣]+)$/.exec(word)
  if (m) return particles.includes(m[2]) ? m[1] : word
  if (!HANGUL.test(word) || !/[가-힣]$/.test(word)) return word
  for (const p of particles) {
    if (word.endsWith(p) && word.length - p.length >= MIN_STEM) return word.slice(0, word.length - p.length)
  }
  return word
}

function analyze(input: string, pack: IntentPack, sorted: { endings: string[]; particles: string[]; fillers: Set<string> }): Analysis {
  let natural = false
  // 1. 정규화
  let s = foldForMatch(input.normalize('NFC')).replace(/\s+/g, ' ').trim()
  // 2. 끝 기호와 군말
  const noPunct = s.replace(/[?!.~]+$/, '').trim()
  if (noPunct !== s) natural = true
  let words = noPunct.split(' ').filter((w) => w.length > 0)
  const noFillers = words.filter((w) => !sorted.fillers.has(w))
  if (noFillers.length !== words.length) natural = true
  words = noFillers
  const compact = words.join('')
  const key = compact.length >= 2 ? compact : null

  // 3. 요청 어미(최대 두 번)
  let removed = ''
  for (let round = 0; round < 2; round++) {
    const now = words.join('')
    const e = sorted.endings.find((x) => now.endsWith(x) && now.length - x.length >= 1)
    if (!e) break
    words = trimTail(words, e.length)
    removed = e + removed
    natural = true
  }

  // 4·5. V0, V1
  const v0 = words
  const v1 = v0.map((w) => stripParticle(w, sorted.particles))

  // 의도
  const hits = new Set<string>()
  const hitIdx = new Set<number>()
  const matchWord = (w: string): boolean => {
    let found = false
    if (removed.includes(w.replace(/ /g, ''))) found = true
    for (const list of [v0, v1]) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i; j < list.length; j++) {
          if (list.slice(i, j + 1).join(' ') === w) {
            found = true
            for (let k = i; k <= j; k++) hitIdx.add(k)
          }
        }
      }
    }
    return found
  }
  for (const rule of pack.intents) {
    let ok = false
    for (const w of rule.words) if (matchWord(foldForMatch(w))) ok = true
    if (ok) hits.add(rule.id)
  }
  if (hits.size > 0) natural = true
  const v2 = v1.filter((_, i) => !hitIdx.has(i))
  return { v0, v1, v2, hits, key, natural }
}

function variantsOf(a: Analysis, base: number, firstTypo: boolean): Understood['variants'] {
  const out: Understood['variants'] = []
  const t0 = a.v0.join(' ')
  const t1 = a.v1.join(' ')
  const t2 = a.v2.join(' ')
  if (t0) out.push({ text: t0, penalty: base, typo: firstTypo })
  if (t0 && t1 !== t0) out.push({ text: t1, penalty: base + 1, typo: false })
  if (t2 && t2 !== t1) out.push({ text: t2, penalty: base + 2, typo: false })
  return out
}

export function understand(text: string, pack: IntentPack): Understood {
  const input = text.slice(0, MAX_PHRASE)
  const sorted = {
    endings: [...new Set(pack.endings.map((e) => foldForMatch(e.normalize('NFC')).replace(/\s+/g, '')))].sort((a, b) => b.length - a.length),
    particles: [...new Set(pack.particles.map((p) => foldForMatch(p)))].sort((a, b) => b.length - a.length),
    fillers: new Set(pack.fillers.map((f) => foldForMatch(f)))
  }
  const base = analyze(input, pack, sorted)
  let variants = variantsOf(base, 0, true)
  let key = base.key
  let natural = base.natural
  const hits = new Set(base.hits)

  // 8. 영문 자판
  const trimmed = input.trim()
  if (/^[A-Za-z\s?!.~]+$/.test(trimmed) && /[A-Za-z]/.test(trimmed)) {
    const converted = fromQwerty(trimmed)
    const syllables = [...converted].filter((c) => HANGUL.test(c)).length
    if (syllables * 2 >= compactLen(converted)) {
      const alt = analyze(converted, pack, sorted)
      for (const v of variantsOf(alt, QWERTY_PENALTY, true)) {
        if (!variants.some((x) => x.text === v.text)) variants.push(v)
      }
      for (const h of alt.hits) hits.add(h)
      key = alt.key
      natural = true
    }
  }
  variants = variants.filter((v, i, arr) => arr.findIndex((x) => x.text === v.text) === i)
  return { variants, intents: pack.intents.map((r) => r.id).filter((id) => hits.has(id)), key, natural }
}
