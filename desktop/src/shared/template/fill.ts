import type { FillContext, FillResult } from './types'

/** {{이름}} 또는 {{이름:값}}. 중괄호 안 앞뒤 공백 허용 */
const PLACEHOLDER = /\{\{\s*([a-z]+)(?::([^}]*))?\s*\}\}/g
const HAS_SELECTION = /\{\{\s*selection\s*\}\}/
const TERMS_LINE = /\{\{\s*terms\s*\}\}/
const REFERENCE_IN_LINE = /\{\{\s*reference:([^}]*)\}\}/

export const TERMS_HEADING = '다음은 우리 회사에서 쓰는 용어 뜻입니다.'

const pad2 = (n: number): string => String(n).padStart(2, '0')
const formatDate = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const formatTime = (d: Date): string => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`

/**
 * 템플릿 본문의 자리표시자를 한 번에 채운다(설계 문서 §7).
 * 넣은 글 안의 {{…}}는 다시 채우지 않고, 모르는 자리표시자는 그대로 두고 경고한다.
 * 넣을 용어가 없는 {{terms}} 줄과 기준 예시가 없는 {{reference:종류}} 줄은 통째로 뺀다.
 */
export function fillTemplate(body: string, ctx: FillContext): FillResult {
  const warnings: string[] = []
  const normalized = body.replace(/\r\n?/g, '\n')
  if (!HAS_SELECTION.test(normalized)) warnings.push('이 템플릿에는 {{selection}} 자리가 없어 입력한 글이 들어가지 않아요')

  const terms = TERMS_LINE.test(normalized) ? ctx.terms(ctx.input) : []
  const references = new Map<string, string | null>()
  const referenceOf = (kind: string): string | null => {
    if (!references.has(kind)) references.set(kind, ctx.reference(kind))
    return references.get(kind) ?? null
  }

  const lines = normalized.split('\n').filter((line) => {
    if (TERMS_LINE.test(line) && terms.length === 0) return false
    const ref = REFERENCE_IN_LINE.exec(line)
    if (ref) {
      const kind = ref[1].trim()
      if (referenceOf(kind) === null) {
        warnings.push(`기준 예시(${kind})가 없어 그 줄을 뺐어요. 설정에서 추가하면 결과가 회사 양식에 더 가까워져요`)
        return false
      }
    }
    return true
  })

  const text = lines.join('\n').replace(PLACEHOLDER, (whole, name: string, arg: string | undefined) => {
    switch (name) {
      case 'selection':
        return ctx.input
      case 'clipboard':
        return ctx.clipboard
      case 'date':
        return formatDate(ctx.now)
      case 'time':
        return formatTime(ctx.now)
      case 'terms':
        return [TERMS_HEADING, ...terms.map((t) => `- ${t.term}: ${t.definition}`)].join('\n')
      case 'reference':
        if (arg !== undefined) return referenceOf(arg.trim()) ?? ''
        break
    }
    warnings.push(`알 수 없는 자리표시자: ${whole}`)
    return whole
  })

  return { text, warnings }
}
