import { expect, it } from 'vitest'
import { foldForMatch, foldWidth, isAsciiAlnum, isHangulSyllable } from './normalize'

it('전각 영문·숫자·기호는 반각으로, 전각 공백은 공백으로, 대문자는 소문자로 바꾸고 길이는 그대로', () => {
  const s = 'ＡＢＣ　가ＸＹ１２！'
  const f = foldForMatch(s)
  expect(f).toBe('abc 가xy12!')
  expect(f).toHaveLength(s.length)
})

it('foldWidth는 전각·반각만 맞추고 대소문자는 그대로 둔다', () => {
  const s = 'ＭＣ／ＤＣ　가 Can'
  expect(foldWidth(s)).toBe('MC/DC 가 Can')
  expect(foldWidth(s)).toHaveLength(s.length)
})

it('한글은 그대로 두고 영문만 소문자로', () => {
  expect(foldForMatch('GP 서버')).toBe('gp 서버')
})

it('글자 종류를 가린다', () => {
  expect(isHangulSyllable('가')).toBe(true)
  expect(isHangulSyllable('ㄱ')).toBe(false)
  expect(isHangulSyllable('a')).toBe(false)
  expect(isAsciiAlnum('a')).toBe(true)
  expect(isAsciiAlnum('Z')).toBe(true)
  expect(isAsciiAlnum('5')).toBe(true)
  expect(isAsciiAlnum('가')).toBe(false)
  expect(isAsciiAlnum('_')).toBe(false)
  expect(isAsciiAlnum('')).toBe(false)
})
