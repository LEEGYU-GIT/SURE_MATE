import { expect, it } from 'vitest'
import { hasFinalConsonant, repickParticle, withObjectParticle } from './josa'

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

it('되돌린 이름 뒤 조사를 이름의 받침에 맞게 다시 고른다', () => {
  expect(repickParticle('XY방산', '는 다음')).toEqual({ particle: '은', length: 1 })
  expect(repickParticle('가상자동차', '을')).toEqual({ particle: '를', length: 1 })
  expect(repickParticle('가상자동차', '이 ')).toEqual({ particle: '가', length: 1 })
  expect(repickParticle('XY방산', '와')).toEqual({ particle: '과', length: 1 })
  expect(repickParticle('XY방산', '라고')).toEqual({ particle: '이라', length: 1 })
  expect(repickParticle('10.0.3.15', '를')).toEqual({ particle: '를', length: 1 })
})

it('ㄹ 받침(서울, 영문 L, 숫자 1·7·8)이면 으로가 아니라 로', () => {
  expect(repickParticle('서울', '으로')).toEqual({ particle: '로', length: 2 })
  expect(repickParticle('XY방산', '로')).toEqual({ particle: '으로', length: 1 })
  expect(repickParticle('PORTAL', '으로')).toEqual({ particle: '로', length: 2 })
  expect(repickParticle('서버 7', '으로')).toEqual({ particle: '로', length: 2 })
})

it('겹조사(와의·과는·로부터·로서·로써)도 다시 고르고, 낱말(로그·과정)은 건드리지 않는다', () => {
  expect(repickParticle('XY방산', '와의')).toEqual({ particle: '과', length: 1 })
  expect(repickParticle('가상자동차', '과는')).toEqual({ particle: '와', length: 1 })
  expect(repickParticle('XY방산', '로부터')).toEqual({ particle: '으로', length: 1 })
  expect(repickParticle('XY방산', '로서')).toEqual({ particle: '으로', length: 1 })
  expect(repickParticle('XY방산', '로써')).toEqual({ particle: '으로', length: 1 })
  expect(repickParticle('XY방산', '로그')).toBeNull()
  expect(repickParticle('가상자동차', '과정')).toBeNull()
})

it('조사가 아니면 건드리지 않는다(이다·가장처럼 낱말의 일부, 짝 없는 조사)', () => {
  expect(repickParticle('가상자동차', '이다')).toBeNull()
  expect(repickParticle('XY방산', '가장')).toBeNull()
  expect(repickParticle('Claude', '에서')).toBeNull()
  expect(repickParticle('XY방산', '')).toBeNull()
})

it('목적격 조사 을/를을 붙인다', () => {
  expect(withObjectParticle('Claude')).toBe('Claude를')
  expect(withObjectParticle('Gemini')).toBe('Gemini를')
  expect(withObjectParticle('사내 LLM')).toBe('사내 LLM을')
  expect(withObjectParticle('사내 챗봇')).toBe('사내 챗봇을')
})
