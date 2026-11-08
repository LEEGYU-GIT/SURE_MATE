import { homedir } from 'node:os'
import { expect, it } from 'vitest'
import { errorText } from './error-text'

it('오류 문구에서 사용자 폴더 경로를 ~로 가리고 길이를 자른다', () => {
  const e = new Error(`${homedir()}\\AppData\\Local\\Programs\\Sure-Mate\\koffi.node 를 불러오지 못함`)
  expect(errorText(e)).toBe('~\\AppData\\Local\\Programs\\Sure-Mate\\koffi.node 를 불러오지 못함')
  expect(errorText('x'.repeat(500))).toHaveLength(300)
})
