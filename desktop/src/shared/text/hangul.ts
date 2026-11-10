// 한글 검색 키(설계 문서 §9): 초성, 자모(치는 순서), 두벌식 자판 글자. 유니코드 산술로 직접 나눈다.

const SYLLABLE_FIRST = 0xac00
const SYLLABLE_LAST = 0xd7a3
const JUNG_COUNT = 21
const JONG_COUNT = 28

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ']
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']

/** 겹모음·겹받침을 치는 순서의 기본 자모로(쌍자음은 Shift 한 키라 그대로) */
const SPLIT: Record<string, string> = {
  ㅘ: 'ㅗㅏ',
  ㅙ: 'ㅗㅐ',
  ㅚ: 'ㅗㅣ',
  ㅝ: 'ㅜㅓ',
  ㅞ: 'ㅜㅔ',
  ㅟ: 'ㅜㅣ',
  ㅢ: 'ㅡㅣ',
  ㄳ: 'ㄱㅅ',
  ㄵ: 'ㄴㅈ',
  ㄶ: 'ㄴㅎ',
  ㄺ: 'ㄹㄱ',
  ㄻ: 'ㄹㅁ',
  ㄼ: 'ㄹㅂ',
  ㄽ: 'ㄹㅅ',
  ㄾ: 'ㄹㅌ',
  ㄿ: 'ㄹㅍ',
  ㅀ: 'ㄹㅎ',
  ㅄ: 'ㅂㅅ'
}

/** 두벌식 자판 */
const QWERTY: Record<string, string> = {
  ㄱ: 'r',
  ㄲ: 'R',
  ㄴ: 's',
  ㄷ: 'e',
  ㄸ: 'E',
  ㄹ: 'f',
  ㅁ: 'a',
  ㅂ: 'q',
  ㅃ: 'Q',
  ㅅ: 't',
  ㅆ: 'T',
  ㅇ: 'd',
  ㅈ: 'w',
  ㅉ: 'W',
  ㅊ: 'c',
  ㅋ: 'z',
  ㅌ: 'x',
  ㅍ: 'v',
  ㅎ: 'g',
  ㅏ: 'k',
  ㅐ: 'o',
  ㅑ: 'i',
  ㅒ: 'O',
  ㅓ: 'j',
  ㅔ: 'p',
  ㅕ: 'u',
  ㅖ: 'P',
  ㅗ: 'h',
  ㅛ: 'y',
  ㅜ: 'n',
  ㅠ: 'b',
  ㅡ: 'm',
  ㅣ: 'l'
}

/** 한글 호환 자음(ㄱ~ㅎ) */
const isConsonantJamo = (ch: string): boolean => ch >= 'ㄱ' && ch <= 'ㅎ'

/** 한글 음절이면 [초성, 중성, 종성] 자리, 아니면 null */
function parts(ch: string): [number, number, number] | null {
  const code = ch.charCodeAt(0)
  if (ch.length !== 1 || code < SYLLABLE_FIRST || code > SYLLABLE_LAST) return null
  const index = code - SYLLABLE_FIRST
  return [Math.floor(index / (JUNG_COUNT * JONG_COUNT)), Math.floor((index % (JUNG_COUNT * JONG_COUNT)) / JONG_COUNT), index % JONG_COUNT]
}

/** 한글 음절은 초성으로, 한글 자음은 그대로 두고 나머지(영문·숫자·공백·기호)는 뺀다 */
export function getChoseong(s: string): string {
  let out = ''
  for (const ch of s) {
    const p = parts(ch)
    if (p) out += CHO[p[0]]
    else if (isConsonantJamo(ch)) out += ch
  }
  return out
}

/** 음절과 겹자모를 치는 순서의 기본 자모로 나눈다('과'→'ㄱㅗㅏ'). 한글이 아닌 글자는 그대로 */
export function disassemble(s: string): string {
  let out = ''
  for (const ch of s) {
    const p = parts(ch)
    if (p) {
      const jung = JUNG[p[1]]
      const jong = JONG[p[2]]
      out += CHO[p[0]] + (SPLIT[jung] ?? jung) + (SPLIT[jong] ?? jong)
    } else {
      out += SPLIT[ch] ?? ch
    }
  }
  return out
}

/** 자모를 두벌식 자판 글자로 바꾼다(쌍자음·ㅒ·ㅖ는 대문자). 자모가 아닌 글자는 그대로 */
export function toQwerty(jamo: string): string {
  let out = ''
  for (const ch of jamo) out += QWERTY[ch] ?? ch
  return out
}

/** 공백을 빼고 한글 자음 자모만으로 된 글인지(초성 검색어) */
export function isChoseongOnly(s: string): boolean {
  const compact = s.replace(/\s+/g, '')
  return compact.length > 0 && [...compact].every(isConsonantJamo)
}

// ---- 두벌식 자판 글자 → 한글 조합(toQwerty의 역) ----

const KEY_TO_JAMO: Record<string, string> = {}
for (const [jamo, key] of Object.entries(QWERTY)) KEY_TO_JAMO[key] = jamo

const COMPOUND_JUNG: Record<string, string> = { ㅗㅏ: 'ㅘ', ㅗㅐ: 'ㅙ', ㅗㅣ: 'ㅚ', ㅜㅓ: 'ㅝ', ㅜㅔ: 'ㅞ', ㅜㅣ: 'ㅟ', ㅡㅣ: 'ㅢ' }
const COMPOUND_JONG: Record<string, string> = {
  ㄱㅅ: 'ㄳ', ㄴㅈ: 'ㄵ', ㄴㅎ: 'ㄶ', ㄹㄱ: 'ㄺ', ㄹㅁ: 'ㄻ', ㄹㅂ: 'ㄼ', ㄹㅅ: 'ㄽ', ㄹㅌ: 'ㄾ', ㄹㅍ: 'ㄿ', ㄹㅎ: 'ㅀ', ㅂㅅ: 'ㅄ'
}

/** 키 글자 하나를 자모로. Shift 쌍자음·ㅒ·ㅖ(R E Q T W O P) 외 대문자는 소문자와 같다. 자판에 없으면 null */
function keyToJamo(ch: string): string | null {
  return KEY_TO_JAMO[ch] ?? KEY_TO_JAMO[ch.toLowerCase()] ?? null
}

/**
 * 영문 자판으로 친 글자를 한글로 조합한다(두벌식). 겹모음·겹받침을 만들고, 받침 뒤에 모음이 오면
 * 받침(겹받침이면 뒤 자음)이 다음 음절 초성으로 넘어간다. ㄸ·ㅃ·ㅉ는 받침이 되지 않는다.
 * 자판에 없는 글자(공백·숫자·기호)는 그대로 두고 조합을 끊는다.
 */
export function fromQwerty(s: string): string {
  let out = ''
  let cho = ''
  let jung = ''
  let jong = ''
  const flush = (): void => {
    if (cho && jung) {
      out += String.fromCharCode(SYLLABLE_FIRST + (CHO.indexOf(cho) * JUNG_COUNT + JUNG.indexOf(jung)) * JONG_COUNT + JONG.indexOf(jong))
    } else {
      out += cho + jung + jong
    }
    cho = jung = jong = ''
  }
  for (const ch of s) {
    const j = keyToJamo(ch)
    if (j === null) {
      flush()
      out += ch
    } else if (JUNG.includes(j)) {
      if (jong) {
        const second = jong.length ? ([...Object.entries(COMPOUND_JONG)].find(([, v]) => v === jong)?.[0] ?? '') : ''
        const keep = second ? second[0] : ''
        const move = second ? second[1] : jong
        jong = keep
        flush()
        cho = move
        jung = j
      } else if (cho && jung) {
        const c = COMPOUND_JUNG[jung + j]
        if (c) jung = c
        else {
          flush()
          jung = j
        }
      } else if (jung) {
        flush()
        jung = j
      } else {
        jung = j
      }
    } else if (!cho && !jung) {
      cho = j
    } else if (!jung) {
      flush()
      cho = j
    } else if (!cho) {
      flush()
      cho = j
    } else if (!jong) {
      if (JONG.includes(j)) jong = j
      else {
        flush()
        cho = j
      }
    } else {
      const c = COMPOUND_JONG[jong + j]
      if (c) jong = c
      else {
        flush()
        cho = j
      }
    }
  }
  flush()
  return out
}
