import { GLOSSARY_FORMAT, normalizedKey } from './pack'
import type { GlossaryEntry } from './types'

// 용어 팩 나누기(설계 문서 §9): 내보내기·가져오기 미리 보기·합치기

export interface ImportPreview {
  /** 새 id, 같은 이름 없음 */
  added: number
  /** 같은 id인데 가져온 쪽이 더 새로움 */
  changed: number
  /** 새 id인데 정규화 키가 같은 용어가 이미 있음(둘 다 둔다) */
  sameName: number
  /** 같은 id인데 가져온 쪽이 같거나 오래됨 */
  unchanged: number
}

type Kind = keyof ImportPreview

const newer = (a: string, b: string): boolean => Date.parse(a) > Date.parse(b)

/**
 * 가져온 항목 하나가 지금 용어와 어떤 관계인지 가르는 함수. 지금 용어의 id 표와 정규화 키 모음은 한 번만 만든다
 * (항목마다 지금 용어 전체의 키를 다시 계산하면 2,000개끼리 비교에 몇 초씩 걸려 main이 멈춘다).
 */
function classifier(current: GlossaryEntry[]): (e: GlossaryEntry) => Kind {
  const byId = new Map(current.map((c) => [c.id, c]))
  const keys = new Set(current.map((c) => normalizedKey(c.term)))
  return (e) => {
    const same = byId.get(e.id)
    if (same) return newer(e.updatedAt, same.updatedAt) ? 'changed' : 'unchanged'
    return keys.has(normalizedKey(e.term)) ? 'sameName' : 'added'
  }
}

/** 가져올 항목을 지금 용어(기본 팩 + 내 용어)와 비교해 센다 */
export function previewImport(current: GlossaryEntry[], incoming: GlossaryEntry[]): ImportPreview {
  const out: ImportPreview = { added: 0, changed: 0, sameName: 0, unchanged: 0 }
  const classify = classifier(current)
  for (const e of incoming) out[classify(e)]++
  return out
}

/**
 * 가져온 항목을 사용자 파일 목록에 합친다. 같은 id는 updatedAt이 새로운 쪽, 다른 id인데 이름이 같으면 둘 다 둔다.
 * 가져와 들어간 항목은 출처를 imported로 둔다. 기본 팩 항목이 바뀌면 같은 id의 사용자본으로 들어간다.
 */
export function mergeImport(userEntries: GlossaryEntry[], current: GlossaryEntry[], incoming: GlossaryEntry[]): GlossaryEntry[] {
  const next = [...userEntries]
  const classify = classifier(current)
  for (const e of incoming) {
    const kind = classify(e)
    if (kind === 'unchanged') continue
    const imported: GlossaryEntry = { ...e, source: 'imported' }
    const at = next.findIndex((x) => x.id === e.id)
    if (at >= 0) next[at] = imported
    else next.push(imported)
  }
  return next
}

/** 내보낼 팩 글. 기본 팩 용어는 넣지 않는다(설계 문서 §9: 기본은 내가 추가·수정한 것) */
export function exportPack(entries: GlossaryEntry[], exportedAt: string): string {
  return JSON.stringify({ format: GLOSSARY_FORMAT, version: 1, exportedAt, entries: entries.filter((e) => e.source !== 'builtin') }, null, 2)
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** 내보낼 파일 이름(설계 문서 §9) */
export const packFileName = (d: Date): string => `sure-mate-용어팩-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.json`
