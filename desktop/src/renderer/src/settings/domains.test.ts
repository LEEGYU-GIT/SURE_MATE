import { expect, it } from 'vitest'
import { parseDomainsInput } from './domains'

it('쉼표·공백·줄바꿈으로 나누고 소문자로, 겹치면 하나, 잘못된 것은 따로', () => {
  expect(parseDomainsInput(' Intra.Example.com, wiki.example.co.kr\nintra.example.com  http://x.com a ')).toEqual({
    domains: ['intra.example.com', 'wiki.example.co.kr'],
    invalid: ['http://x.com', 'a']
  })
  expect(parseDomainsInput('   ')).toEqual({ domains: [], invalid: [] })
})
