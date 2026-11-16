import { withObjectParticle } from '../josa'
import type { FillContext, FillResult } from './types'

/** {{이름}} 또는 {{이름:값}}. 중괄호 안 앞뒤 공백 허용 */
const PLACEHOLDER = /\{\{\s*([a-z]+)(?::([^}]*))?\s*\}\}/g
const HAS_SELECTION = /\{\{\s*selection\s*\}\}/
const TERMS_LINE = /\{\{\s*terms\s*\}\}/
/** 줄에서 뺄 때는 앞 공백과 함께 */
const TERMS_TOKEN = /[ \t]*\{\{\s*terms\s*\}\}/g
const REFERENCE_TOKEN = /[ \t]*\{\{\s*reference:([^}]*)\}\}/g
const STYLE_TOKEN = /[ \t]*\{\{\s*style:([^}]*)\}\}/g
/** 넣는 글이 들어가는 자리. 이런 줄은 통째로 빼지 않는다 */
const INPUT_IN_LINE = /\{\{\s*(selection|clipboard)\s*\}\}/

export const TERMS_HEADING = '다음은 우리 회사에서 쓰는 용어 뜻입니다.'

const pad2 = (n: number): string => String(n).padStart(2, '0')
const formatDate = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const formatTime = (d: Date): string => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`

/**
 * 템플릿 본문의 자리표시자를 한 번에 채운다(설계 문서 §7).
 * 넣은 글 안의 {{…}}는 다시 채우지 않고, 모르는 자리표시자는 그대로 두고 경고한다.
 * 넣을 용어가 없는 {{terms}} 줄, 기준 예시가 없는 {{reference:종류}} 줄, 내 말투 견본이 없는 {{style:종류}} 줄은 통째로 뺀다.
 * 다만 그 줄에 {{selection}}·{{clipboard}}가 같이 있으면 넣은 글까지 사라지므로 그 자리표시자만 뺀다.
 */
export function fillTemplate(body: string, ctx: FillContext): FillResult {
  const warnings: string[] = []
  const notes: string[] = []
  const inputRanges: [number, number][] = []
  const normalized = body.replace(/\r\n?/g, '\n')
  if (!HAS_SELECTION.test(normalized)) warnings.push('이 템플릿에는 {{selection}} 자리가 없어 입력한 글이 들어가지 않아요')

  const terms = TERMS_LINE.test(normalized) ? ctx.terms(ctx.input) : []
  const references = new Map<string, string | null>()
  const referenceOf = (kind: string): string | null => {
    if (!references.has(kind)) references.set(kind, ctx.reference(kind))
    return references.get(kind) ?? null
  }

  const styles = new Map<string, string | null>()
  const styleOf = (kind: string): string | null => {
    if (!styles.has(kind)) styles.set(kind, ctx.style ? ctx.style(kind) : null)
    return styles.get(kind) ?? null
  }

  const missingKinds = new Set<string>()
  const missingStyles = new Set<string>()
  const lines: string[] = []
  for (const raw of normalized.split('\n')) {
    let emptied = false
    let line = terms.length === 0 ? raw.replace(TERMS_TOKEN, () => ((emptied = true), '')) : raw
    line = line.replace(REFERENCE_TOKEN, (whole: string, kind: string) => {
      const k = kind.trim()
      if (referenceOf(k) !== null) return whole
      missingKinds.add(k)
      emptied = true
      return ''
    })
    line = line.replace(STYLE_TOKEN, (whole: string, kind: string) => {
      const k = kind.trim()
      if (styleOf(k) !== null) return whole
      missingStyles.add(k)
      emptied = true
      return ''
    })
    if (!emptied) lines.push(raw)
    else if (INPUT_IN_LINE.test(raw)) lines.push(line)
  }
  for (const kind of missingKinds) notes.push(`기준 예시(${kind})를 넣어 두면 결과가 회사 양식에 더 가까워져요`)
  for (const kind of missingStyles) notes.push(`내가 쓴 ${withObjectParticle(kind)} '내 말투로 등록'해 두면 AI 답이 내 말투에 가까워져요`)
  // 줄을 빼면 앞뒤 빈 줄이 겹치므로, 템플릿의 빈 줄 겹침은 하나로 줄인다(넣는 글은 아직 들어가기 전이라 영향 없음)
  const tidy = lines.filter((line, i) => !(line.trim() === '' && i > 0 && lines[i - 1].trim() === ''))

  const replacement = (whole: string, name: string, arg: string | undefined): string => {
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
      case 'style':
        if (arg !== undefined) return styleOf(arg.trim()) ?? ''
        break
    }
    warnings.push(`알 수 없는 자리표시자: ${whole}`)
    return whole
  }

  // 왼쪽부터 차례로 바꾸며, 앞에서 늘거나 준 길이(shift)를 더해 넣은 글의 결과 위치를 기록한다
  let shift = 0
  const text = tidy.join('\n').replace(PLACEHOLDER, (whole: string, name: string, arg: string | undefined, offset: number) => {
    const out = replacement(whole, name, arg)
    if (name === 'selection') inputRanges.push([offset + shift, offset + shift + out.length])
    shift += out.length - whole.length
    return out
  })

  return { text, warnings, notes, inputRanges }
}
