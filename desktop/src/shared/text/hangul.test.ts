import { expect, it } from 'vitest'
import { disassemble, getChoseong, isChoseongOnly, toQwerty } from './hangul'

it('초성: 한글 음절은 초성으로, 한글 자음은 그대로, 나머지(영문·숫자·공백·기호)는 뺀다', () => {
  expect(getChoseong('정적분석')).toBe('ㅈㅈㅂㅅ')
  expect(getChoseong('회의록 정리')).toBe('ㅎㅇㄹㅈㄹ')
  expect(getChoseong('MC/DC 커버리지')).toBe('ㅋㅂㄹㅈ')
  expect(getChoseong('ㅈ정')).toBe('ㅈㅈ')
})

it('자모: 음절과 겹자모를 치는 순서의 기본 자모로 나눈다(쌍자음은 한 키)', () => {
  expect(disassemble('간')).toBe('ㄱㅏㄴ')
  expect(disassemble('과')).toBe('ㄱㅗㅏ')
  expect(disassemble('읽')).toBe('ㅇㅣㄹㄱ')
  expect(disassemble('까닭')).toBe('ㄲㅏㄷㅏㄹㄱ')
  expect(disassemble('의')).toBe('ㅇㅡㅣ')
  expect(disassemble('MC/DC 가')).toBe('MC/DC ㄱㅏ')
})

it('자판: 자모를 두벌식 자판 글자로(쌍자음·ㅒ·ㅖ는 대문자)', () => {
  expect(toQwerty(disassemble('검색'))).toBe('rjator')
  expect(toQwerty(disassemble('정적분석'))).toBe('wjdwjrqnstjr')
  expect(toQwerty(disassemble('까'))).toBe('Rk')
  expect(toQwerty(disassemble('예'))).toBe('dP')
  expect(toQwerty('MC/DC 1')).toBe('MC/DC 1')
})

it('초성만 친 검색어인지(공백은 봐준다)', () => {
  expect(isChoseongOnly('ㅈㅈㅂㅅ')).toBe(true)
  expect(isChoseongOnly('ㅎㅇㄹ ㅈㄹ')).toBe(true)
  expect(isChoseongOnly('ㅈ정')).toBe(false)
  expect(isChoseongOnly('ㅏ')).toBe(false)
  expect(isChoseongOnly('')).toBe(false)
  expect(isChoseongOnly(' ')).toBe(false)
})
