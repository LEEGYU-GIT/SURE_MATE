import { expect, it } from 'vitest'
import { fileErrorNotice } from './file-error-notice'

const SKIPPED = 'glossary.json: 2번째 항목: 설명은 1~1,000자(u2)'
const TRIMMED = 'glossary.json: 3번째 항목: 별칭 0·태그 1·링크 0개를 뺐어요(http/https 링크 5개, 태그 5개까지)(u3)'

it('읽지 못해 건너뛴 것만 있으면 지금처럼 건너뛰었다고 알리고 첫 까닭을 붙인다', () => {
  expect(fileErrorNotice({ what: '프롬프트 템플릿', errors: ['a.json: 읽지 못함(SyntaxError)', 'b.json: 1번째 템플릿: 본문이 없음(x)'] })).toBe(
    '프롬프트 템플릿 2건을 읽지 못해 건너뛰었어요. a.json: 읽지 못함(SyntaxError)'
  )
  expect(fileErrorNotice({ what: '용어', errors: [SKIPPED], trimmed: 0 })).toBe(`용어 1건을 읽지 못해 건너뛰었어요. ${SKIPPED}`)
})

it('일부 값만 빼고 읽은 용어는 건너뛰었다고 하지 않는다(목록에 있다)', () => {
  expect(fileErrorNotice({ what: '용어', errors: [TRIMMED], trimmed: 1 })).toBe(`용어 1건은 링크·태그 등 일부 값을 빼고 읽었어요. ${TRIMMED}`)
})

it('둘 다 있으면 따로 센다', () => {
  expect(fileErrorNotice({ what: '용어', errors: [SKIPPED, TRIMMED, TRIMMED], trimmed: 2 })).toBe(
    `용어 1건을 읽지 못해 건너뛰었고, 2건은 링크·태그 등 일부 값을 빼고 읽었어요. ${SKIPPED}`
  )
})
