import { homedir } from 'node:os'
import { expect, it } from 'vitest'
import { errorCode, errorText } from './error-text'

it('오류 문구에서 사용자 폴더 경로를 ~로 가리고 길이를 자른다', () => {
  const e = new Error(`${homedir()}\\AppData\\Local\\Programs\\Sure-Mate\\koffi.node 를 불러오지 못함`)
  expect(errorText(e)).toBe('~\\AppData\\Local\\Programs\\Sure-Mate\\koffi.node 를 불러오지 못함')
  expect(errorText('x'.repeat(500))).toHaveLength(300)
})

it('오류 코드만 꺼낸다: 코드가 없으면 오류 이름, 오류가 아니면 unknown(글은 남기지 않는다)', () => {
  expect(errorCode(Object.assign(new Error("EBUSY: resource busy or locked, rename 'D:\\공유\\가상자동차.json'"), { code: 'EBUSY' }))).toBe('EBUSY')
  expect(errorCode(new TypeError('가상자동차'))).toBe('TypeError')
  expect(errorCode(Object.assign(new Error('x'), { code: '가상자동차' }))).toBe('Error')
  expect(errorCode('가상자동차')).toBe('unknown')
  expect(errorCode(null)).toBe('unknown')
})
