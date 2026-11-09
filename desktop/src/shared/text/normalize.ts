/** 글자 하나의 전각 ASCII(U+FF01~FF5E)는 반각, 전각 공백(U+3000)은 공백으로 */
const narrow = (text: string, i: number): string => {
  const code = text.charCodeAt(i)
  if (code >= 0xff01 && code <= 0xff5e) return String.fromCharCode(code - 0xfee0)
  if (code === 0x3000) return ' '
  return text[i]
}

/**
 * 전각·반각만 맞춘다(대소문자는 그대로). 글자마다 1:1로 바꾸므로 길이가 그대로다.
 * {{terms}}에서 대소문자를 구분해 찾는 이름(영문 대문자 약어)에 쓴다.
 */
export function foldWidth(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) out += narrow(text, i)
  return out
}

/**
 * 찾기용 정규화(설계 문서 §8·§9): 전각 ASCII(U+FF01~FF5E)는 반각, 전각 공백(U+3000)은 공백, 대문자는 소문자.
 * 원문과 위치를 맞추려고 글자마다 1:1로 바꾸며 길이가 그대로다(소문자로 바꾸면 길이가 달라지는 글자는 그대로 둔다).
 * NFKC는 쓰지 않는다(초성 검색이 깨진다). NFC는 원문을 받을 때 한 번 맞춘다.
 */
export function foldForMatch(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = narrow(text, i)
    const lower = ch.toLowerCase()
    out += lower.length === 1 ? lower : ch
  }
  return out
}

export const isHangulSyllable = (ch: string): boolean => {
  const code = ch.charCodeAt(0)
  return code >= 0xac00 && code <= 0xd7a3
}

export const isAsciiAlnum = (ch: string): boolean => /^[A-Za-z0-9]$/.test(ch)
