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
/** 조사·요청 어미를 뗀 뒤 남아야 하는 글자 수('평가'→'평', '자란'→'자'처럼 1음절 어간을 만들지 않는다) */
export const MIN_STEM = 2
export const QWERTY_PENALTY = 50
/** 영문 자판 입력을 한글로 볼 때 바꾼 글에 있어야 하는 완성 음절 수 */
export const QWERTY_MIN_SYLLABLES = 2

const HANGUL = /[가-힣]/

interface Analysis {
  v0: string[]
  v1: string[]
  v2: string[]
  hits: Set<string>
  key: string | null
  natural: boolean
}

/** 의도 단어 하나: 낱말들(공백으로 나눈 것)과 공백을 뺀 글 */
interface IntentWord {
  parts: string[]
  compact: string
}

/** 단어 목록을 정리한 것(목록마다 한 번만 만든다) */
interface Prepared {
  /** 공백을 뺀 요청 어미, 긴 것부터 */
  endings: string[]
  /** 조사, 긴 것부터 */
  particles: string[]
  fillers: Set<string>
  /** 규칙마다 접은 의도 단어(pack.intents 순서) */
  rules: { id: string; words: IntentWord[] }[]
}

const preparedPacks = new WeakMap<IntentPack, Prepared>()

/** 단어 목록을 접고 정렬해 둔다. 같은 목록(팔레트 검색 문맥이 바뀌기 전까지 같은 객체)이면 글자를 칠 때마다 다시 하지 않는다 */
function prepare(pack: IntentPack): Prepared {
  const hit = preparedPacks.get(pack)
  if (hit) return hit
  const p: Prepared = {
    endings: [...new Set(pack.endings.map((e) => foldForMatch(e.normalize('NFC')).replace(/\s+/g, '')))].sort((a, b) => b.length - a.length),
    particles: [...new Set(pack.particles.map((x) => foldForMatch(x)))].sort((a, b) => b.length - a.length),
    fillers: new Set(pack.fillers.map((f) => foldForMatch(f))),
    rules: pack.intents.map((r) => ({
      id: r.id,
      words: r.words.map((w): IntentWord => {
        const folded = foldForMatch(w)
        return { parts: folded.split(' '), compact: folded.replace(/ /g, '') }
      })
    }))
  }
  preparedPacks.set(pack, p)
  return p
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

/**
 * 의도 단어가 낱말 목록의 이어진 낱말(의도 단어와 같은 낱말 수)과 같은 자리마다 그 낱말 번호를 hitIdx에 넣고, 하나라도 있으면 true.
 * 목록의 낱말에는 공백이 없으므로 다른 수의 이어진 낱말을 붙인 글은 의도 단어와 같을 수 없다(모든 구간을 붙여 보던 것과 결과가 같다).
 */
function matchPhrase(list: string[], w: IntentWord, hitIdx: Set<number>): boolean {
  const k = w.parts.length
  let found = false
  for (let i = 0; i + k <= list.length; i++) {
    let same = true
    for (let t = 0; t < k && same; t++) same = list[i + t] === w.parts[t]
    if (!same) continue
    found = true
    for (let t = 0; t < k; t++) hitIdx.add(i + t)
  }
  return found
}

function analyze(input: string, p: Prepared): Analysis {
  let natural = false
  // 1. 정규화
  const s = foldForMatch(input.normalize('NFC')).replace(/\s+/g, ' ').trim()
  // 2. 끝 기호와 군말
  const noPunct = s.replace(/[?!.~]+$/, '').trim()
  if (noPunct !== s) natural = true
  let words = noPunct.split(' ').filter((w) => w.length > 0)
  const noFillers = words.filter((w) => !p.fillers.has(w))
  if (noFillers.length !== words.length) natural = true
  words = noFillers
  const compact = words.join('')
  const key = compact.length >= 2 ? compact : null

  // 3. 요청 어미(최대 두 번, 두 글자 이상 남을 때만)
  let removed = ''
  for (let round = 0; round < 2; round++) {
    const now = words.join('')
    const e = p.endings.find((x) => now.endsWith(x) && now.length - x.length >= MIN_STEM)
    if (!e) break
    words = trimTail(words, e.length)
    removed = e + removed
    natural = true
  }

  // 4·5. V0, V1
  const v0 = words
  const v1 = v0.map((w) => stripParticle(w, p.particles))

  // 의도: 뗀 요청 어미 안에 있거나, V0·V1의 이어진 낱말과 같은 의도 단어
  const hits = new Set<string>()
  const hitIdx = new Set<number>()
  for (const rule of p.rules) {
    let ok = false
    for (const w of rule.words) {
      // 찾은 자리를 모두 hitIdx에 넣으려고 하나를 찾아도 멈추지 않는다
      if (removed.includes(w.compact)) ok = true
      if (matchPhrase(v0, w, hitIdx)) ok = true
      if (matchPhrase(v1, w, hitIdx)) ok = true
    }
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

/**
 * 영문 자판으로 친 한글로 볼지(설계 §13 "영문 모드로 친 한글"). 공백·끝 기호를 뺀 바꾼 글이 모두 완성 음절이고(맨 끝의 자음 하나는
 * 치는 중인 음절로 보고 세지 않는다) 완성 음절이 QWERTY_MIN_SYLLABLES개 이상일 때만이다. 영어 낱말·약어는 대개 자모가 섞이거나
 * (word→잭ㅇ, api→메ㅑ) 한 음절이 되어(ai→먀, db→유) 바꾸지 않는다.
 */
function typedInEnglishMode(converted: string): boolean {
  const letters = converted.replace(/[\s?!.~]+/g, '')
  const body = /[ㄱ-ㅎ]$/.test(letters) ? letters.slice(0, -1) : letters
  return body.length >= QWERTY_MIN_SYLLABLES && /^[가-힣]+$/.test(body)
}

export function understand(text: string, pack: IntentPack): Understood {
  const input = text.slice(0, MAX_PHRASE)
  const p = prepare(pack)
  const base = analyze(input, p)
  let variants = variantsOf(base, 0, true)
  let key = base.key
  let natural = base.natural
  const hits = new Set(base.hits)

  // 8. 영문 자판
  const trimmed = input.trim()
  if (/^[A-Za-z\s?!.~]+$/.test(trimmed) && /[A-Za-z]/.test(trimmed)) {
    const converted = fromQwerty(trimmed)
    if (typedInEnglishMode(converted)) {
      const alt = analyze(converted, p)
      for (const v of variantsOf(alt, QWERTY_PENALTY, true)) {
        if (!variants.some((x) => x.text === v.text)) variants.push(v)
      }
      for (const h of alt.hits) hits.add(h)
      // 바꾼 글에서 키를 만들지 못하면(군말뿐) 입력 그대로의 키
      key = alt.key ?? key
      natural = true
    }
  }
  variants = variants.filter((v, i, arr) => arr.findIndex((x) => x.text === v.text) === i)
  return { variants, intents: pack.intents.map((r) => r.id).filter((id) => hits.has(id)), key, natural }
}
