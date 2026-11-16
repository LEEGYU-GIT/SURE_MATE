/**
 * AI 답에 나온 숫자·날짜·시각·비율·문서 번호 가운데 원문(프롬프트에 넣은 글)에 없는 것(설계 §7-1).
 * 회의록에서 가장 위험한 실수(없던 날짜·수치)를 붙여넣기 전에 알린다. 이 PC 안에서 글자로만 비교한다.
 * - 날짜는 11/18, 11월 18일, 2026-11-18을 같은 것(11/18)으로 본다
 * - 목록 번호(1. 2.)와 한 자리 수는 보지 않는다(AI가 붙이는 번호·단계가 원문에 없는 것은 문제가 아니다)
 */

interface Fact {
  /** 비교 값(같은 뜻이면 같은 문자열) */
  key: string
  /** 알림에 보일 모양(답에 쓰인 그대로) */
  shown: string
}

const DATE_ISO = /(?<!\d)(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?!\d)/g
/** 2026년 11월 18일(연도는 비교하지 않는다) */
const DATE_KO_FULL = /(?<!\d)\d{4}년\s*(\d{1,2})월\s*(\d{1,2})일/g
const DATE_KO = /(?<!\d)(\d{1,2})월\s*(\d{1,2})일/g
const DATE_SLASH = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/g
const YEAR = /(?<!\d)((?:19|20)\d{2})년/g
const TIME = /(?<!\d)(\d{1,2}):(\d{2})(?!\d)/g
const IP = /(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d.])/g
const PERCENT = /(?<![\d.])(\d+(?:\.\d+)?)\s*(%|퍼센트)/g
/** REQ-BRK-010, TC-001, v1.2.3처럼 글자와 숫자가 섞인 번호 */
const CODE =
  /(?<![A-Za-z0-9_-])(?:[A-Za-z]{1,10}[-_])+[A-Za-z]*\d+[A-Za-z0-9-]*|(?<![A-Za-z0-9.])v\d+(?:\.\d+)+/g
/** 가명 처리 표시(IP_1, PATH_2 …)는 번호로 보지 않는다(되돌리지 못한 표시는 가명 되돌리기가 따로 알린다) */
const MASK_TOKEN = /^(IP|PATH|EMAIL|PHONE|URL)[-_]\d+$/i
const NUMBER = /(?<![\d.,])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])|(?<![\d.,])\d+(?:\.\d+)?(?![\d,])/g
const LIST_NUMBER = /^(\s*)\d+[.)]\s/gm

const dateKey = (m: string, d: string): string => `${Number(m)}/${Number(d)}`

/** 글에서 사실 값을 뽑는다. 앞에서 뽑은 자리는 지워 뒤의 규칙(그냥 숫자)이 다시 뽑지 않게 한다 */
function factsOf(text: string): Fact[] {
  const facts: Fact[] = []
  let rest = text.replace(LIST_NUMBER, '$1  ')
  const take = (re: RegExp, key: (m: RegExpExecArray) => string): void => {
    rest = rest.replace(re, (...args: unknown[]) => {
      const m = args.slice(0, -2) as unknown as RegExpExecArray
      facts.push({ key: key(m), shown: String(args[0]).trim() })
      return ' '.repeat(String(args[0]).length)
    })
  }
  take(DATE_ISO, (m) => dateKey(m[2], m[3]))
  take(DATE_KO_FULL, (m) => dateKey(m[1], m[2]))
  take(DATE_KO, (m) => dateKey(m[1], m[2]))
  take(DATE_SLASH, (m) => dateKey(m[1], m[2]))
  take(YEAR, (m) => `${m[1]}년`)
  take(TIME, (m) => `${Number(m[1])}:${m[2]}`)
  take(IP, (m) => m[0])
  take(PERCENT, (m) => `${Number(m[1])}%`)
  take(CODE, (m) => m[0].toUpperCase())
  take(NUMBER, (m) => String(Number(m[0].replace(/,/g, ''))))
  return facts.filter((f) => !MASK_TOKEN.test(f.key))
}

/** 오늘 날짜(연도 포함)를 원문에 더할 때 쓰는 글. 프롬프트의 {{date}}처럼 AI가 받은 날짜는 원문으로 본다 */
export function dateContext(now: Date): string {
  const y = now.getFullYear()
  return `${y}-${now.getMonth() + 1}-${now.getDate()} ${y}년`
}

/** 한 자리 수(0~9)는 보지 않는다 */
const meaningful = (f: Fact): boolean => !/^\d$/.test(f.key)

/**
 * 답(output)에만 있고 원문(source)에 없는 사실 값. 답에 나온 모양으로, 처음 나온 순서대로 limit개까지.
 * 원문에 '92%'만 있고 답에 '92'가 있으면 같은 수로 본다(단위만 빠진 것).
 */
export function unsupportedFacts(output: string, source: string, limit = 5): string[] {
  const src = factsOf(source)
  const keys = new Set(src.map((f) => f.key))
  // 단위만 다른 같은 수(92% ↔ 92)
  for (const f of src) if (f.key.endsWith('%')) keys.add(f.key.slice(0, -1))
  const out: string[] = []
  const seen = new Set<string>()
  for (const f of factsOf(output)) {
    if (
      !meaningful(f) ||
      keys.has(f.key) ||
      (f.key.endsWith('%') && keys.has(f.key.slice(0, -1))) ||
      seen.has(f.key)
    )
      continue
    seen.add(f.key)
    out.push(f.shown)
    if (out.length >= limit) break
  }
  return out
}
