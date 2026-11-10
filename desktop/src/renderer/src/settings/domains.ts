import { isInternalDomain } from '../../../shared/settings/settings'

/** 사내 도메인 입력(쉼표·공백·줄바꿈으로 나눔)을 소문자 목록으로. 겹치면 하나만, 도메인이 아닌 것은 invalid로 따로 */
export function parseDomainsInput(text: string): { domains: string[]; invalid: string[] } {
  const domains: string[] = []
  const invalid: string[] = []
  for (const raw of text.split(/[\s,]+/)) {
    const x = raw.trim().toLowerCase()
    if (!x) continue
    if (!isInternalDomain(x)) invalid.push(raw.trim())
    else if (!domains.includes(x)) domains.push(x)
  }
  return { domains, invalid }
}
