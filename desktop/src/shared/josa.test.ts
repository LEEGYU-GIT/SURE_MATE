import { expect, it } from 'vitest'
import { hasFinalConsonant, withObjectParticle } from './josa'

it('한글은 마지막 글자의 받침으로 판단한다', () => {
  expect(hasFinalConsonant('챗봇')).toBe(true)
  expect(hasFinalConsonant('클로드')).toBe(false)
})

it('영문·숫자로 끝나면 읽는 소리로 판단한다(L·M·N·R, 0·1·3·6·7·8은 받침 있음)', () => {
  expect(hasFinalConsonant('사내 LLM')).toBe(true)
  expect(hasFinalConsonant('Claude')).toBe(false)
  expect(hasFinalConsonant('ChatGPT')).toBe(false)
  expect(hasFinalConsonant('GPT-4')).toBe(false)
  expect(hasFinalConsonant('모델 3')).toBe(true)
  expect(hasFinalConsonant(')')).toBeNull()
})

it('목적격 조사 을/를을 붙인다', () => {
  expect(withObjectParticle('Claude')).toBe('Claude를')
  expect(withObjectParticle('Gemini')).toBe('Gemini를')
  expect(withObjectParticle('사내 LLM')).toBe('사내 LLM을')
  expect(withObjectParticle('사내 챗봇')).toBe('사내 챗봇을')
})
