import { resolveOverlaps } from './detections'
import type { Detection, MaskCategory } from './types'

// 패턴으로 찾는 가릴 대상: IP, 경로, 이메일, 전화번호, 사내 URL(설계 문서 §8 분류별 켜기/끄기)

const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9'
const isAlnum = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z0-9]/.test(ch)
const TRAILING_PUNCT = /[.,;:)\]]+$/

function detection(category: MaskCategory, text: string, start: number, end: number, keyOf: (original: string) => string): Detection {
  const original = text.slice(start, end)
  return { start, end, category, original, key: `${category}:${keyOf(original)}` }
}

// ── IP ──────────────────────────────────────────────
const IPV4 = /\d{1,3}(?:\.\d{1,3}){3}/g
const IP_SUFFIX = /^(?:\/(\d{1,2})|:(\d{1,5}))(?![0-9])/

function findIps(text: string): Detection[] {
  const out: Detection[] = []
  for (const m of text.matchAll(IPV4)) {
    const start = m.index ?? 0
    let end = start + m[0].length
    const before = text[start - 1]
    if (isAlnum(before) || before === '.') continue
    const after = text[end]
    if (isAlnum(after) || (after === '.' && isDigit(text[end + 1]))) continue
    if (!m[0].split('.').every((octet) => Number(octet) <= 255)) continue
    const suffix = IP_SUFFIX.exec(text.slice(end))
    if (suffix) {
      const valid = suffix[1] !== undefined ? Number(suffix[1]) <= 32 : Number(suffix[2]) >= 1 && Number(suffix[2]) <= 65535
      if (valid) end += suffix[0].length
    }
    out.push(detection('ip', text, start, end, (s) => s))
  }
  return out
}

// ── 경로 ─────────────────────────────────────────────
const QUOTED_PATH = /"((?:[A-Za-z]:\\|\\\\)[^"\r\n]+)"/g
const DRIVE_PATH = /[A-Za-z]:\\[^\s"'<>|*?]*/g
const UNC_PATH = /\\\\[A-Za-z0-9._$-]+\\[^\s"'<>|*?]*/g
/** 경로 끝 세그먼트에 붙어 오는 조사(긴 것부터) */
const PATH_PARTICLES = ['에서는', '에서도', '에서', '에는', '에도', '에게', '으로', '까지', '부터', '하고', '이랑', '에', '의', '은', '는', '을', '를', '이', '가', '로', '와', '과', '도', '만', '랑']

/** 경로 뒤에 붙은 문장부호와 조사를 뗀다. 한글 폴더·파일 이름은 그대로 둔다 */
function trimPathTail(path: string): string {
  const s = path.replace(TRAILING_PUNCT, '')
  const sep = s.lastIndexOf('\\')
  const segment = s.slice(sep + 1)
  const extThenHangul = /^(.*\.[A-Za-z0-9]{1,6})[가-힣]+$/.exec(segment)
  if (extThenHangul) return s.slice(0, sep + 1) + extThenHangul[1]
  const tail = /[가-힣]+$/.exec(segment)?.[0]
  if (tail && tail.length < segment.length) {
    const particle = PATH_PARTICLES.find((p) => tail === p)
    if (particle) return s.slice(0, s.length - particle.length)
  }
  return s
}

function findPaths(text: string): Detection[] {
  const out: Detection[] = []
  const pathKey = (s: string): string => s.toLowerCase()
  for (const m of text.matchAll(QUOTED_PATH)) {
    const start = (m.index ?? 0) + 1
    out.push(detection('path', text, start, start + m[1].length, pathKey))
  }
  for (const re of [DRIVE_PATH, UNC_PATH]) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0
      if (re === DRIVE_PATH && isAlnum(text[start - 1])) continue
      const trimmed = trimPathTail(m[0])
      if (trimmed.length <= 3) continue
      out.push(detection('path', text, start, start + trimmed.length, pathKey))
    }
  }
  return out
}

// ── 이메일 ───────────────────────────────────────────
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g

function findEmails(text: string): Detection[] {
  const out: Detection[] = []
  for (const m of text.matchAll(EMAIL)) {
    const start = m.index ?? 0
    out.push(detection('email', text, start, start + m[0].length, (s) => s.toLowerCase()))
  }
  return out
}

// ── 전화번호 ──────────────────────────────────────────
const PHONES = [
  /\+82[-\s]?(?:0?1[016789]|0?2|0?[3-6][1-5]|0?70)[-\s]?\d{3,4}[-\s]?\d{4}/g,
  /01[016789]-?\d{3,4}-?\d{4}/g,
  /02[-\s]\d{3,4}[-\s]\d{4}/g,
  /0[3-6][1-5][-\s]\d{3,4}[-\s]\d{4}/g,
  /0(?:70|50\d)[-\s]\d{3,4}[-\s]\d{4}/g,
  /1[568]\d{2}-\d{4}/g
]

/** 숫자만 남기고 +82는 0으로(같은 번호를 같은 키로) */
function phoneKey(s: string): string {
  const digits = s.replace(/\D/g, '')
  return s.trim().startsWith('+82') ? `0${digits.slice(2).replace(/^0/, '')}` : digits
}

function findPhones(text: string): Detection[] {
  const out: Detection[] = []
  for (const re of PHONES) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0
      const end = start + m[0].length
      if (isDigit(text[start - 1]) || isDigit(text[end])) continue
      if (!m[0].startsWith('+') && text[start - 1] === '+') continue
      out.push(detection('phone', text, start, end, phoneKey))
    }
  }
  return out
}

// ── 사내 URL ─────────────────────────────────────────
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function findInternalUrls(text: string, domains: string[]): Detection[] {
  const out: Detection[] = []
  for (const raw of domains) {
    const domain = raw.trim().toLowerCase().replace(/^\.+/, '')
    if (!domain) continue
    const re = new RegExp(`(?:https?:\\/\\/)?(?:[a-z0-9-]+\\.)*${escapeRegExp(domain)}(?::\\d{1,5})?(?:\\/[^\\s"'<>가-힣]*)?`, 'gi')
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0
      const before = text[start - 1]
      if (isAlnum(before) || before === '.' || before === '-' || before === '@') continue
      const value = m[0].replace(TRAILING_PUNCT, '')
      const end = start + value.length
      const after = text[end]
      if (isAlnum(after) || after === '-' || (after === '.' && isAlnum(text[end + 1]))) continue
      out.push(detection('url', text, start, end, (s) => s.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')))
    }
  }
  return out
}

/** 글에서 패턴 분류(IP·경로·이메일·전화번호·사내 URL)를 찾는다. 겹치면 먼저 시작한 것, 시작 위치 순 */
export function findPatterns(text: string, o: { internalDomains: string[] }): Detection[] {
  return resolveOverlaps(findAllPatterns(text, o))
}

/**
 * 겹침 정리 전의 패턴 찾기 결과 전부(경로 안의 IP 등 겹친 것도 남긴다).
 * 분류를 끄면 그 분류만 원문으로 남게, 가명 처리 서비스는 분류를 먼저 거르고 겹침을 정리한다.
 */
export function findAllPatterns(text: string, o: { internalDomains: string[] }): Detection[] {
  return [...findIps(text), ...findPaths(text), ...findEmails(text), ...findPhones(text), ...findInternalUrls(text, o.internalDomains)]
}
