import type { Template, TemplateMasking } from './types'

/** 템플릿 팩 파일 형식: { format, version, templates } */
export const PACK_FORMAT = 'sure-mate-templates'

const ID = /^[a-z0-9][a-z0-9.-]{0,63}$/
const MASKINGS: readonly TemplateMasking[] = ['default', 'off', 'restore', 'remove']
const MAX_NAME = 40
const MAX_BODY = 20000

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined)

/** 템플릿 하나를 검사한다. 틀리면 이유 문자열 */
function parseTemplate(v: unknown, scope: Template['scope']): Template | string {
  if (!isObj(v)) return '객체가 아님'
  const id = v.id
  if (typeof id !== 'string' || !ID.test(id)) return `id 형식이 틀림(${String(id)})`
  const name = typeof v.name === 'string' ? v.name.trim() : ''
  if (!name) return `이름이 없음(${id})`
  if ([...name].length > MAX_NAME) return `이름이 ${MAX_NAME}자를 넘음(${id})`
  const kind = v.kind === 'prompt' || v.kind === 'snippet' ? v.kind : null
  if (!kind) return `kind는 prompt 또는 snippet이어야 함(${id})`
  const body = typeof v.body === 'string' ? v.body : ''
  if (!body.trim()) return `본문이 없음(${id})`
  if (body.length > MAX_BODY) return `본문이 ${MAX_BODY}자를 넘음(${id})`
  if (v.masking !== undefined && !MASKINGS.includes(v.masking as TemplateMasking)) return `masking 값이 틀림(${id})`
  const aliases = Array.isArray(v.aliases) ? v.aliases.filter((a): a is string => typeof a === 'string' && a.trim() !== '') : []
  return {
    id,
    name,
    aliases,
    kind,
    group: optStr(v.group),
    description: optStr(v.description),
    body,
    masking: v.masking as TemplateMasking | undefined,
    aiTarget: optStr(v.aiTarget),
    scope
  }
}

/** 팩을 검사해 올바른 템플릿만 돌려주고, 건너뛴 이유를 errors에 남긴다. scope는 불러온 곳이 정한다. */
export function parseTemplatePack(raw: unknown, scope: Template['scope']): { templates: Template[]; errors: string[] } {
  if (!isObj(raw) || raw.format !== PACK_FORMAT || !Array.isArray(raw.templates)) {
    return { templates: [], errors: [`템플릿 팩 형식이 아니에요(format "${PACK_FORMAT}"와 templates 목록이 필요)`] }
  }
  const templates: Template[] = []
  const errors: string[] = []
  raw.templates.forEach((item, i) => {
    const parsed = parseTemplate(item, scope)
    if (typeof parsed === 'string') errors.push(`${i + 1}번째 템플릿: ${parsed}`)
    else templates.push(parsed)
  })
  return { templates, errors }
}
