import { isHttpUrl } from '../../../shared/glossary/pack'
import { GLOSSARY_LIMITS as L, type GlossaryEntry, type WikiDraft } from '../../../shared/glossary/types'

/** 용어 추가·수정 화면의 칸(쉼표·줄로 적는 글 그대로) */
export interface WikiForm {
  term: string
  /** 쉼표로 구분 */
  aliases: string
  definition: string
  example: string
  /** 한 줄에 하나: "제목 | 주소" 또는 주소만 */
  links: string
  /** 쉼표로 구분 */
  tags: string
}

const list = (s: string): string[] =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

const count = (n: number): string => n.toLocaleString('ko-KR')

/** 고칠 항목을 폼으로. 새 항목이면 검색어를 용어로 미리 채운다 */
export function entryToForm(entry?: GlossaryEntry, prefillTerm = ''): WikiForm {
  if (!entry) return { term: prefillTerm, aliases: '', definition: '', example: '', links: '', tags: '' }
  return {
    term: entry.term,
    aliases: entry.aliases.join(', '),
    definition: entry.definition,
    example: entry.example ?? '',
    links: entry.links.map((l) => (l.title && l.title !== l.url ? `${l.title} | ${l.url}` : l.url)).join('\n'),
    tags: entry.tags.join(', ')
  }
}

/** 폼을 검사해 보낼 내용으로 바꾼다(설계 문서 §9 제한). 틀리면 사람이 읽을 까닭을 errors에 */
export function formToDraft(form: WikiForm): { draft?: WikiDraft; errors: string[] } {
  const errors: string[] = []
  const term = form.term.trim()
  if (!term) errors.push('용어를 적어 주세요')
  else if (term.length > L.term) errors.push(`용어는 ${L.term}자까지예요`)
  const definition = form.definition.trim()
  if (!definition) errors.push('설명을 적어 주세요')
  else if (definition.length > L.definition) errors.push(`설명은 ${count(L.definition)}자까지예요(지금 ${count(definition.length)}자)`)
  const example = form.example.trim()
  if (example.length > L.example) errors.push(`사용 예는 ${L.example}자까지예요`)

  const aliases = list(form.aliases)
  if (aliases.length > L.aliases || aliases.some((a) => a.length > L.alias)) errors.push(`별칭은 ${L.aliases}개, 하나에 ${L.alias}자까지예요`)
  const tags = list(form.tags)
  if (tags.length > L.tags) errors.push(`태그는 ${L.tags}개까지예요`)

  const links = form.links
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const bar = line.lastIndexOf('|')
      const url = (bar >= 0 ? line.slice(bar + 1) : line).trim()
      const title = (bar >= 0 ? line.slice(0, bar) : '').trim()
      return { title: title || url, url }
    })
  if (links.length > L.links) errors.push(`링크는 ${L.links}개까지예요`)
  if (links.some((l) => !isHttpUrl(l.url))) errors.push('링크는 http:// 또는 https:// 주소만 넣을 수 있어요')

  if (errors.length) return { errors }
  return { draft: { term, aliases, definition, ...(example ? { example } : {}), links, tags }, errors }
}
